import fs from 'node:fs';
import { CdpConnection, getPageSession, evaluate, sleep, type ChromeSession } from '/Users/liyanda/.claude/skills/laodazi-post-to-baijiahao/scripts/shared/cdp.ts';

// argv: [port] [inputFile] [outputFile] [--new]
const PORT = process.argv[2];
const INPUT_FILE = process.argv[3];
const OUTPUT_FILE = process.argv[4];
const NEW_CHAT = process.argv.includes('--new');
const READ_ONLY = process.argv.includes('--read-only');

if (!PORT || !INPUT_FILE || !OUTPUT_FILE) {
  console.error('usage: bun doubao-verify.ts <port> <inputFile> <outputFile> [--new]');
  process.exit(2);
}

const TEXT = fs.readFileSync(INPUT_FILE, 'utf-8');
const MARKERS = ['【史实错误】', '【文学化演绎】', '未发现史实错误'];

async function getBrowserWsUrl(port: string): Promise<string> {
  const r = await fetch(`http://127.0.0.1:${port}/json/version`);
  const j = (await r.json()) as { webSocketDebuggerUrl: string };
  return j.webSocketDebuggerUrl;
}

// Fill the Semi Design textarea using the native value setter so React registers it.
const FILL_FN = (text: string) => `(function(t){
  const el = document.querySelector('textarea.semi-input-textarea');
  if(!el) return 'NO_TEXTAREA';
  el.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, t);
  el.dispatchEvent(new Event('input', {bubbles:true}));
  return 'OK:' + el.value.length;
})(${JSON.stringify(text)})`;

const TEXTAREA_VALUE = `(function(){ const el=document.querySelector('textarea.semi-input-textarea'); return el? el.value : null; })()`;

// Extract the AI reply. User messages also contain all markers (they are in the
// instruction / follow-up), so we EXCLUDE any element whose text includes a user-message
// fingerprint. In a REUSED conversation, prior-round AI replies also match, so we also
// exclude any text present in `baseline` (captured just before we sent). Among what
// remains we take the LARGEST innerText (the newest reply's wrapper).
const FINGERPRINTS = ['我接下来发你一段', '这是根据你上面意见修订后的版本'];
function extractFn(baseline: string[]): string {
  return `(function(){
    const markers = ${JSON.stringify(MARKERS)};
    const fps = ${JSON.stringify(FINGERPRINTS)};
    const base = ${JSON.stringify(baseline)};
    const all = Array.from(document.querySelectorAll('div,section,article,p'));
    let best=null, bestLen=-1;
    for(const el of all){
      const t = el.innerText || '';
      if(fps.some(f => t.includes(f))) continue;          // skip user-message subtrees
      if(!markers.some(m => t.includes(m))) continue;      // must look like a verdict
      if(base.indexOf(t) !== -1) continue; // skip pre-existing (prior rounds), EXACT match only
      if(t.length > bestLen){ bestLen=t.length; best=t; }
    }
    if(best===null) return JSON.stringify({ready:false, text:null});
    return JSON.stringify({ready:true, text:best, len:bestLen});
  })()`;
}
// Collect current marker-blocks (non-fingerprint) as the baseline to diff against.
const BASELINE_FN = `(function(){
  const markers = ${JSON.stringify(MARKERS)};
  const fps = ${JSON.stringify(FINGERPRINTS)};
  const all = Array.from(document.querySelectorAll('div,section,article,p'));
  const out = [];
  for(const el of all){
    const t = el.innerText || '';
    if(fps.some(f => t.includes(f))) continue;
    if(!markers.some(m => t.includes(m))) continue;
    out.push(t);
  }
  return JSON.stringify(out);
})()`;

// Diagnostics: dump candidate send buttons around the input.
const SEND_CANDIDATES = `(function(){
  const btns = Array.from(document.querySelectorAll('button,[role="button"],div[class*="send" i],span[class*="send" i]'));
  return JSON.stringify(btns.slice(0,40).map(function(b){
    const r=b.getBoundingClientRect();
    return {tag:b.tagName.toLowerCase(), cls:(b.className&&b.className.toString().slice(0,50))||null, testid:b.getAttribute&&b.getAttribute('data-testid')||null, aria:b.getAttribute&&b.getAttribute('aria-label')||null, dis:b.getAttribute&&b.getAttribute('aria-disabled')||b.disabled||null, x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};
  }));
})()`;

async function pressEnter(session: ChromeSession) {
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, { sessionId: session.sessionId });
  await sleep(30);
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, { sessionId: session.sessionId });
}

