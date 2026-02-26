import { BasePlatformAdapter } from './base-adapter.js';
import { sleep, waitForElement, evaluate } from '../shared/cdp.js';
import type { ParsedMarkdown, PublishOptions, PlatformPublishResult } from '../shared/types.js';

/**
 * Toutiao (头条号) adapter
 * URL: https://mp.toutiao.com/profile_v4/index
 */
export class ToutiaoAdapter extends BasePlatformAdapter {
  name = 'toutiao' as const;
  publishUrl = 'https://mp.toutiao.com/profile_v4/index';
  priority = 2;

  /**
   * Validate login status
   */
  async validate(): Promise<boolean> {
    if (!this.session) {
      throw new Error('Session not initialized. Call initialize() first.');
    }

    try {
      await sleep(5000); // Toutiao takes longer to load

      const url = await evaluate<string>(this.session, 'window.location.href');
      if (url.includes('login.toutiao.com') || url.includes('xssctoken.com')) {
        console.log('[toutiao] Not logged in, waiting for user to login...');
        console.log('[toutiao] Please login in the browser, then press Enter to continue...');

        // Wait for user to complete login
        await this.waitForLogin();
        return false;
      }

      // Check for user avatar or create button
      const isLoggedIn = await evaluate<boolean>(
        this.session,
        `!!(document.querySelector('.user-info') || document.querySelector('.write-button') || document.querySelector('[class*="publish"]'))`,
      );

      return isLoggedIn;
    } catch (error) {
      console.error('[toutiao] Validation failed:', error);
      return false;
    }
  }

  /**
   * Wait for user to complete login
   */
  private async waitForLogin(): Promise<void> {
    console.log('[toutiao] Waiting for login completion...');

    // Poll for login status every 2 seconds
    const maxAttempts = 60; // 2 minutes max wait time
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(2000);

      const url = await evaluate<string>(this.session, 'window.location.href');

      // Check if no longer on login page
      if (!url.includes('login.toutiao.com') && !url.includes('xssctoken.com')) {
        const isLoggedIn = await evaluate<boolean>(
          this.session,
          `!!(document.querySelector('.user-info') || document.querySelector('.write-button') || document.querySelector('[class*="publish"]'))`,
        );

        if (isLoggedIn) {
          console.log('[toutiao] ✓ Login detected!');
          await sleep(2000); // Wait for page to stabilize
          return;
        }
      }
    }

