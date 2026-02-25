#!/usr/bin/env bun
import { CdpConnection } from '../shared/cdp.js';
import { sleep } from '../shared/cdp.js';

async function inspectCurrentState() {
  console.log('[inspect] 连接到Chrome调试端口...');

  // 尝试连接到Chrome
  const port = 65040; // 从之前的输出中看到的端口
  const wsUrl = `ws://127.0.0.1:${port}/`;

  try {
    const cdp = await CdpConnection.connect(wsUrl, 5000);

    // 获取所有targets
    const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string; title: string }> }>('Target.getTargets');

    console.log(`\n[inspect] 找到 ${targets.targetInfos.length} 个targets:\n`);

    for (const target of targets.targetInfos) {
      if (target.type === 'page') {
        console.log(`[inspect] ===== 页面 =====`);
        console.log(`[inspect] URL: ${target.url}`);
        console.log(`[inspect] 标题: ${target.title}`);

        // 连接到这个页面
        const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
          targetId: target.targetId,
          flatten: true
        });

        await cdp.send('DOM.enable', {}, { sessionId });
        await cdp.send('Runtime.enable', {}, { sessionId });

        // 获取输入框信息
        const inputs = await cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
          expression: `
            Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
              .filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              })
              .map(el => ({
                tag: el.tagName,
                id: el.id || '',
                class: el.className || '',
                placeholder: el.placeholder || '',
                name: el.name || '',
                contenteditable: el.getAttribute('contenteditable') || ''
              }))
              .map(el =>
                '  ' + el.tag +
                (el.id ? '#' + el.id : '') +
                (el.class ? ' .' + el.class.split(' ')[0] : '') +
                ' [placeholder=' + el.placeholder + ']'
              )
              .join('\\n')
          `,
          returnByValue: true
        }, { sessionId });

        console.log(`\n[inspect] 输入元素:\n${inputs.result.value || '(无)'}`);

        // 获取按钮信息
        const buttons = await cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
          expression: `
            Array.from(document.querySelectorAll('button, [role="button"]'))
              .filter(el => {
                const rect = el.getBoundingClientRect();
                const text = (el.textContent || '').trim();
                return rect.width > 0 && rect.height > 0 && text.length > 0 && text.length < 30;
              })
              .slice(0, 20)
              .map(el => ({
                tag: el.tagName,
                id: el.id || '',
                class: el.className || '',
                text: (el.textContent || '').trim().slice(0, 25)
              }))
              .map(el =>
                '  ' + el.tag +
                (el.id ? '#' + el.id : '') +
                (el.class ? ' .' + el.class.split(' ')[0] : '') +
                ' [text=' + el.text + ']'
              )
              .join('\\n')
          `,
          returnByValue: true
        }, { sessionId });

        console.log(`\n[inspect] 按钮:\n${buttons.result.value || '(无)'}`);

        // 获取链接信息
        const links = await cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
          expression: `
            Array.from(document.querySelectorAll('a[href]'))
              .filter(el => {
                const rect = el.getBoundingClientRect();
                const text = (el.textContent || '').trim();
                return rect.width > 0 && rect.height > 0 && text.length > 0 && text.length < 40;
              })
              .slice(0, 20)
              .map(el => ({
                text: (el.textContent || '').trim().slice(0, 30),
                href: el.href || ''
              }))
              .map(el => '  [text=' + el.text + '] ' + el.href)
              .join('\\n')
          `,
          returnByValue: true
        }, { sessionId });

        console.log(`\n[inspect] 链接:\n${links.result.value || '(无)'}`);

        console.log('');
      }
    }

    cdp.close();
  } catch (error) {
    console.error('[inspect] 连接失败:', error);
    console.log('[inspect] Chrome可能已关闭，请重新启动');
  }
}

await inspectCurrentState();
