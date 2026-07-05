import { CdpConnection, getPageSession, evaluate, sleep, type ChromeSession } from '/Users/liyanda/.claude/skills/laodazi-post-to-baijiahao/scripts/shared/cdp.ts';

const PORT = process.argv[2];

async function clickAt(session: ChromeSession, x: number, y: number) {
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
  await sleep(60);
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
}

// find the mode toggle button (text 快速 or 专家), return its center
const FIND_TOGGLE = `(function(){
  const btns = Array.from(document.querySelectorAll('button'));
  for(const b of btns){
    const t=(b.innerText||'').trim();
    if(t==='快速'||t==='专家'){ const r=b.getBoundingClientRect(); return JSON.stringify({found:true,mode:t,x:r.x+r.width/2,y:r.y+r.height/2}); }
  }
  return JSON.stringify({found:false});
})()`;

// after opening menu, list option items containing 专家 / 快速 / 深度思考
const FIND_OPTION = (label: string) => `(function(){
  const els = Array.from(document.querySelectorAll('div,span,li,button,[role="menuitem"],[role="option"]'));
  let best=null;
  for(const el of els){
    const t=(el.innerText||'').trim();
    if(t.length===0||t.length>8) continue;
    if(t==='${label}'){
      const r=el.getBoundingClientRect();
      if(r.width>0&&r.height>0){ if(!best||r.width*r.height<best.area){ best={x:r.x+r.width/2,y:r.y+r.height/2,area:r.width*r.height}; } }
    }
  }
  return JSON.stringify(best? {found:true,x:best.x,y:best.y} : {found:false});
})()`;

async function main(){
  const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  const j = (await r.json()) as { webSocketDebuggerUrl: string };
  const cdp = await CdpConnection.connect(j.webSocketDebuggerUrl, 30000);
  const session = await getPageSession(cdp, 'doubao.com');

  let tog = JSON.parse(await evaluate<string>(session, FIND_TOGGLE));
  console.log('[mode] current toggle:', JSON.stringify(tog));
  if(!tog.found){ console.error('toggle not found'); process.exit(1); }
  if(tog.mode==='专家'){ console.log('[mode] already 专家, nothing to do'); cdp.close(); process.exit(0); }

  // open menu
  await clickAt(session, tog.x, tog.y);
  await sleep(1000);

  // find 专家 option
  const opt = JSON.parse(await evaluate<string>(session, FIND_OPTION('专家')));
  console.log('[mode] 专家 option:', JSON.stringify(opt));
  if(!opt.found){
    // dump what's visible for debugging
    const dump = await evaluate<string>(session, `(function(){return JSON.stringify(Array.from(document.querySelectorAll('div,span,li,button')).map(e=>(e.innerText||'').trim()).filter(t=>t.length>0&&t.length<=8&&/专|快|深度|思考|模式/.test(t)).slice(0,30));})()`);
    console.log('[mode] visible short candidates:', dump);
    console.error('专家 option not found after opening menu');
    process.exit(2);
  }
  await clickAt(session, opt.x, opt.y);
  await sleep(1000);

  // verify
  tog = JSON.parse(await evaluate<string>(session, FIND_TOGGLE));
  console.log('[mode] toggle after switch:', JSON.stringify(tog));
  if(tog.found && tog.mode==='专家'){ console.log('[mode] SUCCESS: switched to 专家'); }
  else { console.log('[mode] WARN: toggle text is', tog.mode, '(may still have applied)'); }
  cdp.close(); process.exit(0);
}
main().catch(e=>{console.error('FATAL',e);process.exit(1);});
