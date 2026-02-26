import { BasePlatformAdapter } from './base-adapter.js';
import { sleep, waitForElement, evaluate } from '../shared/cdp.js';
import { convertMarkdownToDocx } from '../shared/md-to-docx.js';
import type { ParsedMarkdown, PublishOptions, PlatformPublishResult } from '../shared/types.js';

/**
 * Netease (网易号) adapter
 * URL: http://mp.163.com/subscribe_v4/index.html#/home
 */
export class NeteaseAdapter extends BasePlatformAdapter {
  name = 'netease' as const;
  publishUrl = 'http://mp.163.com/subscribe_v4/index.html#/home';
  priority = 3;

  /**
   * Validate login status
   */
  async validate(): Promise<boolean> {
    if (!this.session) {
      throw new Error('Session not initialized. Call initialize() first.');
    }

    try {
      // Wait for page to load and check for redirection
      await sleep(5000);

      const url = await evaluate<string>(this.session, 'window.location.href');
      console.log('[netease] Current URL:', url);

      // Check if on login page
      if (url.includes('reg.163.com') || url.includes('login.163.com')) {
        console.log('[netease] On login page, waiting for user to login...');
        await this.waitForLogin();
        await sleep(2000);

        const isLoggedIn = await evaluate<boolean>(
          this.session,
          `!!(document.querySelector('.user-avatar') || document.querySelector('.user-name') || document.querySelector('.logout-btn'))`,
        );
        console.log('[netease] Login status after waiting:', isLoggedIn);
        return isLoggedIn;
      }

      // Check for logged-in state on main page
      const isLoggedIn = await evaluate<boolean>(
        this.session,
        `!!(document.querySelector('.user-avatar') || document.querySelector('.user-name') || document.querySelector('.logout-btn'))`,
      );
      console.log('[netease] Login status:', isLoggedIn);

      if (!isLoggedIn) {
        console.log('[netease] ⚠️  Could not detect login status. If you are logged in, the script will proceed anyway.');
        console.log('[netease] Waiting a moment for the page to fully load...');
        await sleep(3000);

        // Try to detect login again with more generic selectors
        const hasPublishButton = await evaluate<boolean>(
          this.session,
          `document.querySelector('[class*="publish"]') !== null || document.querySelector('[class*="content"]') !== null`,
        );

        if (hasPublishButton) {
          console.log('[netease] ✓ Detected page content, assuming logged in');
          return true;
        }

        console.log('[netease] Please login in the browser if not already logged in...');
        console.log('[netease] Waiting for login completion...');
        await this.waitForLogin();
        await sleep(2000);

        const loggedInAfterWait = await evaluate<boolean>(
          this.session,
          `!!(document.querySelector('.user-avatar') || document.querySelector('.user-name') || document.querySelector('.logout-btn'))`,
        );
        console.log('[netease] Login status after waiting:', loggedInAfterWait);

        // If still can't detect, try to proceed anyway
        if (!loggedInAfterWait) {
          console.log('[netease] ⚠️  Could not confirm login status, but attempting to proceed...');
          return true;
        }
        return loggedInAfterWait;
      }

      return isLoggedIn;
    } catch (error) {
      console.error('[netease] Validation failed:', error);
      return false;
    }
  }

  /**
   * Wait for user to complete login
   */
  private async waitForLogin(): Promise<void> {
    console.log('[netease] Waiting for login completion...');

    // Poll for login status every 2 seconds
    const maxAttempts = 60; // 2 minutes max wait time
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(2000);

      const url = await evaluate<string>(this.session, 'window.location.href');

      // Check if redirected to login page
      if (url.includes('reg.163.com') || url.includes('login.163.com')) {
        // Wait until no longer on login page
        const newUrl = await evaluate<string>(this.session, 'window.location.href');
        if (!newUrl.includes('reg.163.com') && !newUrl.includes('login.163.com')) {
          // Check if logged in
          const isLoggedIn = await evaluate<boolean>(
            this.session,
            `!!(document.querySelector('.user-avatar') || document.querySelector('.user-name') || document.querySelector('.logout-btn'))`,
          );

          if (isLoggedIn) {
            console.log('[netease] ✓ Login detected!');
            await sleep(2000);
            return;
          }
        }
      } else {
        // Already on main page, check for login elements
        const isLoggedIn = await evaluate<boolean>(
          this.session,
          `!!(document.querySelector('.user-avatar') || document.querySelector('.user-name') || document.querySelector('.logout-btn'))`,
        );

        if (isLoggedIn) {
          console.log('[netease] ✓ Login detected!');
          await sleep(2000);
          return;
        }
      }
    }

