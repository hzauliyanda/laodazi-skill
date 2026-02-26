#!/usr/bin/env bun
/**
 * Netease publisher with MdNice formatting
 * Uses MdNice.com to convert markdown to beautifully formatted rich text
 */

import { launchChrome, getPageSession, sleep, evaluate, clickElement } from './shared/cdp.js';
import { parseMarkdownForMultiPlatform } from './shared/markdown-parser.js';
import type { PublishOptions } from './shared/types.js';

const NETEASE_URL = 'http://mp.163.com/subscribe_v4/index.html#/home';
const MDNICE_URL = 'https://www.mdnice.com/';

async function publishToNeteaseWithMdNice(markdownPath: string, options?: PublishOptions) {
  console.log('[publish-netease-mdnice] Starting publish with MdNice formatting...');

  // Parse markdown
  const markdown = await parseMarkdownForMultiPlatform(markdownPath);
  console.log('[publish-netease-mdnice] Title:', markdown.title);
  console.log('[publish-netease-mdnice] Images:', markdown.contentImages.length);

  // Read original markdown content
  const fs = await import('node:fs');
  const markdownContent = fs.readFileSync(markdownPath, 'utf-8');

  // Remove existing font tags and get clean markdown
  const cleanMarkdown = markdownContent
    .replace(/<font[^>]*>/g, '')
    .replace(/<\/font>/g, '')
    .replace(/\*\*<font[^>]*>([^<]+)<\/font>\*\*/g, '**$1**')
    .replace(/<font[^>]*>([^<]+)<\/font>/g, '$1');

  // Launch browser
  console.log('[publish-netease-mdnice] Launching browser...');
  const { cdp: cdpConnection } = await launchChrome(NETEASE_URL, options?.profileDir);
  let session = await getPageSession(cdpConnection, 'mp.163.com');

  // Enable page and runtime
  await cdpConnection.send('Page.enable', {}, { sessionId: session.sessionId });
  await cdpConnection.send('Runtime.enable', {}, { sessionId: session.sessionId });
  await cdpConnection.send('DOM.enable', {}, { sessionId: session.sessionId });

  try {
    // Step 1: Navigate to article publish page
    console.log('[publish-netease-mdnice] Navigating to Netease article publish page...');
    await evaluate(
      session,
      `window.location.href = 'http://mp.163.com/subscribe_v4/index.html#/article-publish'`
    );
    await sleep(5000);

    // Step 2: Open MdNice in new tab
    console.log('[publish-netease-mdnice] Opening MdNice.com...');
    const { targetId } = await cdpConnection.send<{ targetId: string }>('Target.createTarget', {
      url: MDNICE_URL
    });

    const { sessionId: mdniceSessionId } = await cdpConnection.send<{ sessionId: string }>(
      'Target.attachToTarget',
      { targetId, flatten: true }
    );

    await cdpConnection.send('Page.enable', {}, { sessionId: mdniceSessionId });
    await cdpConnection.send('Runtime.enable', {}, { sessionId: mdniceSessionId });
    await cdpConnection.send('DOM.enable', {}, { sessionId: mdniceSessionId });

    await sleep(5000);

    // Step 3: Paste markdown into MdNice editor
    console.log('[publish-netease-mdnice] Pasting markdown into MdNice...');

    // Click on editor area
    const editorClicked = await evaluate<boolean>(
      session,
      `
      (() => {
        const editor = document.querySelector('.ace_editor, #editor, [contenteditable="true"], .CodeMirror');
        if (editor) {
          editor.focus();
          // Select all and paste
          document.execCommand('selectAll');
          return true;
        }
        return false;
      })()
      `,
      { sessionId: mdniceSessionId }
    );

    if (editorClicked) {
      // Paste markdown content
      await cdpConnection.send('Input.insertText', {
        text: cleanMarkdown
      }, { sessionId: mdniceSessionId });

      await sleep(3000);
      console.log('[publish-netease-mdnice] ✓ Markdown pasted into MdNice');
    }

    // Step 4: Select a theme (optional - you can specify theme in options)
    const theme = options?.theme || 'default';
    console.log('[publish-netease-mdnice] Selecting theme:', theme);

    // Try to click on theme selector
    const themeSelected = await evaluate<boolean>(
      session,
      `
      (() => {
        // Look for theme selector
        const themeButtons = Array.from(document.querySelectorAll('button, [role="button"], .theme-item'));
        const themeBtn = themeButtons.find(btn =>
          btn.textContent.includes('${theme}') ||
          btn.className.includes('${theme}')
        );

        if (themeBtn) {
          themeBtn.click();
          return true;
        }

        // If no specific theme, try to click a popular one
        if (theme === 'default') {
          const firstTheme = themeButtons[0];
          if (firstTheme) {
            firstTheme.click();
            return true;
          }
        }

        return false;
      })()
      `,
      { sessionId: mdniceSessionId }
    );

    await sleep(2000);

    // Step 5: Copy formatted content from MdNice
    console.log('[publish-netease-mdnice] Copying formatted content from MdNice...');

    const copyClicked = await evaluate<boolean>(
      session,
      `
      (() => {
        // Look for copy button
        const copyButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const copyBtn = copyButtons.find(btn =>
          btn.textContent.includes('复制') ||
          btn.textContent.includes('Copy') ||
          btn.className.includes('copy')
        );

        if (copyBtn) {
          copyBtn.click();
          console.log('[publish-netease-mdnice] Copy button clicked');
          return true;
        }

        console.log('[publish-netease-mdnice] Copy button not found');
        return false;
      })()
      `,
      { sessionId: mdniceSessionId }
    );

    if (!copyClicked) {
      console.log('[publish-netease-mdnice] ⚠️  Could not find copy button, trying manual selection...');

      // Manual: Select all and copy
      await evaluate(
        session,
        `
        const editor = document.querySelector('.ace_editor, #editor, [contenteditable="true"], .CodeMirror');
        if (editor) {
          editor.focus();
          document.execCommand('selectAll');
          document.execCommand('copy');
        }
      `,
        { sessionId: mdniceSessionId }
      );
    }

    await sleep(2000);

    // Close MdNice tab
    await cdpConnection.send('Target.closeTarget', { targetId });

    // Step 6: Switch back to Netease tab and paste
    console.log('[publish-netease-mdnice] Pasting formatted content to Netease...');

    // Find the Netease session
    const targets = await cdpConnection.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>(
      'Target.getTargets'
    );

    const neteaseTarget = targets.targetInfos.find(t => t.url.includes('163.com'));
    if (neteaseTarget) {
      const { sessionId: neteaseSessionId } = await cdpConnection.send<{ sessionId: string }>(
        'Target.attachToTarget',
        { targetId: neteaseTarget.targetId, flatten: true }
      );

      await cdpConnection.send('Page.enable', {}, { sessionId: neteaseSessionId });
      await cdpConnection.send('Runtime.enable', {}, { sessionId: neteaseSessionId });
      await cdpConnection.send('DOM.enable', {}, { sessionId: neteaseSessionId });

      await sleep(2000);

      // Click on editor
      await evaluate(
        session,
        `
        const editor = document.querySelector('[contenteditable="true"]') ||
                      document.querySelector('.public-DraftEditor-content');
        if (editor) {
          editor.focus();
        }
      `,
        { sessionId: neteaseSessionId }
      );

      await sleep(1000);

      // Paste formatted content
      const modifiers = process.platform === 'darwin' ? 4 : 2;
      await cdpConnection.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'v',
        code: 'KeyV',
        modifiers
      }, { sessionId: neteaseSessionId });

      await cdpConnection.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'v',
        code: 'KeyV',
        modifiers
      }, { sessionId: neteaseSessionId });

      await sleep(5000);
      console.log('[publish-netease-mdnice] ✓ Formatted content pasted');
    }

    // Step 7: Insert images
    console.log('[publish-netease-mdnice] Inserting images...');
    for (let i = 0; i < markdown.contentImages.length; i++) {
      const image = markdown.contentImages[i];
      console.log(`[publish-netease-mdnice] [${i + 1}/${markdown.contentImages.length}] Inserting image`);

      // Move cursor to end
      await evaluate(
        session,
        `
        const editor = document.querySelector('[contenteditable="true"]');
        if (editor) {
          editor.focus();
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      `,
        { sessionId: session?.sessionId || '' }
      );

      await sleep(1000);

      // Copy and paste image
      const { copyImageToClipboard } = await import('./shared/copy-to-clipboard.js');
      const { pasteFromClipboard } = await import('./shared/paste-from-clipboard.js');

      await copyImageToClipboard(image.localPath);
      await sleep(500);
      pasteFromClipboard(3, 500, 'Google Chrome');
      await sleep(3000);

      console.log(`[publish-netease-mdnice] [${i + 1}/${markdown.contentImages.length}] ✓ Image inserted`);
    }

    // Step 8: Save as draft
    console.log('[publish-netease-mdnice] Saving as draft...');

    const draftClicked = await evaluate<boolean>(
      session,
      `
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const draftBtn = buttons.find(btn => btn.textContent.includes('草稿') || btn.textContent.includes('保存'));
      if (draftBtn) {
        draftBtn.click();
        return true;
      }
      return false;
    `
    );

    if (draftClicked) {
      await sleep(2000);
      console.log('[publish-netease-mdnice] ✓ Draft saved');
    }

    console.log('[publish-netease-mdnice] ✓ Publish completed!');

    // Keep browser open for user to verify
    console.log('[publish-netease-mdnice] Browser left open for verification.');

  } catch (error) {
    console.error('[publish-netease-mdnice] Publish failed:', error);
    throw error;
  }
}

// Get arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: bun scripts/publishers/publish-netease-with-mdnice.ts <markdown-file> [--theme <theme-name>] [--submit] [--profile <path>]');
  process.exit(1);
}

const markdownPath = args[0];
const options: PublishOptions = {
  submit: args.includes('--submit'),
  theme: args.includes('--theme') ? args[args.indexOf('--theme') + 1] : 'default',
  profileDir: args.includes('--profile') ? args[args.indexOf('--profile') + 1] : undefined,
};

await publishToNeteaseWithMdNice(markdownPath, options);
