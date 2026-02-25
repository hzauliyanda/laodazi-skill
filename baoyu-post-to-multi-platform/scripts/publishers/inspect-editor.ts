#!/usr/bin/env bun
import { launchChrome, getPageSession, sleep, evaluate } from '../shared/cdp.js';

async function inspect() {
  console.log('[inspect] 启动Chrome并导航到百家号编辑页面...');
  const { cdp, chrome } = await launchChrome('https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1');

  try {
    const session = await getPageSession(cdp, 'baijiahao.baidu.com');

    console.log('[inspect] 等待页面加载...');
    await sleep(10000);

    // 查找标题输入框
    console.log('\n[inspect] === 查找标题输入框 ===');
    const titleInputs = await evaluate<string>(
      session,
      `
      Array.from(document.querySelectorAll('input'))
        .filter(el => {
          const placeholder = el.placeholder || '';
          return placeholder.includes('标题') || placeholder.includes('请输入');
        })
        .map(el => ({
          tag: el.tagName,
          type: el.type,
          placeholder: el.placeholder,
          class: el.className,
          id: el.id,
          name: el.name
        }))
        .map(el => '  ' + el.tag + ' [type=' + el.type + '] [placeholder=' + el.placeholder + '] [id=' + el.id + '] [class=' + el.class + ']')
        .join('\\n')
      `,
    );
    console.log(titleInputs || '(无匹配的标题输入框)');

    // 查找所有输入框
    console.log('\n[inspect] === 所有输入框 ===');
    const allInputs = await evaluate<string>(
      session,
      `
      Array.from(document.querySelectorAll('input, textarea'))
        .map(el => ({
          tag: el.tagName,
          type: el.type || el.getAttribute('contenteditable') || 'text',
          placeholder: el.placeholder || '',
          class: el.className || '',
          id: el.id || ''
        }))
        .map(el => '  ' + el.tag + ' [type=' + el.type + '] [placeholder=' + el.placeholder + '] [id=' + el.id + '] [class=' + el.class.split(' ')[0] + ']')
        .slice(0, 15)
        .join('\\n')
      `,
    );
    console.log(allInputs);

    // 查找iframe
    console.log('\n[inspect] === 查找iframe ===');
    const iframes = await evaluate<string>(
      session,
      `
      Array.from(document.querySelectorAll('iframe'))
        .map(el => ({
          id: el.id || '',
          class: el.className || '',
          src: el.src || ''
        }))
        .map(el => '  IFRAME [id=' + el.id + '] [class=' + el.class + '] [src=' + el.src + ']')
        .join('\\n')
      `,
    );
    console.log(iframes || '(无iframe)');

    // 如果有ueditor_0 iframe，检查其内容
    const hasUeditor = await evaluate<boolean>(session, `!!document.querySelector('iframe#ueditor_0')`);
    if (hasUeditor) {
      console.log('\n[inspect] === iframe#ueditor_0 内容 ===');
      try {
        const iframeContent = await evaluate<string>(
          session,
          `
          const iframe = document.querySelector('iframe#ueditor_0');
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const body = iframeDoc.body;
          {
            tag: body.tagName,
            class: body.className || '',
            contentEditable: body.contentEditable || '',
            innerHTML: body.innerHTML.slice(0, 200)
          }
          `,
        );
        console.log(iframeContent);
      } catch (e) {
        console.log('[inspect] 无法访问iframe内容 (跨域限制)');
      }
    }

    console.log('\n[inspect] 浏览器将保持打开30秒，请查看页面...');
    await sleep(30000);

  } finally {
    cdp.close();
    chrome.kill();
  }
}

await inspect();
