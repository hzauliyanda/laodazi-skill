#!/usr/bin/env bun
import { launchChrome, sleep, evaluate } from '../shared/cdp.js';

async function monitor() {
  console.log('[monitor] 启动Chrome浏览器...');
  console.log('[monitor] 浏览器将打开百家号主页');
  console.log('[monitor] 请在浏览器中完成以下操作：');
  console.log('[monitor] 1. 点击"发布"按钮 (id=home-publish-btn)');
  console.log('[monitor] 2. 输入标题');
  console.log('[monitor] 3. 输入正文内容');
  console.log('[monitor] 4. 上传图片（如果需要）');
  console.log('[monitor] 5. 操作完成后，在终端按 Ctrl+C 结束\n');

  const { cdp, chrome } = await launchChrome('https://baijiahao.baidu.com/builder/rc/home');

  // 获取主页面session
  const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
  const pageTarget = targets.targetInfos.find((t) => t.type === 'page' && t.url.includes('baijiahao'));

  if (!pageTarget) {
    console.error('[monitor] 未找到百家号页面');
    return;
  }

  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });

  await cdp.send('DOM.enable', {}, { sessionId });
  await cdp.send('Runtime.enable', {}, { sessionId });

  console.log('[monitor] === 开始监控 ===\n');

  let step = 0;

  // 定期检查页面状态
  const checkInterval = setInterval(async () => {
    try {
      const url = await evaluate<string>(
        { cdp, sessionId } as any,
        'window.location.href',
      );

      const title = await evaluate<string>(
        { cdp, sessionId } as any,
        'document.title',
      );

      console.log(`\n[monitor] === 检查点 #${++step} ===`);
      console.log(`[monitor] URL: ${url}`);
      console.log(`[monitor] 标题: ${title}`);

      // 查找所有输入框
      const inputs = await evaluate<string>(
        { cdp, sessionId } as any,
        `
        Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0; // 只显示可见的
          })
          .map(el => {
            const info = {
              tag: el.tagName,
              type: el.type || el.getAttribute('contenteditable') || 'text',
              placeholder: el.placeholder || '',
              class: el.className || '',
              id: el.id || '',
              name: el.name || '',
            };
            return info.tag +
              (info.id ? '#' + info.id : '') +
              (info.class ? '.' + info.class.split(' ')[0] : '') +
              ' [placeholder=' + info.placeholder + ']';
          })
          .join('\\n')
        `,
      );
      console.log(`[monitor] 输入元素:\\n${inputs || '(无)'}`);

      // 查找所有按钮
      const buttons = await evaluate<string>(
        { cdp, sessionId } as any,
        `
        Array.from(document.querySelectorAll('button, a[href], [role="button"]'))
          .filter(el => {
            const text = (el.textContent || '').trim();
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && text.length > 0 && text.length < 30;
          })
          .slice(0, 15)
          .map(el => {
            const info = {
              tag: el.tagName,
              text: (el.textContent || '').trim().slice(0, 20),
              class: el.className || '',
              id: el.id || '',
              href: el.href || '',
            };
            if (info.tag === 'A') {
              return info.tag + ' [text=' + info.text + '] [href=' + info.href.slice(0, 50) + ']';
            }
            return info.tag +
              (info.id ? '#' + info.id : '') +
              (info.class ? ' .' + info.class.split(' ')[0] : '') +
              ' [text=' + info.text + ']';
          })
          .join('\\n')
        `,
      );
      console.log(`[monitor] 按钮/链接:\\n${buttons || '(无)'}`);

      // 查找编辑器特定的元素
      const editorInfo = await evaluate<string>(
        { cdp, sessionId } as any,
        `
        // 查找富文本编辑器
        const editors = Array.from(document.querySelectorAll('.editor, [contenteditable], .rich-editor, .ql-editor, .write-area'));
        editors.map(el => el.tagName + (el.className ? ' .' + el.className.split(' ')[0] : '') + ' [contenteditable=' + el.getAttribute('contenteditable') + ']').join('\\n') || '(无编辑器)'
        `,
      );
      console.log(`[monitor] 编辑器元素:\\n${editorInfo}`);

    } catch (error) {
      console.error('[monitor] 检查出错:', error);
    }
  }, 5000); // 每5秒检查一次

  console.log('[monitor] 监控中... (按 Ctrl+C 停止)\n');

  // 保持运行直到用户中断
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      clearInterval(checkInterval);
      console.log('\n[monitor] === 监控结束 ===');
      resolve();
    });
  });

  cdp.close();
  chrome.kill();
}

await monitor();