    console.log('[netease] ⚠️  Login wait timeout, but continuing anyway...');
  }

  /**
   * Insert cover image for Netease
   */
  protected async insertCoverImage(coverImagePath: string): Promise<void> {
    if (!this.session) throw new Error('Session not initialized');

    try {
      // Netease cover image upload
      const coverSelectors = [
        '.cover-upload',
        '.upload-cover',
        '[class*="cover"][class*="upload"]',
        'input[type="file"][accept*="image"][class*="cover"]',
      ].join(', ');

      const hasCoverUpload = await evaluate<boolean>(this.session, `!!document.querySelector('${coverSelectors}')`);

      if (hasCoverUpload) {
        await this.insertImage(coverImagePath);
      }
    } catch (error) {
      console.warn('[netease] Could not insert cover image:', error);
    }
  }

  /**
   * Copy HTML content from file and paste to editor
   */
  protected async insertHtmlContent(htmlPath: string): Promise<void> {
    if (!this.session || !this.cdp?.cdp) {
      throw new Error('Session not initialized');
    }

    console.log('[netease] Copying HTML content with formatting...');

    const path = await import('node:path');
    const absolutePath = path.isAbsolute(htmlPath) ? htmlPath : path.resolve(process.cwd(), htmlPath);
    const fileUrl = `file://${absolutePath}`;

    console.log('[netease] Opening HTML file in new tab...');

    // Create new target for HTML file
    const { targetId } = await this.cdp.cdp.send<{ targetId: string }>('Target.createTarget', { url: fileUrl });
    const { sessionId: htmlSessionId } = await this.cdp.cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });

    await this.cdp.cdp.send('Page.enable', {}, { sessionId: htmlSessionId });
    await this.cdp.cdp.send('Runtime.enable', {}, { sessionId: htmlSessionId });
    await sleep(2000);

    // Select content
    console.log('[netease] Selecting content...');
    await this.cdp.cdp.send<{ result: { value: unknown } }>('Runtime.evaluate', {
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
    }, { sessionId: htmlSessionId });
    await sleep(500);

    // Copy to clipboard
    console.log('[netease] Copying to clipboard...');
    const modifiers = process.platform === 'darwin' ? 4 : 2;
    await this.cdp.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', modifiers }, { sessionId: htmlSessionId });
    await this.cdp.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', modifiers }, { sessionId: htmlSessionId });
    await sleep(500);

    // Close HTML tab
    await this.cdp.cdp.send('Target.closeTarget', { targetId });

    // Paste to editor
    console.log('[netease] Pasting formatted content to editor...');
    await sleep(500);
    const paste = await import('../shared/paste-from-clipboard.js');
    paste.pasteFromClipboard(3, 500, 'Google Chrome');
    await sleep(2000);

    console.log('[netease] ✓ HTML content inserted');
  }

  /**
   * Publish article to Netease
   */
  async publish(markdown: ParsedMarkdown, options?: PublishOptions): Promise<PlatformPublishResult> {
    try {
      console.log('[netease] Starting publish...');

      const isLoggedIn = await this.validate();
      if (!isLoggedIn) {
        return {
          platform: this.name,
          success: false,
          error: 'Not logged in. Please login to Netease first.',
        };
      }

      // Navigate to article creation
      console.log('[netease] Navigating to create article page...');

      // Try to navigate directly to article-publish page
      const currentUrl = await evaluate<string>(this.session, 'window.location.href');
      console.log('[netease] Current URL:', currentUrl);

      // Navigate to article publish page by changing hash
      await evaluate(
        this.session,
        `window.location.href = 'http://mp.163.com/subscribe_v4/index.html#/article-publish'`
      );

      console.log('[netease] Waiting for editor to load...');
      await sleep(5000);

      // Check if URL changed
      const newUrl = await evaluate<string>(this.session, 'window.location.href');
      console.log('[netease] Current URL after navigation:', newUrl);

      // Wait for title input field
      console.log('[netease] Waiting for title input field...');
      await sleep(2000);

      // Debug: What elements are on this page?
      const allInputs = await evaluate<string>(
        this.session,
        `Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]')).slice(0, 10).map(el => el.tagName + (el.className ? '.' + el.className : '') + (el.placeholder ? '[placeholder=' + el.placeholder + ']' : '')).join(', ')`
      );
      console.log('[netease] Input elements on page:', allInputs || 'none');

      const allWithClass = await evaluate<string>(
        this.session,
        `Array.from(document.querySelectorAll('[class*="title"]')).slice(0, 10).map(el => el.className).join(', ')`
      );
      console.log('[netease] Elements with "title" in class:', allWithClass || 'none');

      // Enter title using the provided XPath
      console.log('[netease] Entering title into //*[@class="newtitle-container"]');
      const titleEntered = await evaluate<boolean>(
        this.session,
        `
        const result = document.evaluate('//*[@class="newtitle-container"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) {
          console.log('[netease] Found title container, looking for input...');
          // Find the input element within the container
          const input = result.singleNodeValue.querySelector('input, textarea, [contenteditable="true"]');
          if (input) {
            input.focus();
            input.click();

            // Clear and set title
            if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
              input.value = '${markdown.title}';
              const event = new Event('input', { bubbles: true });
              input.dispatchEvent(event);
            } else {
            input.textContent = '${markdown.title}';
              const event = new Event('input', { bubbles: true });
              input.dispatchEvent(event);
            }

            console.log('[netease] ✓ Title entered');
            return true;
          }
        }
        return false;
      `
      );

      if (!titleEntered) {
        console.log('[netease] ⚠️  Could not enter title using primary XPath, trying fallback...');
        const titleSelectors = [
          'textarea.netease-textarea',
          'textarea[placeholder*="标题"]',
          'textarea[placeholder*="请输入标题"]',
          'input[placeholder*="标题"]',
          'input[placeholder*="请输入标题"]',
          '[class*="editor-title"] input',
          '[class*="article-title"]',
        ].join(', ');
        await this.typeWithRetry(titleSelectors, markdown.title);
      }

      await sleep(1000);

      // Enter content using the provided XPath
      console.log('[netease] Entering content into //*[@class="DraftEditor-editorContainer"]');
      const contentClicked = await evaluate<boolean>(
        this.session,
        `
        const result = document.evaluate('//*[@class="DraftEditor-editorContainer"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) {
          console.log('[netease] Found editor container, looking for editable element...');
          // Find the editable element within the container
          const editable = result.singleNodeValue.querySelector('[contenteditable="true"], .ProseMirror, [contenteditable="true"]');
          if (editable) {
            editable.focus();
            editable.click();
            console.log('[netease] ✓ Editor clicked');
            return true;
          }
        }
        return false;
      `
      );

      if (!contentClicked) {
        console.log('[netease] ⚠️  Could not click editor using primary XPath, trying fallback...');
        const contentSelectors = [
          '[contenteditable="true"]',
          '.editor-content',
          '[class*="editor"][class*="body"]',
          '.article-content',
        ].join(', ');
        await this.clickWithRetry(contentSelectors);
      }

      await sleep(500);

      // Try importing DOCX file
      console.log('[netease] Converting markdown to DOC for import...');

      try {
        const docxPath = await convertMarkdownToDocx(markdown);
        console.log('[netease] DOC file created:', docxPath);

        // Click import button in the top right
        console.log('[netease] Looking for import button (//*[text()="导入文档"])...');
        const importResult = await evaluate<string>(
          this.session,
          `
          (() => {
            try {
              // Find all buttons and check their text
              const allButtons = Array.from(document.querySelectorAll('button, [role="button"], a, div[onclick], span[onclick]'));
              console.log('[netease] Total clickable elements:', allButtons.length);

              for (let i = 0; i < allButtons.length; i++) {
                const btn = allButtons[i];
                const text = btn.textContent || btn.innerText || '';
                if (text.includes('导入文档')) {
                  console.log('[netease] Found import button at index', i, ':', text);
                  btn.click();
                  return 'found';
                }
              }

              console.log('[netease] Import button not found');
              return 'not_found';
            } catch (e) {
              console.log('[netease] Error:', e.message);
              return 'error: ' + e.message;
            }
          })()
        `
        );

        console.log('[netease] Import result:', importResult);

        const importData = {
          clicked: importResult === 'found',
          message: importResult
        };

        console.log('[netease] Import result:', importResult);

        if (importResult.clicked) {
          await sleep(3000);

          // Look for file input
          const fileInputInfo = await evaluate<{ exists: boolean; selector: string }>(
            this.session,
            `
            const inputs = document.querySelectorAll('input[type="file"]');
            console.log('[netease] File inputs found:', inputs.length);
            if (inputs.length > 0) {
              return { exists: true, selector: 'input[type="file"]' };
            }

            // Also check for file upload areas
            const uploadAreas = document.querySelectorAll('[class*="upload"], [class*="file"]');
            console.log('[netease] Upload areas found:', uploadAreas.length);

            return { exists: inputs.length > 0, selector: 'input[type="file"]' };
          `
          );

          console.log('[netease] File input exists:', fileInputInfo.exists);

          if (fileInputInfo.exists) {
            console.log('[netease] Uploading DOC file via file input...');

            // Read DOC file as base64
            const fs = await import('node:fs');
            const docContent = fs.readFileSync(docxPath);
            const docBase64 = docContent.toString('base64');

            // Upload file using CDP DOM.setFileInputFiles
            const uploadResult = await evaluate<{ uploaded: boolean; message: string }>(
              this.session,
              `
              try {
                const input = document.querySelector('input[type="file"]');
                if (input) {
                  // Create file from base64
                  const byteCharacters = atob('${docBase64}');
                  const byteNumbers = new Array(byteCharacters.length);
                  for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                  }
                  const byteArray = new Uint8Array(byteNumbers);
                  const file = new File([byteArray], 'article.doc', { type: 'application/msword' });

                  // Create DataTransfer and set files
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);
                  input.files = dataTransfer.files;

                  // Trigger change event
                  const event = new Event('change', { bubbles: true });
                  input.dispatchEvent(event);

                  console.log('[netease] File set to input');

                  return { uploaded: true, message: 'File uploaded' };
                }
                return { uploaded: false, message: 'No file input found' };
              } catch (e) {
                return { uploaded: false, message: e.message };
              }
            `
            );

            console.log('[netease] Upload result:', uploadResult);

            await sleep(5000);

            // Look for confirm/ok button
            const confirmResult = await evaluate<boolean>(
              this.session,
              `
              const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
              const confirmBtn = buttons.find(btn => btn.textContent.includes('确定') || btn.textContent.includes('导入') || btn.textContent.includes('OK'));
              if (confirmBtn) {
                console.log('[netease] Clicking confirm button');
                confirmBtn.click();
                return true;
              }
              return false;
            `
            );

            if (confirmResult) {
              await sleep(5000);
            }

            console.log('[netease] ✓ DOC import process completed');
          } else {
            console.log('[netease] ⚠️  No file input found');
          }
        } else {
          console.log('[netease] ⚠️  Could not click import button');
        }
      } catch (error) {
        console.log('[netease] DOC import failed:', error);
      }

      // Fallback: Insert plain text
      console.log('[netease] Inserting plain text content...');

      const contentSelectors = [
        '[contenteditable="true"]',
        '.editor-content',
      ].join(', ');

      await this.clickWithRetry(contentSelectors);
      await sleep(1000);

      // Clear existing content
      const modifiers = process.platform === 'darwin' ? 4 : 2;
      await this.session?.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers }, { sessionId: this.session.sessionId });
      await this.session?.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers }, { sessionId: this.session.sessionId });
      await sleep(200);

      const plainText = this.markdownToPlainText(markdown);
      await this.insertText(plainText);
      await sleep(3000);

      const editorContent = await evaluate<string>(
        this.session,
        `
        const editor = document.querySelector('[contenteditable="true"]') ||
                      document.querySelector('.public-DraftEditor-content');
        if (editor) {
          return 'Text length: ' + (editor.textContent?.length || 0);
        }
        return 'no editor'
      `
      );
      console.log('[netease] Editor content:', editorContent);

      // Insert images - Netease editor strips placeholders, so we insert at the end
      console.log(`[netease] Inserting ${markdown.contentImages.length} images...`);

      for (let i = 0; i < markdown.contentImages.length; i++) {
        const image = markdown.contentImages[i];
        console.log(`[netease] [${i + 1}/${markdown.contentImages.length}] Inserting image: ${image.localPath}`);

        // Move cursor to end of editor
        await evaluate(
          this.session,
          `
          const editor = document.querySelector('[contenteditable="true"]') ||
                        document.querySelector('.public-DraftEditor-content') ||
                        document.querySelector('.DraftEditor-editorContainer');
          if (editor) {
            editor.focus();
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false); // Collapse to end
            selection.removeAllRanges();
            selection.addRange(range);
          }
        `
        );

        await sleep(1000);
        await this.insertImage(image.localPath);
        await sleep(3000); // Wait for image to upload
        console.log(`[netease] [${i + 1}/${markdown.contentImages.length}] ✓ Image inserted`);
      }

      console.log('[netease] All images processed.');

      // Handle cover image
      if (markdown.coverImage) {
        await this.insertCoverImage(markdown.coverImage);
      }

      // Submit or preview
      if (options?.submit) {
        console.log('[netease] Submitting article...');
        const submitSelectors = [
          '.submit-btn',
          '.publish-btn',
          'button[class*="submit"]',
          'button[class*="publish"]',
          '[class*="save"][class*="publish"]',
        ].join(', ');

        const hasSubmit = await evaluate<boolean>(this.session, `!!document.querySelector('${submitSelectors}')`);

        if (hasSubmit) {
          await this.clickWithRetry(submitSelectors);
          await sleep(3000);

          // Handle confirmation
          const confirmSelectors = [
            '.confirm-btn',
            '.dialog-confirm',
            'button[class*="confirm"]',
            '[class*="modal"] button',
          ].join(', ');

          const hasConfirm = await evaluate<boolean>(this.session, `!!document.querySelector('${confirmSelectors}')`);
          if (hasConfirm) {
            await this.clickWithRetry(confirmSelectors);
            await sleep(2000);
          }
        }

        return {
          platform: this.name,
          success: true,
          preview: false,
        };
      } else {
        console.log('[netease] Saving as draft...');
        const draftSelectors = [
          '[class*="save"]',
          '[class*="draft"]',
          'button[class*="save"]',
          '.save-btn',
          '.draft-btn',
        ].join(', ');

        const hasDraft = await evaluate<boolean>(this.session, `!!document.querySelector('${draftSelectors}')`);
        console.log('[netease] Draft button exists:', hasDraft);

        if (hasDraft) {
          await this.clickWithRetry(draftSelectors);
          await sleep(2000);
          console.log('[netease] ✓ Draft saved');
        } else {
          console.log('[netease] ⚠️  No draft button found, content may not be saved');
        }

        return {
          platform: this.name,
          success: true,
          preview: true,
        };
      }
    } catch (error) {
      console.error('[netease] Publish failed:', error);
      return {
        platform: this.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
