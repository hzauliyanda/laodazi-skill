import { BasePlatformAdapter } from './base-adapter.js';
import { clickElement, typeText, sleep, waitForElement, evaluate } from '../shared/cdp.js';
import type { ParsedMarkdown, PublishOptions, PlatformPublishResult } from '../shared/types.js';
import fs from 'node:fs';

/**
 * Baidu Baijiahao (百家号) adapter
 * URL: https://baijiahao.baidu.com/builder/rc/home
 */
export class BaijiahaoAdapter extends BasePlatformAdapter {
  name = 'baijiahao' as const;
  publishUrl = 'https://baijiahao.baidu.com/builder/rc/home';
  priority = 1;

  /**
   * Validate login status by checking if user info element exists
   */
  async validate(): Promise<boolean> {
    if (!this.session) {
      throw new Error('Session not initialized. Call initialize() first.');
    }

    try {
      // Wait for page to load
      await sleep(5000);

      // Check if we're on the login page or already logged in
      const url = await evaluate<string>(this.session, 'window.location.href');
      console.log(`[baijiahao] Current URL: ${url}`);

      // Check various indicators of login status
      const pageTitle = await evaluate<string>(this.session, 'document.title');
      console.log(`[baijiahao] Page title: ${pageTitle}`);

      // More flexible login detection - check if we're NOT on login pages
      const isLoginPage = url.includes('passport.baidu.com') || url.includes('login');
      if (isLoginPage) {
        console.log('[baijiahao] On login page, please login first');
        return false;
      }

      // Try multiple selectors for logged-in state
      const selectors = [
        '.user-avatar',
        '.header-user',
        '.create-btn',
        '[class*="user"]',
        '[class*="avatar"]',
        'a[href*="profile"]',
      ];

      for (const selector of selectors) {
        const exists = await evaluate<boolean>(this.session, `!!document.querySelector('${selector}')`);
        if (exists) {
          console.log(`[baijiahao] Found logged-in indicator: ${selector}`);
          return true;
        }
      }

      // If we're on baijiahao domain and not on login page, assume we might be logged in
      if (url.includes('baijiahao.baidu.com')) {
        console.log('[baijiahao] On baijiahao domain, proceeding with caution');
        return true;
      }

      return false;
    } catch (error) {
      console.error('[baijiahao] Validation failed:', error);
      return false;
    }
  }

  /**
   * Insert cover image for Baijiahao
   */
  protected async insertCoverImage(coverImagePath: string): Promise<void> {
    if (!this.session) throw new Error('Session not initialized');

    try {
      // Look for cover image upload button
      // Baijiahao typically has a specific cover image upload area
      const coverSelector = '.cover-upload-btn, .upload-cover, [class*="cover"][class*="upload"]';
      const hasCoverUpload = await evaluate<boolean>(this.session, `!!document.querySelector('${coverSelector}')`);

      if (hasCoverUpload) {
        await this.clickWithRetry(coverSelector);
        await sleep(1000);
        await this.insertImage(coverImagePath);
      }
    } catch (error) {
      console.warn('[baijiahao] Could not insert cover image:', error);
    }
  }

