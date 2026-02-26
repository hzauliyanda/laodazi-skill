import { BasePlatformAdapter } from './base-adapter.js';
import { clickElement, typeText, sleep, waitForElement, evaluate, getNodeId, setFileInput } from '../shared/cdp.js';
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

      // First, ensure we're on the home page (not already on an edit page)
      const currentUrl = await evaluate<string>(this.session, 'window.location.href');
      if (currentUrl.includes('/edit') || currentUrl.includes('type=news')) {
        console.log('[baijiahao] Already on edit page, navigating to home first...');
        await evaluate(this.session, `window.location.href = 'https://baijiahao.baidu.com/builder/rc/home'`);
        await sleep(5000);
      }

      // Navigate to create article page
      console.log('[baijiahao] Navigating to create article page...');

      // Use the correct publish button ID
      const publishBtnSelector = '#home-publish-btn';
      const hasPublishBtn = await evaluate<boolean>(this.session, `!!document.querySelector('${publishBtnSelector}')`);

      if (hasPublishBtn) {
        console.log('[baijiahao] Clicking publish button and selecting article type...');
        // Use JavaScript to properly click and navigate
        const clicked = await evaluate<boolean>(
          this.session,
          `
            (function() {
              try {
                // First try to find the "图文" (article) menu item
                const articleItem = document.querySelector('[data-menu="article"]') ||
                                   document.querySelector('.menu-item[data-type="article"]') ||
                                   Array.from(document.querySelectorAll('.menu-item')).find(el => el.textContent?.includes('图文'));

                if (articleItem) {
                  // Click directly on the article menu item
                  articleItem.click();
                  console.log('[debug] Clicked article menu item directly');
                  return true;
                }

                // Fallback: click publish button then article item
                const publishBtn = document.querySelector('#home-publish-btn');
                if (publishBtn) {
                  publishBtn.click();
                  // Wait for menu to appear and click article
                  setTimeout(() => {
                    const items = document.querySelectorAll('.menu-item, [class*="menu"]');
                    for (const item of items) {
                      if (item.textContent?.includes('图文')) {
                        item.click();
                        console.log('[debug] Clicked图文 from dropdown');
                        return;
                      }
                    }
                  }, 500);
                  return true;
                }
                return false;
              } catch (e) {
                console.log('[debug] Error:', e.message);
                return false;
              }
            })()
          `
        );

        if (!clicked) {
          console.log('[baijiahao] JavaScript click failed, navigating directly...');
          await evaluate(this.session, `window.location.href = 'https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1'`);
        }
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

      // Read the HTML content
      let htmlContent = fs.readFileSync(markdown.htmlPath, 'utf-8');

      console.log('[baijiahao] HTML content length:', htmlContent.length);

      // First insert the text content with placeholders
      await evaluate(
        this.session,
        `
        const iframe = document.querySelector('iframe#ueditor_0');
        if (iframe && iframe.contentDocument) {
          const iframeBody = iframe.contentDocument.body;
          iframeBody.innerHTML = ${JSON.stringify(htmlContent)};
          iframeBody.dispatchEvent(new Event('input', { bubbles: true }));
          iframeBody.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `,
      );
      await sleep(2000);

      console.log('[baijiahao] ✓ Content inserted with placeholders');

      // Now upload each image by finding its placeholder and using the upload button
      for (let i = 0; i < markdown.contentImages.length; i++) {
        const image = markdown.contentImages[i];
        const placeholder = image.placeholder;
        const localPath = image.localPath;

        console.log(`[baijiahao] Processing image ${i + 1}: ${placeholder}`);

        // Use window.find() to locate and select the placeholder
        const placeholderFound = await evaluate<boolean>(
          this.session,
          `
            (function() {
              try {
                const iframe = document.querySelector('iframe#ueditor_0');
                if (!iframe || !iframe.contentDocument) return false;
                if (!iframe.contentWindow) return false;

                const iframeWindow = iframe.contentWindow;
                const placeholder = ${JSON.stringify(placeholder)};

                // Focus iframe first
                iframe.focus();

                // Use window.find() to locate the placeholder text
                const findResult = iframeWindow.find(placeholder, false, false, false, false, false, false);

                if (!findResult) {
                  console.log('[debug] Placeholder not found by find()');
                  return false;
                }

                console.log('[debug] Placeholder found and selected by find()');
                return true;
              } catch (e) {
                console.log('[debug] Error with find():', e.message);
                return false;
              }
            })()
          `,
        );

        if (!placeholderFound) {
          console.log(`[baijiahao]   - Placeholder ${placeholder} not found, skipping`);
          continue;
        }

        console.log(`[baijiahao]   - Placeholder selected`);
        await sleep(500);

        // Click the image upload button
        console.log('[baijiahao]   - Clicking image upload button...');
        const buttonClicked = await evaluate<boolean>(
          this.session,
          `
            (function() {
              try {
                const xpath = '//*[@data-function="insertimage"]';
                const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const button = result.singleNodeValue;
                if (button) {
                  button.click();
                  console.log('[debug] Upload button clicked');
                  return true;
                }
                console.log('[debug] Upload button not found');
                return false;
              } catch (e) {
                console.log('[debug] Error clicking button:', e.message);
                return false;
              }
            })()
          `,
        );

        if (!buttonClicked) {
          console.log(`[baijiahao]   - Could not click upload button, skipping`);
          continue;
        }

        await sleep(2000);

        // Set the file input
        console.log('[baijiahao]   - Setting file input...');
        try {
          const docResult = await this.session.cdp.send(
            'DOM.getDocument',
            {},
            { sessionId: this.session.sessionId }
          );

          type DocResult = { root: { nodeId: number } };
          const docData = (docResult as DocResult);
          const rootNodeId = docData.root.nodeId;

          const nodeIdResult = await this.session.cdp.send(
            'DOM.querySelector',
            {
              nodeId: rootNodeId,
              selector: 'input[name="media"]'
            },
            { sessionId: this.session.sessionId }
          );

          type NodeResult = { nodeId: number };
          const nodeData = (nodeIdResult as NodeResult);
          const fileId = nodeData.nodeId;

          await setFileInput(this.session, fileId, [localPath]);
          console.log(`[baijiahao]   - File set: ${localPath}`);
          await sleep(2000);

          // Click confirm button in the image upload modal
          // Look for the confirm button with class cheetah-btn-primary in the modal
          const confirmed = await evaluate<boolean>(
            this.session,
            `
              (function() {
                // First try to find the confirm button in the image upload modal
                const modal = document.querySelector('.cheetah-modal-footer');
                if (modal) {
                  const confirmBtn = modal.querySelector('.cheetah-btn-primary');
                  if (confirmBtn && confirmBtn.textContent.includes('确认')) {
                    confirmBtn.click();
                    console.log('[debug] Clicked modal confirm button');
                    return true;
                  }
                }

                // Fallback: find any visible button with text "确认" in cheetah-modal
                const modals = document.querySelectorAll('.cheetah-modal-wrap, .cheetah-modal');
                for (const modal of modals) {
                  const style = window.getComputedStyle(modal);
                  if (style.display !== 'none') {
                    const buttons = modal.querySelectorAll('button');
                    for (const btn of buttons) {
                      const btnStyle = window.getComputedStyle(btn);
                      const text = btn.textContent || '';
                      if (btnStyle.display !== 'none' && text.includes('确认')) {
                        btn.click();
                        console.log('[debug] Clicked confirm button in modal');
                        return true;
                      }
                    }
                  }
                }

                // Last resort: find any button with "确认"
                const allButtons = document.querySelectorAll('button');
                for (const btn of allButtons) {
                  const style = window.getComputedStyle(btn);
                  const text = btn.textContent || '';
                  if (style.display !== 'none' && text.includes('确认')) {
                    btn.click();
                    console.log('[debug] Clicked confirm button');
                    return true;
                  }
                }
                return false;
              })()
          `,
          );

          if (confirmed) {
            console.log(`[baijiahao]   - Confirmed`);
            await sleep(1500);
          } else {
            console.log(`[baijiahao]   - No confirm button found`);
          }

        } catch (e) {
          console.log(`[baijiahao]   - Upload error: ${e}`);
        }
      }

      console.log('[baijiahao] ✓ Image upload process completed');

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
