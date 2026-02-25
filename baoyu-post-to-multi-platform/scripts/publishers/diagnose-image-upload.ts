#!/usr/bin/env bun
import { launchChrome, getPageSession, sleep, evaluate } from '../shared/cdp.js';

async function diagnose() {
  console.log('[diagnose] 启动Chrome并导航到百家号编辑页面...');
  const { cdp, chrome } = await launchChrome('https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1');

  try {
    const session = await getPageSession(cdp, 'baijiahao.baidu.com');

    console.log('[diagnose] 等待页面加载...');
    await sleep(10000);

    // 查找所有可能的图片上传按钮
    console.log('\n[diagnose] === 查找图片上传按钮 ===');
    const buttons = await evaluate<string>(
      session,
      `
      const buttons = [];
      const allButtons = document.querySelectorAll('button, a, div[role="button"], span[role="button"]');

      for (const btn of allButtons) {
        const text = btn.textContent || '';
        const title = btn.getAttribute('title') || '';
        const className = btn.className || '';

        if (text.includes('图片') || title.includes('图片') || className.includes('image') || className.includes('Image')) {
          buttons.push({
            tag: btn.tagName,
            text: text.slice(0, 30),
            title: title.slice(0, 30),
            class: className.slice(0, 50),
            id: btn.id || ''
          });
        }
      }

      return JSON.stringify(buttons.slice(0, 10));
    `,
    );
    console.log(buttons || '(未找到图片按钮)');

    // 检查iframe外部容器的工具栏
    console.log('\n[diagnose] === iframe外部工具栏 ===');
    const outerToolbar = await evaluate<string>(
      session,
      `
      // 查找UEditor容器外部的工具栏
      const container = document.querySelector('#edui1');
      if (!container) {
        return 'No edui1 container';
      }

      const toolbar = container.querySelector('.edui-toolbar');
      if (!toolbar) {
        return 'No toolbar found in container';
      }

      const buttons = toolbar.querySelectorAll('.edui-box, .edui-button');
      const result = [];
      for (const btn of buttons) {
        const title = btn.getAttribute('title') || '';
        if (title) {
          result.push({ title: title.slice(0, 20), class: btn.className.slice(0, 30) });
        }
      }
      return JSON.stringify(result.slice(0, 15));
    `,
    );
    console.log(outerToolbar);

    // 查找所有包含"图片"文本的元素
    console.log('\n[diagnose] === 包含"图片"的元素 ===');
    const imageElements = await evaluate<string>(
      session,
      `
      const all = document.querySelectorAll('*');
      const result = [];
      for (const el of all) {
        const text = el.textContent || '';
        const title = el.getAttribute('title') || '';
        if ((text.includes('图片') || title.includes('图片')) && text.length < 30) {
          result.push({
            tag: el.tagName,
            text: text.slice(0, 20),
            title: title.slice(0, 20),
            class: el.className?.slice(0, 30) || ''
          });
        }
      }
      return JSON.stringify(result.slice(0, 20));
    `,
    );
    console.log(imageElements);

    // 尝试点击图片按钮
    console.log('\n[diagnose] 尝试点击图片按钮...');
    const clicked = await evaluate<boolean>(
      session,
      `
      const imageBtn = document.querySelector('.edui-for-image');
      if (imageBtn) {
        imageBtn.click();
        return true;
      }
      return false;
    `,
    );
    console.log('点击结果:', clicked);

    if (clicked) {
      await sleep(2000);

      // 等待后查找文件输入框
      console.log('\n[diagnose] === 查找文件输入框 ===');
      const fileInputs = await evaluate<string>(
        session,
        `
        const inputs = document.querySelectorAll('input[type="file"]');
        const result = [];
        for (const input of inputs) {
          result.push({
            accept: input.accept || '',
            name: input.name || '',
            id: input.id || '',
            class: input.className || '',
            style: input.getAttribute('style') || '',
            display: window.getComputedStyle(input).display
          });
        }
        return JSON.stringify(result);
      `,
      );
      console.log(fileInputs || '(未找到文件输入框)');
    }

    console.log('\n[diagnose] 浏览器将保持打开30秒，请查看页面状态...');
    await sleep(30000);

  } finally {
    cdp.close();
    chrome.kill();
  }
}

await diagnose();