    console.log('[toutiao] ⚠️  Login wait timeout, but continuing anyway...');
  }

  /**
   * Insert cover image for Toutiao
   */
  protected async insertCoverImage(coverImagePath: string): Promise<void> {
    if (!this.session) throw new Error('Session not initialized');

    try {
      // Toutiao cover image upload button
      const coverSelectors = [
        '.cover-upload-btn',
        '.upload-cover-image',
        '[class*="cover"][class*="upload"]',
        'input[type="file"][accept*="image"]',
      ].join(', ');

      const hasCoverUpload = await evaluate<boolean>(this.session, `!!document.querySelector('${coverSelectors}')`);

      if (hasCoverUpload) {
        // Try to find and click the cover upload area
        const fileInput = await evaluate<string | null>(
          this.session,
          `
          const inputs = document.querySelectorAll('input[type="file"]');
          for (const input of inputs) {
            if (input.accept.includes('image')) {
              return input.getAttribute('data-id') || 'file-input';
            }
          }
          return null;
        `,
        );

        if (fileInput) {
          await this.insertImage(coverImagePath);
        }
      }
    } catch (error) {
      console.warn('[toutiao] Could not insert cover image:', error);
    }
  }

  /**
   * Publish article to Toutiao
   */
  async publish(markdown: ParsedMarkdown, options?: PublishOptions): Promise<PlatformPublishResult> {
    try {
      console.log('[toutiao] Starting publish...');

      // Check login status and wait if needed
      const isLoggedIn = await this.validate();
      if (!isLoggedIn) {
        console.log('[toutiao] Still not logged in after waiting. Please login and try again.');
        return {
          platform: this.name,
          success: false,
          error: 'Not logged in. Please login to Toutiao first.',
        };
      }

      // Navigate to article creation page
      console.log('[toutiao] Navigating to create article page...');

      // Wait for page to fully load
      await sleep(3000);

      console.log('[toutiao] Searching for "文章" link...');
      console.log('[toutiao] Using XPath: //a[contains(text(), "文章")]');

      // Use XPath to find and click the "文章" link
      const articleLinkClicked = await evaluate<boolean>(
        this.session,
        `
        const result = document.evaluate('//a[contains(text(), "文章")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) {
          console.log('Found "文章" link, clicking...');
          result.singleNodeValue.click();
          return true;
        }
        return false;
      `
      );

      if (!articleLinkClicked) {
        console.log('[toutiao] ⚠️  Could not find "文章" link with XPath, trying alternative selectors...');
        // Fallback to CSS selectors
        const writeBtnSelectors = [
          '.write-button',
          '[class*="publish"]',
          'a[href*="article"]',
          'button[class*="write"]',
        ].join(', ');

        await this.clickWithRetry(writeBtnSelectors);
      }

      console.log('[toutiao] Waiting for editor to load (10 seconds)...');
      await sleep(10000); // Toutiao editor takes time to load

      // Wait for editor to be ready
      console.log('[toutiao] Waiting for editor elements...');

      // Wait for title input field using the correct XPath
      console.log('[toutiao] Waiting for title input field: //*[@class="autofit-textarea-content"]');
      await sleep(2000);

      // Enter title
      console.log('[toutiao] Entering title into //*[@class="autofit-textarea-content"]');
      const titleEntered = await evaluate<boolean>(
        this.session,
        `
        const result = document.evaluate('//*[@class="autofit-textarea-content"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) {
          const element = result.singleNodeValue;
          element.focus();
          element.click();

          // Clear existing content and type new title
          element.textContent = '${markdown.title}';

          // Trigger input event
          const event = new Event('input', { bubbles: true });
          element.dispatchEvent(event);

          return true;
        }
        return false;
      `
      );

      if (!titleEntered) {
        console.log('[toutiao] ⚠️  Could not enter title using primary XPath, trying fallback...');
        const titleSelectors = [
          'input[placeholder*="标题"]',
          'input[placeholder*="请输入标题"]',
          '[class*="editor"][class*="title"] input',
          '[class*="title"] input',
        ].join(', ');
        await this.typeWithRetry(titleSelectors, markdown.title);
      }

      await sleep(1000);

      // Enter content
      console.log('[toutiao] Entering content into //*[@class="ProseMirror"]');
      console.log('[toutiao] Clicking ProseMirror editor...');

      const contentClicked = await evaluate<boolean>(
        this.session,
        `
        const result = document.evaluate('//*[@class="ProseMirror"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) {
          const element = result.singleNodeValue;
          element.focus();
          element.click();
          return true;
        }
        return false;
      `
      );

      if (!contentClicked) {
        console.log('[toutiao] ⚠️  Could not click ProseMirror using primary XPath, trying fallback...');
        const contentSelectors = [
          '[contenteditable="true"]',
          '.editor-content',
          '.ql-editor',
          '[class*="editor"][class*="body"]',
        ].join(', ');
        await this.clickWithRetry(contentSelectors);
      }

      await sleep(500);

      // Insert content
      const plainText = this.markdownToPlainText(markdown);
      console.log('[toutiao] Inserting content (length:', plainText.length, ')');
      await this.insertText(plainText);
      await sleep(2000);

      // Insert images
      console.log('[toutiao] Processing', markdown.contentImages.length, 'images...');
      for (const image of markdown.contentImages) {
        const placeholderExists = await evaluate<boolean>(
          this.session,
          `document.body.textContent.includes('${image.placeholder}')`,
        );

        if (placeholderExists) {
          await evaluate(
            this.session,
            `
            const selection = window.getSelection();
            const range = document.createRange();
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while (node = walker.nextNode()) {
              if (node.nodeValue && node.nodeValue.includes('${image.placeholder}')) {
                const text = node.nodeValue;
                const index = text.indexOf('${image.placeholder}');
                range.setStart(node, index);
                range.setEnd(node, index + '${image.placeholder}'.length);
                selection.removeAllRanges();
                selection.addRange(range);
                break;
              }
            }
          `,
          );

          await sleep(500);
          await this.insertImage(image.localPath);
        }
      }

      // Handle cover image
      if (markdown.coverImage) {
        await this.insertCoverImage(markdown.coverImage);
      }

      // Submit or preview
      if (options?.submit) {
        console.log('[toutiao] Submitting article...');
        const submitSelectors = [
          '.submit-btn',
          '.publish-btn',
          'button[class*="submit"]',
          'button[class*="publish"]',
          '[class*="send"][class*="btn"]',
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
            '[class*="modal"] button[class*="submit"]',
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
        console.log('[toutiao] Article prepared as draft/preview');
        return {
          platform: this.name,
          success: true,
          preview: true,
        };
      }
    } catch (error) {
      console.error('[toutiao] Publish failed:', error);
      return {
        platform: this.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
