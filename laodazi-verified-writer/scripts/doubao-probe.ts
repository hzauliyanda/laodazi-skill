import os from 'node:os';
import path from 'node:path';
import { launchChrome, getPageSession, evaluate, sleep } from '/Users/liyanda/.claude/skills/laodazi-post-to-baijiahao/scripts/shared/cdp.ts';

const PROFILE = path.join(os.homedir(), '.local', 'share', 'doubao-verify-profile');

const PROBE = `(function(){
  function info(el){
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: (el.className && el.className.toString().slice(0,80)) || null,
      ph: el.getAttribute && (el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || el.getAttribute('aria-label')) || null,
      testid: el.getAttribute && el.getAttribute('data-testid') || null,
      vis: r.width>0 && r.height>0,
      w: Math.round(r.width), h: Math.round(r.height)
    };
  }
  const ce = Array.from(document.querySelectorAll('[contenteditable="true"], textarea')).map(info);
  const btns = Array.from(document.querySelectorAll('button, [role="button"], [class*="send" i], [class*="Send" i]'))
    .map(function(b){ return { tag:b.tagName.toLowerCase(), cls:(b.className&&b.className.toString().slice(0,60))||null, testid:b.getAttribute&&b.getAttribute('data-testid')||null, aria:b.getAttribute&&b.getAttribute('aria-label')||null, txt:(b.innerText||'').slice(0,20), dis:b.disabled||null }; })
    .filter(function(b){ return (b.aria&&/send|发送/i.test(b.aria)) || (b.cls&&/send/i.test(b.cls)) || (b.testid&&/send/i.test(b.testid)) || /发送/.test(b.txt); }).slice(0,10);
  const bodyText = document.body.innerText || '';
  return JSON.stringify({
    title: document.title,
    url: location.href,
    loginHints: { 扫码: bodyText.includes('扫码'), 登录: bodyText.includes('登录'), 手机号: bodyText.includes('手机号') },
    editable: ce,
    sendButtons: btns
  });
})()`;

async function main() {
  console.log('[probe] launching Chrome with dedicated profile:', PROFILE);
  const { cdp, chrome } = await launchChrome('https://www.doubao.com/chat/', PROFILE);
  await sleep(4000);
  let session;
  try {
    session = await getPageSession(cdp, 'doubao.com');
  } catch (e) {
    console.log('[probe] cannot attach to doubao page:', (e as Error).message);
    // try any page
    session = await getPageSession(cdp, 'http');
  }

  // Poll up to 150s so user can log in; re-dump each 15s
  const maxLoops = 10;
  for (let i = 0; i < maxLoops; i++) {
    const raw = await evaluate<string>(session, PROBE);
    console.log(`\n===== PROBE #${i + 1} (${(i * 15)}s) =====`);
    console.log(raw);
    const parsed = JSON.parse(raw);
    const hasInput = parsed.editable.some((e: any) => e.vis && (e.tag === 'textarea' || e.h >= 20));
    if (hasInput && !parsed.loginHints.扫码) {
      console.log('\n[probe] input box detected & no QR-login screen -> looks LOGGED IN. Stopping early.');
      break;
    }
    if (i < maxLoops - 1) {
      console.log('[probe] not confirmed logged-in yet, waiting 15s (log in the popped window if needed)...');
      await sleep(15000);
    }
  }

  console.log('\n[probe] done. Leaving Chrome open. Close it manually or it will be reused next run.');
  cdp.close();
  // do NOT kill chrome; keep profile warm. But detach so node can exit.
  chrome.unref();
  process.exit(0);
}

main().catch((e) => { console.error('[probe] FATAL', e); process.exit(1); });