  /**
   * Publish article to Baijiahao
   */
  async publish(markdown: ParsedMarkdown, options?: PublishOptions): Promise<PlatformPublishResult> {
    try {
      console.log('[baijiahao] Starting publish...');

      // Check if already logged in
      const isLoggedIn = await this.validate();
      if (!isLoggedIn) {
        return {
          platform: this.name,
          success: false,
          error: 'Not logged in. Please login to Baijiahao first.',
        };
      }

      // Navigate to create article page
      console.log('[baijiahao] Navigating to create article page...');

      // Use the correct publish button ID
      const publishBtnSelector = '#home-publish-btn';
      const hasPublishBtn = await evaluate<boolean>(this.session, `!!document.querySelector('${publishBtnSelector}')`);

      if (hasPublishBtn) {
        console.log('[baijiahao] Clicking publish button...');
        await this.clickWithRetry(publishBtnSelector);
        await sleep(5000);
      } else {
        // Try navigating directly to the edit page
        console.log('[baijiahao] No publish button found, navigating directly to edit page...');
        await evaluate(this.session, `window.location.href = 'https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1'`);
        await sleep(5000);
      }

      // Wait for editor to load - use the actual selectors from monitoring
      console.log('[baijiahao] Waiting for editor to load...');
      const titleBoxSelector = '.input-container'; // 使用XPath对应的CSS选择器
      await waitForElement(this.session, titleBoxSelector, 20000);
      await sleep(2000);

      // Enter title
      console.log('[baijiahao] Entering title...');
      // 使用XPath查找input-container并点击
      await evaluate(
        this.session,
        `
        const xpath = '//*[@class="input-container"]';
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const inputContainer = result.singleNodeValue;
        if (inputContainer) {
          inputContainer.click();
        }
      `,
      );
      await sleep(500);

      // 直接在newsTextArea div中输入文本（不是input标签）
      await evaluate(
        this.session,
        `
        const newsTextArea = document.getElementById('newsTextArea');
        if (newsTextArea) {
          newsTextArea.click();
          newsTextArea.focus();
        }
      `,
      );
      await sleep(300);

      // 使用typeText直接输入标题到newsTextArea div
      const titleDivSelector = '#newsTextArea';
      await this.typeWithRetry(titleDivSelector, markdown.title);
      await sleep(1000);

      // Enter content - use the iframe editor
      console.log('[baijiahao] Entering content into iframe...');
      // The content is in an iframe with id="ueditor_0", we need to interact with the body inside
      const iframeSelector = 'iframe#ueditor_0';

      // Wait for iframe editor to be available
      const iframeExists = await evaluate<boolean>(this.session, `!!document.querySelector('${iframeSelector}')`);
      if (!iframeExists) {
        console.error('[baijiahao] iframe editor not found');
        return {
          platform: this.name,
          success: false,
          error: 'Could not find iframe editor',
        };
      }

      // Click on the iframe to focus it
      console.log('[baijiahao] Clicking iframe editor...');
      await this.clickWithRetry(iframeSelector);
      await sleep(1000);

      // Read the styled HTML content
      const fs = require('node:fs');
      const styledContent = fs.readFileSync(markdown.htmlPath, 'utf-8');

      // Insert HTML content into the iframe editor
      console.log('[baijiahao] Inserting styled HTML content...');

      // Read the HTML content
      const htmlContent = fs.readFileSync(markdown.htmlPath, 'utf-8');

      // Use a more reliable method to insert HTML - escape special characters properly
      await evaluate(
        this.session,
        `
        const iframe = document.querySelector('iframe#ueditor_0');
        if (iframe && iframe.contentDocument) {
          const iframeBody = iframe.contentDocument.body;
          iframeBody.innerHTML = ${JSON.stringify(htmlContent)};
          // Trigger change event
          iframeBody.dispatchEvent(new Event('input', { bubbles: true }));
          iframeBody.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `,
      );
      await sleep(2000);

      // Now insert images by finding and replacing placeholders with img tags
      console.log('[baijiahao] Inserting images...');

      for (const image of markdown.contentImages) {
        console.log(`[baijiahao] Processing image: ${image.placeholder}`);

        const replaced = await evaluate<boolean>(
          this.session,
          `
          const iframe = document.querySelector('iframe#ueditor_0');
          if (!iframe || !iframe.contentDocument) return false;

          const iframeBody = iframe.contentDocument.body;
          const placeholder = ${JSON.stringify(image.placeholder)};
          const imgTag = '<img src="file://${image.localPath}" style="max-width:100%;height:auto;">';

          const originalHTML = iframeBody.innerHTML;

          if (originalHTML.includes(placeholder)) {
            iframeBody.innerHTML = originalHTML.replace(placeholder, imgTag);
            return true;
          }
          return false;
        `,
        );

        if (replaced) {
          console.log(`[baijiahao] ✓ Inserted image: ${image.placeholder}`);
          await sleep(500);
        } else {
          console.log(`[baijiahao] ⚠ Could not find placeholder: ${image.placeholder}`);
        }
      }

      // Handle cover image separately if the platform has a dedicated upload area
      if (markdown.coverImage) {
        await this.insertCoverImage(markdown.coverImage);
      }

      // Check if we should submit or just save as draft
      if (options?.submit) {
        console.log('[baijiahao] Submitting article...');
        // Find and click the publish button (文本为"发布")
        const buttons = await evaluate<string>(
          this.session,
          `
          Array.from(document.querySelectorAll('BUTTON.cheetah-btn'))
            .filter(btn => btn.textContent.trim() === '发布')
            .map(btn => btn.textContent)
            .join(',')
          `,
        );

        if (buttons) {
          // Click the button with text "发布"
          const publishButtonSelector = `BUTTON.cheetah-btn`;
          await evaluate(
            this.session,
            `
            Array.from(document.querySelectorAll('BUTTON.cheetah-btn'))
              .find(btn => btn.textContent.trim() === '发布')
              ?.click()
            `,
          );
          await sleep(3000);

          // Handle any confirmation dialogs
          const confirmSelector = '.confirm-btn, .dialog-confirm, button[class*="confirm"]';
          const hasConfirm = await evaluate<boolean>(this.session, `!!document.querySelector('${confirmSelector}')`);
          if (hasConfirm) {
            await this.clickWithRetry(confirmSelector);
            await sleep(2000);
          }
        }

        return {
          platform: this.name,
          success: true,
          preview: false,
        };
      } else {
        console.log('[baijiahao] Saving as draft...');
        // Click the "存草稿" button
        await evaluate(
          this.session,
          `
          Array.from(document.querySelectorAll('BUTTON.cheetah-btn'))
            .find(btn => btn.textContent.trim() === '存草稿')
            ?.click()
          `,
        );
        await sleep(2000);

        return {
          platform: this.name,
          success: true,
          preview: true,
        };
      }
    } catch (error) {
      console.error('[baijiahao] Publish failed:', error);
      return {
        platform: this.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
