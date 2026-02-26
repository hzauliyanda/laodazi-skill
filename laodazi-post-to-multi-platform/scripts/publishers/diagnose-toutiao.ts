#!/usr/bin/env bun
/**
 * Diagnostic script for Toutiao (头条号)
 * Helps identify the correct selectors and elements
 */

import { launchBrowser } from '../shared/cdp.js';
import { sleep } from '../shared/cdp.js';

async function diagnoseToutiao() {
  console.log('[diagnose] Launching browser...');
  const session = await launchBrowser({
    headless: false,
    profileDir: '/Users/liyanda/.local/share/multi-platform-publish-profile',
  });

  try {
    // Navigate to Toutiao
    console.log('[diagnose] Navigating to https://mp.toutiao.com/profile_v4/index');
    await session.evaluate('window.location.href = "https://mp.toutiao.com/profile_v4/index"');
    await sleep(5000);

    // Check current URL
    const url = await session.evaluate('window.location.href');
    console.log('[diagnose] Current URL:', url);

    if (url.includes('login.toutiao.com') || url.includes('xssctoken.com')) {
      console.log('[diagnose] ⚠️  Not logged in!');
      console.log('[diagnose] Please login in the browser, then press Enter to continue...');

      // Wait for user input
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });

      await sleep(2000);
      const newUrl = await session.evaluate('window.location.href');
      console.log('[diagnose] After login, current URL:', newUrl);
    }

    // Get page title
    const title = await session.evaluate('document.title');
    console.log('[diagnose] Page title:', title);

    // Find all links containing "文章"
    console.log('[diagnose] Searching for links containing "文章"...');
    const articleLinks = await session.evaluate(`
      const links = Array.from(document.querySelectorAll('a'));
      return links
        .filter(link => link.textContent && link.textContent.includes('文章'))
        .map(link => ({
          text: link.textContent.trim(),
          href: link.getAttribute('href'),
          className: link.getAttribute('class'),
          id: link.getAttribute('id'),
        }));
    `);

    console.log('[diagnose] Found', articleLinks.length, 'links containing "文章":');
    articleLinks.forEach((link, i) => {
      console.log(`  ${i + 1}. Text: "${link.text}"`);
      console.log(`     Href: ${link.href}`);
      console.log(`     Class: ${link.className}`);
      console.log(`     ID: ${link.id}`);
      console.log('');
    });

    // Find all elements with class containing "ProseMirror"
    console.log('[diagnose] Searching for elements with class containing "ProseMirror"...');
    const proseMirrorElements = await session.evaluate(`
      const elements = Array.from(document.querySelectorAll('[class*="ProseMirror"]'));
      return elements.map(el => ({
        tagName: el.tagName,
        className: el.getAttribute('class'),
        id: el.getAttribute('id'),
        contentEditable: el.getAttribute('contenteditable'),
      }));
    `);

    console.log('[diagnose] Found', proseMirrorElements.length, 'elements with class containing "ProseMirror":');
    proseMirrorElements.forEach((el, i) => {
      console.log(`  ${i + 1}. Tag: ${el.tagName}`);
      console.log(`     Class: ${el.className}`);
      console.log(`     ID: ${el.id}`);
      console.log(`     ContentEditable: ${el.contentEditable}`);
      console.log('');
    });

    // Find all elements with class containing "autofit-textarea-content"
    console.log('[diagnose] Searching for elements with class containing "autofit-textarea-content"...');
    const titleElements = await session.evaluate(`
      const elements = Array.from(document.querySelectorAll('[class*="autofit-textarea-content"]'));
      return elements.map(el => ({
        tagName: el.tagName,
        className: el.getAttribute('class'),
        id: el.getAttribute('id'),
        placeholder: el.getAttribute('placeholder'),
      }));
    `);

    console.log('[diagnose] Found', titleElements.length, 'elements with class containing "autofit-textarea-content":');
    titleElements.forEach((el, i) => {
      console.log(`  ${i + 1}. Tag: ${el.tagName}`);
      console.log(`     Class: ${el.className}`);
      console.log(`     ID: ${el.id}`);
      console.log(`     Placeholder: ${el.placeholder}`);
      console.log('');
    });

    // Find all elements with class containing "write" or "publish"
    console.log('[diagnose] Searching for elements with class containing "write" or "publish"...');
    const buttonElements = await session.evaluate(`
      const elements = Array.from(document.querySelectorAll('[class*="write"], [class*="publish"]'));
      return elements.map(el => ({
        tagName: el.tagName,
        className: el.getAttribute('class'),
        text: el.textContent.trim(),
        id: el.getAttribute('id'),
      }));
    `);

    console.log('[diagnose] Found', buttonElements.length, 'elements with class containing "write" or "publish":');
    buttonElements.forEach((el, i) => {
      console.log(`  ${i + 1}. Tag: ${el.tagName}`);
      console.log(`     Class: ${el.className}`);
      console.log(`     Text: ${el.text}`);
      console.log(`     ID: ${el.id}`);
      console.log('');
    });

    console.log('[diagnose] ✓ Diagnosis complete!');
    console.log('[diagnose] Browser will remain open for manual inspection. Press Ctrl+C to exit.');

    // Keep browser open for manual inspection
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });

  } finally {
    await session.close().catch(() => {});
  }
}

await diagnoseToutiao().catch(err => {
  console.error('[diagnose] Error:', err);
  process.exit(1);
});