async function clickSemiSendButton(session: ChromeSession): Promise<boolean> {
  // Doubao's send button: an icon button at bottom-right of the composer. Click the last visible send-ish element.
  const res = await evaluate<string>(session, `(function(){
    const cands = Array.from(document.querySelectorAll('[class*="send" i] , [data-testid*="send" i], button svg')).map(function(e){return e.closest('button,[role="button"],div[class*="send" i]')||e;});
    const uniq = Array.from(new Set(cands)).filter(function(el){ if(!el) return false; const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; });
    if(uniq.length===0) return 'NONE';
    const el = uniq[uniq.length-1];
    const r = el.getBoundingClientRect();
    el.scrollIntoView({block:'center'});
    return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2});
  })()`);
  if (res === 'NONE') return false;
  const pos = JSON.parse(res);
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
  await sleep(50);
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
  return true;
}

async function main() {
  console.log(`[verify] connecting to Chrome on port ${PORT}`);
  const wsUrl = await getBrowserWsUrl(PORT);
  const cdp = await CdpConnection.connect(wsUrl, 30_000);
  const session = await getPageSession(cdp, 'doubao.com');
  console.log('[verify] attached to doubao page');

  const baselineFile = OUTPUT_FILE + '.baseline.json';
  let baseline: string[] = [];

  if (READ_ONLY) {
    console.log('[verify] READ-ONLY mode: skipping fill/send, polling current chat for reply');
    if (fs.existsSync(baselineFile)) {
      try { baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf-8')); console.log('[verify] loaded baseline blocks:', baseline.length); } catch {}
    }
  } else {
    if (NEW_CHAT) {
      console.log('[verify] starting a new chat');
      await session.cdp.send('Page.navigate', { url: 'https://www.doubao.com/chat/' }, { sessionId: session.sessionId });
      await sleep(4000);
    }

    // Ensure textarea present
    let ok = false;
    for (let i = 0; i < 20; i++) {
      const has = await evaluate<boolean>(session, `!!document.querySelector('textarea.semi-input-textarea')`);
      if (has) { ok = true; break; }
      await sleep(500);
    }
    if (!ok) { console.error('[verify] textarea not found'); process.exit(1); }

    // Capture baseline (prior-round replies already on the page) BEFORE sending.
    try {
      baseline = JSON.parse(await evaluate<string>(session, BASELINE_FN));
      fs.writeFileSync(baselineFile, JSON.stringify(baseline), 'utf-8');
      console.log('[verify] baseline marker-blocks captured:', baseline.length);
    } catch (e) { console.log('[verify] baseline capture failed (continuing with empty):', (e as Error).message); }

    // Fill
    const fillRes = await evaluate<string>(session, FILL_FN(TEXT));
    console.log('[verify] fill result:', fillRes);
    await sleep(500);

    // Send: try Enter first
    await pressEnter(session);
    await sleep(1500);
    let val = await evaluate<string | null>(session, TEXTAREA_VALUE);
    if (val && val.length > 10) {
      console.log('[verify] Enter did not send (textarea still has text). Trying send button...');
      const clicked = await clickSemiSendButton(session);
      console.log('[verify] send button clicked:', clicked);
      await sleep(1500);
      val = await evaluate<string | null>(session, TEXTAREA_VALUE);
      if (val && val.length > 10) {
        console.log('[verify] STILL not sent. Send button candidates dump:');
        console.log(await evaluate<string>(session, SEND_CANDIDATES));
        process.exit(3);
      }
    }
    console.log('[verify] message sent, waiting for generation...');
  }

  // Poll for stable reply
  const startTs = Date.now();
  const MAX_MS = 8 * 60 * 1000;
  let lastText = '';
  let stableCount = 0;
  let finalText = '';
  const extractExpr = extractFn(baseline);
  while (Date.now() - startTs < MAX_MS) {
    await sleep(6000);
    const raw = await evaluate<string>(session, extractExpr);
    const parsed = JSON.parse(raw);
    const cur = parsed.ready ? (parsed.text || '') : '';
    const elapsed = Math.round((Date.now() - startTs) / 1000);
    console.log(`[verify] t=${elapsed}s len=${cur.length} stable=${stableCount}`);
    if (cur.length > 40 && cur === lastText) {
      stableCount++;
      if (stableCount >= 2) { finalText = cur; break; }
    } else {
      stableCount = 0;
    }
    lastText = cur;
  }

  if (!finalText) {
    console.log('[verify] no stable reply captured. Last seen len=' + lastText.length);
    if (lastText.length > 40) finalText = lastText; // salvage
  }

  if (finalText) {
    fs.writeFileSync(OUTPUT_FILE, finalText, 'utf-8');
    console.log('[verify] SAVED reply to', OUTPUT_FILE, 'chars=', finalText.length);
    const hasMarker = MARKERS.some(m => finalText.includes(m));
    console.log('[verify] contains-valid-marker:', hasMarker);
  } else {
    console.error('[verify] FAILED to capture reply');
    process.exit(4);
  }

  cdp.close();
  process.exit(0);
}

main().catch((e) => { console.error('[verify] FATAL', e); process.exit(1); });
