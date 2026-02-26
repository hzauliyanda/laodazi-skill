#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

// Import from Baijiahao skill
const BAIJIAHAO_SKILL_DIR = '/Users/liyanda/.claude/skills/laodazi-post-to-baijiahao';
const WECHAT_SKILL_DIR = '/Users/liyanda/.claude/skills/laodazi-post-to-wechat';

// Dynamic imports for TypeScript modules
async function importBaijiahaoModules() {
  const parserModule = await import(BAIJIAHAO_SKILL_DIR + '/scripts/shared/markdown-parser.js');
  const cdpModule = await import(BAIJIAHAO_SKILL_DIR + '/scripts/shared/cdp.js');
  const adapterModule = await import(BAIJIAHAO_SKILL_DIR + '/scripts/platforms/baijiahao-adapter.js');
  return {
    parseMarkdownForMultiPlatform: parserModule.parseMarkdownForMultiPlatform,
    launchChrome: cdpModule.launchChrome,
    getPageSession: cdpModule.getPageSession,
    evaluate: cdpModule.evaluate,
    sleep: cdpModule.sleep,
    clickElement: cdpModule.clickElement,
    waitForElement: cdpModule.waitForElement,
    BaijiahaoAdapter: adapterModule.BaijiahaoAdapter,
  };
}

function printUsage() {
  console.log(`
Publish article to both Baijiahao (百家号) and WeChat Official Account (微信公众号)

Usage:
  npx -y bun publish-to-both.ts <markdown_file> [options]

Options:
  --submit              Submit for publication (default: save as draft)
  --profile <path>      Custom Chrome profile directory
  --wechat-theme <name> WeChat theme (default, grace, simple)
  --help                Show this help

Examples:
  # Save as draft on both platforms
  npx -y bun publish-to-both.ts article.md

  # Publish to both platforms
  npx -y bun publish-to-both.ts article.md --submit

  # Use grace theme for WeChat
  npx -y bun publish-to-both.ts article.md --wechat-theme grace
`);
  process.exit(0);
}

// WeChat publishing functions
async function waitForLogin(session, timeoutMs = 120000) {
  const { evaluate, sleep } = await importBaijiahaoModules();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = await evaluate(session, 'window.location.href');
    if (url.includes('/cgi-bin/home')) return true;
    await sleep(2000);
  }
  return false;
}

async function clickMenuByText(session, text) {
  const { evaluate, sleep } = await importBaijiahaoModules();
  console.log(`[wechat] Clicking "${text}" menu...`);
  const posResult = await session.cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        const items = document.querySelectorAll('.new-creation__menu .new-creation__menu-item');
        for (const item of items) {
          const title = item.querySelector('.new-creation__menu-title');
          if (title && title.textContent?.trim() === '${text}') {
            item.scrollIntoView({ block: 'center' });
            const rect = item.getBoundingClientRect();
            return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
          }
        }
        return 'null';
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });

  if (posResult.result.value === 'null') throw new Error(`Menu "${text}" not found`);
  const pos = JSON.parse(posResult.result.value);

  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
  await sleep(100);
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
}

