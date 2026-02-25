#!/usr/bin/env bun
import { launchChrome, getPageSession, sleep, evaluate } from '../shared/cdp.js';
import fs from 'node:fs';

async function diagnose() {
  console.log('[diagnose] Launching Chrome...');

  const { cdp, chrome } = await launchChrome('https://baijiahao.baidu.com/builder/rc/home');

  try {
    const session = await getPageSession(cdp, 'baijiahao.baidu.com');

    console.log('[diagnose] Waiting for page load...');
    await sleep(8000);

    const url = await evaluate<string>(session, 'window.location.href');
    console.log('[diagnose] Current URL:', url);

    const title = await evaluate<string>(session, 'document.title');
    console.log('[diagnose] Page title:', title);

    // Find all buttons and links
    console.log('\n[diagnose] === Buttons ===');
    const buttons = await evaluate<string>(
      session,
      `
      Array.from(document.querySelectorAll('button, a[href]'))
        .slice(0, 20)
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.slice(0, 30),
          class: el.className,
          href: el.href || ''
        }))
        .map(b => b.tag + ' - ' + b.text + ' - ' + b.class + ' - ' + b.href)
        .join('\\n')
      `,
    );
    console.log(buttons);

    console.log('\n[diagnose] === Inputs ===');
    const inputs = await evaluate<string>(
      session,
      `
      Array.from(document.querySelectorAll('input, textarea'))
        .map(el => ({
          tag: el.tagName,
          type: el.type || 'text',
          placeholder: el.placeholder || '',
          class: el.className,
          name: el.name || ''
        }))
        .map(i => i.tag + '[type=' + i.type + '] - placeholder=' + i.placeholder + ' - class=' + i.class + ' - name=' + i.name)
        .join('\\n')
      `,
    );
    console.log(inputs);

    console.log('\n[diagnose] === Content Editable ===');
    const editables = await evaluate<string>(
      session,
      `
      Array.from(document.querySelectorAll('[contenteditable="true"]'))
        .map(el => el.tagName + ' - ' + el.className)
        .join('\\n')
      `,
    );
    console.log(editables || 'No contenteditable elements found');

    console.log('\n[diagnose] === Looking for write/create buttons ===');
    const writeButtons = await evaluate<string>(
      session,
      `
      const keywords = ['写', '发布', '图文', '文章', 'create', 'write', 'publish', 'post'];
      const all = Array.from(document.querySelectorAll('button, a, [class*="btn"], [class*="button"]'));
      all.filter(el => {
        const text = el.textContent || '';
        const className = el.className || '';
        return keywords.some(k => text.includes(k) || className.toLowerCase().includes(k));
      }).slice(0, 10).map(el => ({
        tag: el.tagName,
        text: (el.textContent || '').slice(0, 30),
        class: el.className,
        href: el.href || ''
      })).map(b => b.tag + ' - ' + b.text + ' - ' + b.class + ' - ' + b.href).join('\\n')
      `,
    );
    console.log(writeButtons || 'No write/create buttons found');

    console.log('\n[diagnose] === All divs with interesting classes ===');
    const interestingDivs = await evaluate<string>(
      session,
      `
      const all = Array.from(document.querySelectorAll('div'));
      all.filter(el => {
        const cls = el.className || '';
        return cls.includes('create') || cls.includes('write') || cls.includes('publish') || cls.includes('edit');
      }).slice(0, 10).map(el => el.tagName + ' - ' + el.className).join('\\n')
      `,
    );
    console.log(interestingDivs || 'No interesting divs found');

    console.log('\n[diagnose] Keeping browser open for 60 seconds. Please find and click the "写文章" or "发布" button manually...');
    console.log('[diagnose] Then press Ctrl+C to continue...');
    await sleep(60000);

  } finally {
    cdp.close();
    chrome.kill();
  }
}

await diagnose();
