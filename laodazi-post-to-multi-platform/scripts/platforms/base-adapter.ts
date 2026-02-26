import { launchChrome, getPageSession, clickElement, typeText, sleep, evaluate, waitForElement } from '../shared/cdp.js';
import { copyImageToClipboard, copyTextToClipboard } from '../shared/copy-to-clipboard.js';
import { pasteFromClipboard } from '../shared/paste-from-clipboard.js';
import { retry } from '../shared/retry.js';
import type { PlatformName, ParsedMarkdown, PublishOptions, PlatformPublishResult } from '../shared/types.js';

/**
 * Base class for all platform adapters
 */
export abstract class BasePlatformAdapter {
  abstract name: PlatformName;
  abstract publishUrl: string;
  abstract priority: number;

  protected cdp?: Awaited<ReturnType<typeof launchChrome>>;
  protected session?: Awaited<ReturnType<typeof getPageSession>>;

  /**
   * Initialize the browser session
   */
  async initialize(options?: PublishOptions): Promise<void> {
    const profileDir = options?.profileDir;
    console.log(`[${this.name}] Launching browser...`);
    this.cdp = await launchChrome(this.publishUrl, profileDir);
    this.session = await getPageSession(this.cdp.cdp, this.publishUrl.split('/')[2]);
    console.log(`[${this.name}] Browser ready`);
  }

  /**
   * Validate that the user is logged in
   */
  abstract validate(): Promise<boolean>;

  /**
   * Publish the article to this platform
   */
  abstract publish(markdown: ParsedMarkdown, options?: PublishOptions): Promise<PlatformPublishResult>;

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.cdp?.cdp) {
      this.cdp.cdp.close();
    }
    if (this.cdp?.chrome) {
      this.cdp.chrome.kill();
    }
  }

  /**
   * Helper: Click element with retry
   */
  protected async clickWithRetry(selector: string, maxRetries = 3): Promise<void> {
    await retry(
      async () => {
        if (this.session) {
          await clickElement(this.session, selector);
        }
      },
      {
        maxRetries,
        onRetry: (attempt) => console.log(`[${this.name}] Retrying click (${attempt}/${maxRetries}): ${selector}`),
      },
    );
  }

  /**
   * Helper: Wait for element and click
   */
  protected async waitAndClick(selector: string, timeoutMs = 10_000): Promise<void> {
    if (!this.session) throw new Error('Session not initialized');
    await waitForElement(this.session, selector, timeoutMs);
    await sleep(500);
    await clickElement(this.session, selector);
  }

  /**
   * Helper: Type text with retry
   */
  protected async typeWithRetry(selector: string, text: string, maxRetries = 3): Promise<void> {
    await retry(
      async () => {
        if (this.session) {
          await clickElement(this.session, selector);
          await sleep(200);
          // Clear existing text
          await this.session?.cdp.send('Input.insertText', { text: '\n' }, { sessionId: this.session.sessionId });
          await sleep(100);
          // Select all
          const modifiers = process.platform === 'darwin' ? 4 : 2;
          await this.session?.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers }, { sessionId: this.session.sessionId });
          await this.session?.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers }, { sessionId: this.session.sessionId });
          await sleep(100);
          // Type new text
          await typeText(this.session, text);
        }
      },
      {
        maxRetries,
        onRetry: (attempt) => console.log(`[${this.name}] Retrying type (${attempt}/${maxRetries}): ${selector}`),
      },
    );
  }

  /**
   * Helper: Insert image at current cursor position
   */
  protected async insertImage(imagePath: string): Promise<void> {
    console.log(`[${this.name}] Inserting image: ${imagePath}`);
    await copyImageToClipboard(imagePath);
    await sleep(500);
    pasteFromClipboard(5, 500, 'Google Chrome');
    await sleep(1500);
  }

  /**
   * Helper: Insert text at current cursor position
   */
  protected async insertText(text: string): Promise<void> {
    console.log(`[${this.name}] Inserting text...`);
    await copyTextToClipboard(text);
    await sleep(300);
    pasteFromClipboard(3, 300, 'Google Chrome');
    await sleep(500);
  }

  /**
   * Helper: Convert markdown body to plain text for platforms that don't support HTML
   */
  protected markdownToPlainText(markdown: ParsedMarkdown): string {
    const fs = require('node:fs');
    const htmlContent = fs.readFileSync(markdown.htmlPath, 'utf-8');

    // Extract content from #output div if it exists
    const outputStart = htmlContent.indexOf('<div id="output">');
    const outputEnd = htmlContent.lastIndexOf('</div>');
    let content = htmlContent;

    if (outputStart !== -1 && outputEnd !== -1 && outputEnd > outputStart) {
      // Extract content between <div id="output"> and the last closing </div> before </body>
      const bodyEnd = htmlContent.indexOf('</body>');
      const actualEnd = bodyEnd !== -1 && bodyEnd < outputEnd ? bodyEnd : outputEnd;
      content = htmlContent.substring(outputStart + '<div id="output">'.length, actualEnd);
    }

    // Remove HTML tags and get plain text
    return content
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Helper: Replace image placeholders in content with actual images
   */
  protected async insertImages(markdown: ParsedMarkdown): Promise<void> {
    // First insert cover image if available
    if (markdown.coverImage) {
      console.log(`[${this.name}] Inserting cover image...`);
      await this.insertCoverImage(markdown.coverImage);
      await sleep(1000);
    }

    // Then insert content images
    for (const image of markdown.contentImages) {
      console.log(`[${this.name}] Inserting image: ${image.placeholder}`);
      await this.insertImage(image.localPath);
      await sleep(1000);
    }
  }

  /**
   * Abstract method for inserting cover image - platforms handle this differently
   */
  protected abstract insertCoverImage(coverImagePath: string): Promise<void>;
}
