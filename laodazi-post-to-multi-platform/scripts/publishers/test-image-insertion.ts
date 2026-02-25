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

    // 输入标题
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

    // 读取HTML内容并替换图片链接
    const fs = require('node:fs');
    let htmlContent = fs.readFileSync(markdown.htmlPath, 'utf-8');

    console.log('[test] 替换图片占位符为网络链接...');
    for (let i = 0; i < markdown.contentImages.length; i++) {
      const image = markdown.contentImages[i];
      const imgUrl = image.originalPath;
      const imgTag = `<img src="${imgUrl}" style="max-width:100%;height:auto;display:block;margin:10px 0;">`;
      htmlContent = htmlContent.replace(image.placeholder, imgTag);
      console.log(`[test]   - ${image.placeholder} -> ${imgUrl}`);
    }

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
    await sleep(2000);

    // 检查iframe中的图片数量
    console.log('[test] 检查iframe中的图片...');
    const checkResult = await evaluate<string>(
      session,
      `
      (function() {
        try {
          const iframe = document.querySelector('iframe#ueditor_0');
          if (!iframe || !iframe.contentDocument) {
            return 'No iframe found';
          }

          const iframeBody = iframe.contentDocument.body;
          const imgs = iframeBody.querySelectorAll('img');
          const result = {
            imgCount: imgs.length,
            imgSources: Array.from(imgs).map(img => ({
              src: img.src,
              width: img.width,
              height: img.height,
              display: window.getComputedStyle(img).display
            }))
          };

          return JSON.stringify(result, null, 2);
        } catch (e) {
          return 'Error: ' + e.message;
        }
      })()
    `,
    );

    console.log('[test] iframe中的图片信息:');
    console.log(checkResult);

    // 检查HTML内容
    const htmlCheck = await evaluate<string>(
      session,
      `
      const iframe = document.querySelector('iframe#ueditor_0');
      if (iframe && iframe.contentDocument) {
        const iframeBody = iframe.contentDocument.body;
        const html = iframeBody.innerHTML;
        return {
          length: html.length,
          hasImg: html.includes('<img'),
          firstImg: html.match(/<img[^>]*>/)?.[0] || 'none'
        };
      }
      return {};
    `,
    );

    console.log('[test] HTML检查:');
    console.log(JSON.stringify(htmlCheck, null, 2));

    console.log('\n[test] 浏览器将保持打开30秒，请查看页面状态...');
    await sleep(30000);

  } finally {
    cdp.close();
    chrome.kill();
  }
}

await test();
