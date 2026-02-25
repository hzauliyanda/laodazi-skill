#!/usr/bin/env bun
import { launchChrome, getPageSession, sleep, evaluate } from '../shared/cdp.js';
import { parseMarkdownForMultiPlatform } from '../shared/markdown-parser.js';

async function test() {
  console.log('[test] 启动Chrome...');
  const { cdp, chrome } = await launchChrome('https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1');

  try {
    const session = await getPageSession(cdp, 'baijiahao.baidu.com');
    await sleep(10000);

    // 解析文章
    const markdown = await parseMarkdownForMultiPlatform(
      '/Users/liyanda/Documents/project_code/claudeCode/article/为何中国历史顺序总是唐宋元明清，金朝不被排列其中，是不配吗？.md'
    );

    // 输入标题
    await evaluate(session, `document.evaluate('//*[@class="input-container"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.click()`);
    await sleep(500);
    await evaluate(session, `
      const newsTextArea = document.getElementById('newsTextArea');
      if (newsTextArea) { newsTextArea.click(); newsTextArea.focus(); document.execCommand('insertText', false, ${JSON.stringify(markdown.title)}); }
    `);
    await sleep(1000);

    // 插入带标记的HTML
    const fs = require('node:fs');
    let htmlContent = fs.readFileSync(markdown.htmlPath, 'utf-8');

    for (let i = 0; i < markdown.contentImages.length; i++) {
      const marker = `<p style="background:#f0f0f0;padding:15px;margin:15px 0;border-left:4px solid #2196F3;color:#333;"><strong>[图片 ${i + 1}]</strong></p>`;
      htmlContent = htmlContent.replace(markdown.contentImages[i].placeholder, marker);
    }

    await evaluate(session, `
      const iframe = document.querySelector('iframe#ueditor_0');
      if (iframe && iframe.contentDocument) {
        iframe.contentDocument.body.innerHTML = ${JSON.stringify(htmlContent)};
      }
    `);
    await sleep(2000);

    // 检查实际HTML内容
    const result = await evaluate<string>(session, `
      (function() {
        const iframe = document.querySelector('iframe#ueditor_0');
        if (!iframe || !iframe.contentDocument) return 'No iframe';

        const body = iframe.contentDocument.body;

        // 查找包含"[图片 1]"的元素
        const all = body.querySelectorAll('*');
        const found = [];
        for (const el of all) {
          if (el.textContent && el.textContent.includes('[图片 1]')) {
            found.push({
              tag: el.tagName,
              text: el.textContent.slice(0, 50),
              html: el.innerHTML.slice(0, 100),
              childCount: el.children.length
            });
          }
        }

        return JSON.stringify(found, null, 2);
      })()
    `);

    console.log('[test] 包含"[图片 1]"的元素:');
    console.log(result);

    console.log('\n[test] 浏览器保持打开20秒...');
    await sleep(20000);

  } finally {
    cdp.close();
    chrome.kill();
  }
}

await test();
