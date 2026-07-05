import fs from 'node:fs';
import { CdpConnection, getPageSession, evaluate } from '/Users/liyanda/.claude/skills/laodazi-post-to-baijiahao/scripts/shared/cdp.ts';

const PORT = process.argv[2];
const OUT = process.argv[3];

const GRAB = `(function(){
  const markers = ['【史实错误】','【文学化演绎】','未发现史实错误'];
  const fps = ['我接下来发你一段','这是根据你上面意见修订后的版本'];
  const all = Array.from(document.querySelectorAll('div,section,article,p'));
  // candidate marker blocks that are NOT user messages
  let seed=null, seedBottom=-Infinity;
  for(const el of all){
    const t = el.innerText || '';
    if(!markers.some(m=>t.includes(m))) continue;
    if(fps.some(f=>t.includes(f))) continue;
    const b = el.getBoundingClientRect().bottom;
    if(b > seedBottom){ seedBottom=b; seed=el; }   // lowest-on-page = newest
  }
  if(!seed) return JSON.stringify({ok:false});
  // climb to the largest ancestor that still contains no user-message fingerprint
  let node = seed, best = seed;
  while(node && node.parentElement){
    node = node.parentElement;
    const t = node.innerText || '';
    if(fps.some(f=>t.includes(f))) break;   // stop before we swallow a user message
    best = node;
  }
  return JSON.stringify({ok:true, text: best.innerText || '', len:(best.innerText||'').length});
})()`;

async function main(){
  const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  const j = (await r.json()) as { webSocketDebuggerUrl: string };
  const cdp = await CdpConnection.connect(j.webSocketDebuggerUrl, 30000);
  const session = await getPageSession(cdp, 'doubao.com');
  const raw = await evaluate<string>(session, GRAB);
  const parsed = JSON.parse(raw);
  if(!parsed.ok){ console.error('no reply block found'); process.exit(1); }
  fs.writeFileSync(OUT, parsed.text, 'utf-8');
  console.log('GRABBED len=', parsed.len, '->', OUT);
  console.log('--- head ---\n' + parsed.text.slice(0,200));
  console.log('--- tail ---\n' + parsed.text.slice(-200));
  cdp.close(); process.exit(0);
}
main().catch(e=>{console.error('FATAL',e);process.exit(1);});
