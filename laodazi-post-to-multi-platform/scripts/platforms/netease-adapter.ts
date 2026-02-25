import { BasePlatformAdapter } from './base-adapter.js';
import { sleep, waitForElement, evaluate } from '../shared/cdp.js';
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
      await sleep(4000);

      const url = await evaluate<string>(this.session, 'window.location.href');
      if (url.includes('reg.163.com') || url.includes('login.163.com')) {
        console.log('[netease] Not logged in, please login first');
        return false;
      }

      // Check for logged-in state
      const isLoggedIn = await evaluate<boolean>(
        this.session,
        `!!(document.querySelector('.user-avatar') || document.querySelector('.user-name') || document.querySelector('.logout-btn'))`,
      );

      return isLoggedIn;
    } catch (error) {
      console.error('[netease] Validation failed:', error);
      return false;
    }
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

      // Netease uses a SPA with hash routing, might need to navigate
      const createBtnSelectors = [
        '.create-article-btn',
        'a[href*="article"]',
        'button[class*="create"]',
        '[class*="write"]',
      ].join(', ');

      const hasCreateBtn = await evaluate<boolean>(this.session, `!!document.querySelector('${createBtnSelectors}')`);

      if (hasCreateBtn) {
        await this.clickWithRetry(createBtnSelectors);
        await sleep(4000);
      } else {
        // Try to navigate directly to article creation URL
        await evaluate(
          this.session,
          `window.location.href = 'http://mp.163.com/subscribe_v4/index.html#/article/create'`,
        );
        await sleep(4000);
      }

      // Wait for editor
      await waitForElement(this.session, 'input[placeholder*="标题"], [class*="title"], [contenteditable="true"]', 15000);
      await sleep(2000);

      // Enter title
      console.log('[netease] Entering title...');
      const titleSelectors = [
        'input[placeholder*="标题"]',
        'input[placeholder*="请输入标题"]',
        '[class*="editor-title"] input',
        '[class*="article-title"]',
      ].join(', ');

      await this.typeWithRetry(titleSelectors, markdown.title);
      await sleep(1000);

      // Enter content
      console.log('[netease] Entering content...');
      const contentSelectors = [
        '[contenteditable="true"]',
        '.editor-content',
        '[class*="editor"][class*="body"]',
        '.article-content',
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
        console.log('[netease] Article prepared as draft/preview');
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