async function copyImageToClipboard(imagePath) {
  const copyScript = path.join(WECHAT_SKILL_DIR, 'scripts/copy-to-clipboard.ts');
  const result = spawnSync('npx', ['-y', 'bun', copyScript, 'image', imagePath], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Failed to copy image: ${imagePath}`);
}

async function pasteFromClipboardInEditor() {
  if (process.platform === 'darwin') {
    spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
  } else {
    spawnSync('xdotool', ['key', 'ctrl+v']);
  }
  const { sleep } = await importBaijiahaoModules();
  await sleep(1000);
}

async function copyHtmlFromBrowser(cdp, htmlFilePath) {
  const { sleep } = await importBaijiahaoModules();
  const absolutePath = path.isAbsolute(htmlFilePath) ? htmlFilePath : path.resolve(process.cwd(), htmlFilePath);
  const fileUrl = `file://${absolutePath}`;

  console.log(`[wechat] Opening HTML file in new tab: ${fileUrl}`);

  const { targetId } = await cdp.send('Target.createTarget', { url: fileUrl });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  await cdp.send('Page.enable', {}, { sessionId });
  await cdp.send('Runtime.enable', {}, { sessionId });
  await sleep(2000);

  console.log('[wechat] Selecting #output content...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        const output = document.querySelector('#output') || document.body;
        const range = document.createRange();
        range.selectNodeContents(output);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      })()
    `,
    returnByValue: true,
  }, { sessionId });
  await sleep(300);

  console.log('[wechat] Copying with system Cmd+C...');
  if (process.platform === 'darwin') {
    spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down']);
  } else {
    spawnSync('xdotool', ['key', 'ctrl+c']);
  }
  await sleep(1000);

  console.log('[wechat] Closing HTML tab...');
  await cdp.send('Target.closeTarget', { targetId });
}

async function parseMarkdownForWechat(markdownPath, theme) {
  const mdToWechatScript = path.join(WECHAT_SKILL_DIR, 'scripts/md-to-wechat.ts');
  const args = ['-y', 'bun', mdToWechatScript, markdownPath];
  if (theme) args.push('--theme', theme);

  const result = spawnSync('npx', args, { stdio: ['inherit', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    throw new Error(`Failed to parse markdown: ${stderr}`);
  }

  const output = result.stdout.toString();
  return JSON.parse(output);
}

async function selectAndReplacePlaceholder(session, placeholder) {
  const result = await session.cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        const editorSelectors = ['.ProseMirror', '.weui-edu-editor-container', '[contenteditable="true"]'];
        let editor = null;

        for (const selector of editorSelectors) {
          editor = document.querySelector(selector);
          if (editor) break;
        }

        if (!editor) return false;

        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while ((node = walker.nextNode())) {
          const text = node.textContent || '';
          const idx = text.indexOf(${JSON.stringify(placeholder)});
          if (idx !== -1) {
            node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + ${placeholder.length});
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return true;
          }
        }
        return false;
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });

  return result.result.value;
}

async function pressDeleteKey(session) {
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId: session.sessionId });
  const { sleep } = await importBaijiahaoModules();
  await sleep(50);
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId: session.sessionId });
}

async function publishToWechat(markdownPath, cdp, theme, submit) {
  const { getPageSession, evaluate, sleep, clickElement, waitForElement } = await importBaijiahaoModules();
  
  console.log('[wechat] Parsing markdown for WeChat...');
  const parsed = await parseMarkdownForWechat(markdownPath, theme);
  console.log(`[wechat] Title: ${parsed.title || '(empty)'}`);
  console.log(`[wechat] Author: ${parsed.author || '(empty)'}`);
  console.log(`[wechat] Summary: ${parsed.summary || '(empty)'}`);
  console.log(`[wechat] Found ${parsed.contentImages.length} images to insert`);

  const WECHAT_URL = 'https://mp.weixin.qq.com/';
  
  // Open WeChat in new tab
  console.log('[wechat] Opening WeChat...');
  const { targetId } = await cdp.send('Target.createTarget', { url: WECHAT_URL });
  await sleep(3000);
  
  let session = await getPageSession(cdp, 'mp.weixin.qq.com');
  
  const url = await evaluate(session, 'window.location.href');
  if (!url.includes('/cgi-bin/home')) {
    console.log('[wechat] Not logged in. Please scan QR code...');
    const loggedIn = await waitForLogin(session);
    if (!loggedIn) throw new Error('Login timeout');
  }
  console.log('[wechat] Logged in.');
  await sleep(2000);

  const targets = await cdp.send('Target.getTargets');
  const initialIds = new Set(targets.targetInfos.map((t) => t.targetId));

  await clickMenuByText(session, '文章');
  await sleep(3000);

  const editorTargetId = await waitForNewTab(cdp, initialIds);
  console.log('[wechat] Editor tab opened.');

  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: editorTargetId, flatten: true });
  session = { cdp, sessionId, targetId: editorTargetId };

  await cdp.send('Page.enable', {}, { sessionId });
  await cdp.send('Runtime.enable', {}, { sessionId });
  await cdp.send('DOM.enable', {}, { sessionId });

  await sleep(5000);

  // Click on editor and paste content BEFORE filling title
  console.log('[wechat] Clicking on editor...');
  
  let editorClicked = false;
  const editorSelectors = [
    '.ProseMirror',
    '.weui-edu-editor-container',
    '[contenteditable="true"]',
    '#edui1_iframeholder iframe',
    '.editor-content'
  ];

  for (const selector of editorSelectors) {
    try {
      await clickElement(session, selector);
      console.log(`[wechat] Successfully clicked editor with selector: ${selector}`);
      editorClicked = true;
      await sleep(1000);
      break;
    } catch (e) {
      console.log(`[wechat] Selector ${selector} failed, trying next...`);
      await sleep(500);
    }
  }

  if (!editorClicked) {
    console.warn('[wechat] Warning: Could not click editor directly, continuing...');
  }

  await sleep(1000);

  console.log(`[wechat] Copying HTML content from: ${parsed.htmlPath}`);
  await copyHtmlFromBrowser(cdp, parsed.htmlPath);
  await sleep(500);
  console.log('[wechat] Pasting into editor...');
  await pasteFromClipboardInEditor();
  await sleep(3000);

  if (parsed.contentImages.length > 0) {
    console.log(`[wechat] Inserting ${parsed.contentImages.length} images...`);
    for (let i = 0; i < parsed.contentImages.length; i++) {
      const img = parsed.contentImages[i];
      console.log(`[wechat] [${i + 1}/${parsed.contentImages.length}] Processing: ${img.placeholder}`);

      const found = await selectAndReplacePlaceholder(session, img.placeholder);
      if (!found) {
        console.warn(`[wechat] Placeholder not found: ${img.placeholder}`);
        continue;
      }

      await sleep(500);

      console.log(`[wechat] Copying image: ${path.basename(img.localPath)}`);
      await copyImageToClipboard(img.localPath);
      await sleep(300);

      console.log('[wechat] Deleting placeholder with Backspace...');
      await pressDeleteKey(session);
      await sleep(200);

      console.log('[wechat] Pasting image...');
      await pasteFromClipboardInEditor();
      await sleep(3000);
    }
    console.log('[wechat] All images inserted.');
  }

  // Fill title and author AFTER content is pasted
  if (parsed.title) {
    console.log('[wechat] Filling title...');
    await evaluate(session, `document.querySelector('#title').value = ${JSON.stringify(parsed.title)}; document.querySelector('#title').dispatchEvent(new Event('input', { bubbles: true }));`);
  }

  if (parsed.author) {
    console.log('[wechat] Filling author...');
    await evaluate(session, `document.querySelector('#author').value = ${JSON.stringify(parsed.author)}; document.querySelector('#author').dispatchEvent(new Event('input', { bubbles: true }));`);
  }

  if (parsed.summary) {
    console.log(`[wechat] Filling summary: ${parsed.summary}`);
    await evaluate(session, `document.querySelector('#js_description').value = ${JSON.stringify(parsed.summary)}; document.querySelector('#js_description').dispatchEvent(new Event('input', { bubbles: true }));`);
  }

  console.log('[wechat] Saving as draft...');
  await evaluate(session, `document.querySelector('#js_submit button').click()`);
  await sleep(3000);

  const saved = await evaluate(session, `!!document.querySelector('.weui-desktop-toast')`);
  if (saved) {
    console.log('[wechat] Draft saved successfully!');
  } else {
    console.log('[wechat] Waiting for save confirmation...');
    await sleep(5000);
  }
}

async function waitForNewTab(cdp, initialIds, domain = 'mp.weixin.qq.com') {
  const { sleep } = await importBaijiahaoModules();
  const start = Date.now();
  const timeout = 30000;
  
  while (Date.now() - start < timeout) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    for (const target of targetInfos) {
      if (!initialIds.has(target.targetId) && target.url?.includes(domain)) {
        return target.targetId;
      }
    }
    await sleep(500);
  }
  throw new Error('No new tab detected');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  let markdownPath;
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--submit') {
      options.submit = true;
    } else if (arg === '--profile' && args[i + 1]) {
      options.profileDir = args[++i];
    } else if (arg === '--wechat-theme' && args[i + 1]) {
      options.wechatTheme = args[++i];
    } else if (!arg.startsWith('-')) {
      markdownPath = arg;
    }
  }

  if (!markdownPath) {
    console.error('Error: Markdown file path required');
    process.exit(1);
  }

  if (!fs.existsSync(markdownPath)) {
    console.error(`Error: File not found: ${markdownPath}`);
    process.exit(1);
  }

  try {
    // Import modules
    const { parseMarkdownForMultiPlatform, BaijiahaoAdapter, launchChrome, getPageSession, evaluate, sleep } = await importBaijiahaoModules();

    // Parse markdown
    console.log('[multi-platform] Parsing markdown file...');
    const markdown = await parseMarkdownForMultiPlatform(markdownPath);
    console.log(`[multi-platform] Title: ${markdown.title}`);
    console.log(`[multi-platform] Images: ${markdown.contentImages.length}`);

    // Initialize Baijiahao adapter (this will launch the browser)
    console.log('\n========== BAIJIAHAO ==========');
    const adapter = new BaijiahaoAdapter();
    await adapter.initialize(options);

    // Store CDP connection for WeChat
    const cdp = adapter.cdp?.cdp;

    try {
      // Publish to Baijiahao
      const result = await adapter.publish(markdown, options);

      if (result.success) {
        if (result.preview) {
          console.log('[baijiahao] ✓ Article created as draft/preview');
        } else {
          console.log('[baijiahao] ✓ Article published successfully');
        }
      } else {
        console.error(`[baijiahao] ✗ Failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`[baijiahao] Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Publish to WeChat
    console.log('\n========== WECHAT ==========');
    try {
      await publishToWechat(markdownPath, cdp, options.wechatTheme, options.submit);
      console.log('[wechat] ✓ Article created as draft');
    } catch (error) {
      console.error(`[wechat] Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Cleanup
    console.log('\n[multi-platform] Cleaning up...');
    await adapter.cleanup();
    console.log('[multi-platform] ✓ Done!');
    
  } catch (error) {
    console.error(`[multi-platform] Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

await main();
