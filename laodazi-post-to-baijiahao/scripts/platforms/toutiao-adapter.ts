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
        console.log('[toutiao] Not logged in, please login first');
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

      const isLoggedIn = await this.validate();
      if (!isLoggedIn) {
        return {
          platform: this.name,
          success: false,
          error: 'Not logged in. Please login to Toutiao first.',
        };
      }

      // Navigate to article creation page
      console.log('[toutiao] Navigating to create article page...');
      const writeBtnSelectors = [
        '.write-button',
        '[class*="publish"]',
        'a[href*="article"]',
        'button[class*="write"]',
      ].join(', ');

      const hasWriteBtn = await evaluate<boolean>(this.session, `!!document.querySelector('${writeBtnSelectors}')`);

      if (hasWriteBtn) {
        await this.clickWithRetry(writeBtnSelectors);
        await sleep(5000); // Toutiao editor takes time to load
      }

      // Wait for editor elements
      await waitForElement(this.session, 'input[placeholder*="标题"], [class*="title"], [contenteditable="true"]', 20000);
      await sleep(2000);

      // Enter title
      console.log('[toutiao] Entering title...');
      const titleSelectors = [
        'input[placeholder*="标题"]',
        'input[placeholder*="请输入标题"]',
        '[class*="editor"][class*="title"] input',
        '[class*="title"] input',
      ].join(', ');

      await this.typeWithRetry(titleSelectors, markdown.title);
      await sleep(1000);

      // Enter content
      console.log('[toutiao] Entering content...');
      const contentSelectors = [
        '[contenteditable="true"]',
        '.editor-content',
        '.ql-editor',
        '[class*="editor"][class*="body"]',
      ].join(', ');

      await this.clickWithRetry(contentSelectors);
      await sleep(500);

      // Insert content
      const plainText = this.markdownToPlainText(markdown);
      await this.insertText(plainText);
      await sleep(2000);

      // Insert images
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
