#!/usr/bin/env bun
/**
 * Netease publisher with Doocs Md formatting
 * Uses md.doocs.org to convert markdown to beautifully formatted rich text
 */

import { launchChrome, getPageSession, sleep, evaluate } from './shared/cdp.js';
import { parseMarkdownForMultiPlatform } from './shared/markdown-parser.js';
import type { PublishOptions } from './shared/types.js';

const NETEASE_URL = 'http://mp.163.com/subscribe_v4/index.html#/home';
const DOOCS_MD_URL = 'https://md.doocs.org/';

async function publishToNeteaseWithDoocs(markdownPath: string, options?: PublishOptions) {
  console.log('[publish-netease-doocs] Starting publish with Doocs Md formatting...');

  // Parse markdown
  const markdown = await parseMarkdownForMultiPlatform(markdownPath);
  console.log('[publish-netease-doocs] Title:', markdown.title);
  console.log('[publish-netease-doocs] Images:', markdown.contentImages.length);

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
  console.log('[publish-netease-doocs] Launching browser...');
  const { cdp: cdpConnection } = await launchChrome(NETEASE_URL, options?.profileDir);
  let session = await getPageSession(cdpConnection, 'mp.163.com');

  // Enable page and runtime
  await cdpConnection.send('Page.enable', {}, { sessionId: session.sessionId });
  await cdpConnection.send('Runtime.enable', {}, { sessionId: session.sessionId });
  await cdpConnection.send('DOM.enable', {}, { sessionId: session.sessionId });

  try {
    // Step 1: Navigate to article publish page
    console.log('[publish-netease-doocs] Navigating to Netease article publish page...');
    await evaluate(
      session,
      `window.location.href = 'http://mp.163.com/subscribe_v4/index.html#/article-publish'`
    );
    await sleep(5000);

    // Step 2: Open Doocs Md in new tab
    console.log('[publish-netease-doocs] Opening md.doocs.org...');
    const { targetId } = await cdpConnection.send<{ targetId: string }>('Target.createTarget', {
      url: DOOCS_MD_URL
    });

    const { sessionId: doocsSessionId } = await cdpConnection.send<{ sessionId: string }>(
      'Target.attachToTarget',
      { targetId, flatten: true }
    );

    await cdpConnection.send('Page.enable', {}, { sessionId: doocsSessionId });
    await cdpConnection.send('Runtime.enable', {}, { sessionId: doocsSessionId });
    await cdpConnection.send('DOM.enable', {}, { sessionId: doocsSessionId });

    await sleep(5000);

    // Step 3: Clear and paste markdown into Doocs Md editor
    console.log('[publish-netease-doocs] Clearing and pasting markdown into Doocs Md...');

    // First, focus and clear existing content
    const clearResult = await evaluate<boolean>(
      session,
      `
      (() => {
        try {
          // Find CodeMirror editor
          const editorWrapper = document.querySelector('.CodeMirror');
          if (editorWrapper) {
            editorWrapper.focus();
            // Try CodeMirror API
            if (editorWrapper.CodeMirror) {
              editorWrapper.CodeMirror.setValue('');
              console.log('[doocs] Cleared CodeMirror content');
              return true;
            }
          }

          // Fallback: try contenteditable
          const editable = document.querySelector('#editor, [contenteditable="true"], textarea');
          if (editable) {
            editable.focus();
            editable.select();
            document.execCommand('delete');
            console.log('[doocs] Cleared editable content');
            return true;
          }

          return false;
        } catch (e) {
          console.log('[doocs] Clear error:', e.message);
          return false;
        }
      })()
    `,
      { sessionId: doocsSessionId }
    );

    await sleep(1000);

    // Now paste markdown content
    console.log('[publish-netease-doocs] Inserting markdown content...');
    const insertResult = await evaluate<boolean>(
      session,
      `
      (() => {
        try {
          const markdownContent = ${JSON.stringify(cleanMarkdown)};

          // Try CodeMirror API first
          const editorWrapper = document.querySelector('.CodeMirror');
          if (editorWrapper && editorWrapper.CodeMirror) {
            const cm = editorWrapper.CodeMirror;
            cm.setValue(markdownContent);
            cm.refresh();
            console.log('[doocs] Markdown inserted via CodeMirror, length:', markdownContent.length);
            return true;
          }

          // Fallback: try textarea or contenteditable
          const textarea = document.querySelector('textarea');
          if (textarea) {
            textarea.value = markdownContent;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('[doocs] Markdown inserted via textarea');
            return true;
          }

          const editable = document.querySelector('#editor, [contenteditable="true"]');
          if (editable) {
            editable.textContent = markdownContent;
            editable.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('[doocs] Markdown inserted via contenteditable');
            return true;
          }

          console.log('[doocs] No editor found');
          return false;
        } catch (e) {
          console.log('[doocs] Insert error:', e.message);
          return false;
        }
      })()
    `,
      { sessionId: doocsSessionId }
    );

    if (insertResult) {
      // Wait for rendering to complete
      console.log('[publish-netease-doocs] Waiting for Doocs to render...');
      await sleep(5000);
      console.log('[publish-netease-doocs] ✓ Markdown pasted into Doocs Md');
    }

    await sleep(2000);

    // Step 4: Select all and copy formatted content
    console.log('[publish-netease-doocs] Copying formatted content from Doocs Md...');

    const copyResult = await evaluate<boolean>(
      session,
      `
      (() => {
        try {
          // Select the preview/output area
          const preview = document.querySelector('.preview, .output, #preview, #output, [class*="preview"]');
          if (preview) {
            // Create selection
            const range = document.createRange();
            range.selectNodeContents(preview);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            // Copy to clipboard
            document.execCommand('copy');
            console.log('[doocs] Content copied from preview');
            return true;
          }

          // Fallback: try to find copy button
          const copyButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
          const copyBtn = copyButtons.find(btn =>
            btn.textContent.includes('复制') ||
            btn.textContent.includes('Copy') ||
            btn.className.includes('copy')
          );

          if (copyBtn) {
            copyBtn.click();
            console.log('[doocs] Copy button clicked');
            return true;
          }

          // Last resort: select all and copy
          document.execCommand('selectAll');
          document.execCommand('copy');
          console.log('[doocs] Used selectAll + copy');
          return true;

        } catch (e) {
          console.log('[doocs] Copy error:', e.message);
          return false;
        }
      })()
    `,
      { sessionId: doocsSessionId }
    );

    if (copyResult) {
      await sleep(2000);
      console.log('[publish-netease-doocs] ✓ Content copied');
    }

    // Close Doocs tab
    await cdpConnection.send('Target.closeTarget', { targetId });

    // Step 5: Switch back to Netease tab and paste
    console.log('[publish-netease-doocs] Pasting formatted content to Netease...');

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

      // Clear existing content
      const modifiers = process.platform === 'darwin' ? 4 : 2;
      await cdpConnection.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        modifiers
      }, { sessionId: neteaseSessionId });

      await cdpConnection.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        modifiers
      }, { sessionId: neteaseSessionId });

      await sleep(200);

      // Paste formatted content
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

      // Check if content was pasted
      const contentCheck = await evaluate<string>(
        session,
        `
        const editor = document.querySelector('[contenteditable="true"]') ||
                      document.querySelector('.public-DraftEditor-content');
        if (editor) {
          return 'Length: ' + (editor.textContent?.length || 0);
        }
        return 'No editor'
      `,
        { sessionId: neteaseSessionId }
      );

      console.log('[publish-netease-doocs] Editor content:', contentCheck);
      console.log('[publish-netease-doocs] ✓ Formatted content pasted');
    }

    // Step 6: Insert images
    console.log('[publish-netease-doocs] Inserting images...');
    for (let i = 0; i < markdown.contentImages.length; i++) {
      const image = markdown.contentImages[i];
      console.log(`[publish-netease-doocs] [${i + 1}/${markdown.contentImages.length}] Inserting image`);

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

      console.log(`[publish-netease-doocs] [${i + 1}/${markdown.contentImages.length}] ✓ Image inserted`);
    }

    console.log('[publish-netease-doocs] All images inserted');

    // Step 7: Save as draft
    console.log('[publish-netease-doocs] Saving as draft...');

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
      console.log('[publish-netease-doocs] ✓ Draft saved');
    }

    console.log('[publish-netease-doocs] ✓ Publish completed!');
    console.log('[publish-netease-doocs] Browser left open for verification.');

  } catch (error) {
    console.error('[publish-netease-doocs] Publish failed:', error);
    throw error;
  }
}

// Get arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: bun scripts/publish-netease-with-doocs.ts <markdown-file> [--submit] [--profile <path>]');
  process.exit(1);
}

const markdownPath = args[0];
const options: PublishOptions = {
  submit: args.includes('--submit'),
  profileDir: args.includes('--profile') ? args[args.indexOf('--profile') + 1] : undefined,
};

await publishToNeteaseWithDoocs(markdownPath, options);
