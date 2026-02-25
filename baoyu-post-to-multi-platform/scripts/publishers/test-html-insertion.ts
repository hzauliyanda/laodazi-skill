#!/usr/bin/env bun
import { launchChrome, getPageSession, sleep, evaluate } from '../shared/cdp.js';
import { parseMarkdownForMultiPlatform } from '../shared/markdown-parser.js';

async function test() {
  console.log('[test] 启动Chrome并导航到百家号编辑页面...');
  const { cdp, chrome } = await launchChrome('https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1');

  try {
    const session = await getPageSession(cdp, 'baijiahao.baidu.com');

    console.log('[test] 等待页面加载...');
    await sleep(10000);

    // 解析测试文章
    const markdown = await parseMarkdownForMultiPlatform(
      '/Users/liyanda/Documents/project_code/claudeCode/article/为何中国历史顺序总是唐宋元明清，金朝不被排列其中，是不配吗？.md'
    );

    console.log('[test] 文章解析完成，图片数量:', markdown.contentImages.length);

    // 点击标题输入框并输入标题
    console.log('[test] 输入标题...');
    await evaluate(
      session,
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

    await evaluate(
      session,
      `
      const newsTextArea = document.getElementById('newsTextArea');
      if (newsTextArea) {
        newsTextArea.click();
        newsTextArea.focus();
        document.execCommand('insertText', false, ${JSON.stringify(markdown.title)});
      }
    `,
    );
    await sleep(1000);

    // 读取HTML内容
    const fs = require('node:fs');
    const htmlContent = fs.readFileSync(markdown.htmlPath, 'utf-8');

    console.log('[test] HTML内容长度:', htmlContent.length);
    console.log('[test] 包含占位符:', htmlContent.includes('IMAGE_PLACEHOLDER'));

    // 插入HTML到iframe
    console.log('[test] 插入HTML到iframe...');
    await evaluate(
      session,
      `
      const iframe = document.querySelector('iframe#ueditor_0');
      if (iframe && iframe.contentDocument) {
        const iframeBody = iframe.contentDocument.body;
        iframeBody.innerHTML = ${JSON.stringify(htmlContent)};
      }
    `,
    );
    await sleep(3000);

    // 尝试读取iframe内容
    console.log('[test] 尝试读取iframe内容...');
    try {
      const iframeInfo = await evaluate<string>(
        session,
        `
        (function() {
          try {
            const iframe = document.querySelector('iframe#ueditor_0');
            if (!iframe) return 'No iframe found';

            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const iframeBody = iframeDoc.body;

            const html = iframeBody.innerHTML;
            const hasPlaceholder = html.includes('IMAGE_PLACEHOLDER');
            const placeholderCount = (html.match(/\[\[IMAGE_PLACEHOLDER_\d+\]\]/g) || []).length;

            return JSON.stringify({
              hasPlaceholder,
              placeholderCount,
              htmlLength: html.length,
              firstChars: html.slice(0, 200)
            });
          } catch (e) {
            return 'Error: ' + e.message;
          }
        })()
      `,
      );

      console.log('[test] iframe信息:', iframeInfo);
    } catch (e) {
      console.log('[test] 无法读取iframe:', e);
    }

    console.log('[test] 浏览器将保持打开，请查看页面状态...');
    await sleep(60000);

  } finally {
    cdp.close();
    chrome.kill();
  }
}

await test();
