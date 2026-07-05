import { CdpConnection, getPageSession, evaluate } from '/Users/liyanda/.claude/skills/laodazi-post-to-baijiahao/scripts/shared/cdp.ts';

const PORT = process.argv[2];
async function main() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  const j = (await r.json()) as { webSocketDebuggerUrl: string };
  const cdp = await CdpConnection.connect(j.webSocketDebuggerUrl, 30000);
  const session = await getPageSession(cdp, 'doubao.com');
  const dump = await evaluate<string>(session, `(function(){
    const ta = document.querySelector('textarea.semi-input-textarea');
    const body = document.body.innerText || '';
    const markers = ['【史实错误】','【文学化演绎】','未发现史实错误'];
    return JSON.stringify({
      url: location.href,
      textareaVal: ta ? ta.value.slice(0,60) : null,
      textareaLen: ta ? ta.value.length : -1,
      bodyLen: body.length,
      hasFingerprint: body.includes('我接下来发你一段'),
      markersInBody: markers.filter(m=>body.includes(m)),
      stopBtn: !!document.querySelector('[class*="stop" i],[aria-label*="停止"]'),
      bodyTail: body.slice(-600)
    });
  })()`);
  console.log(dump);
  cdp.close();
  process.exit(0);
}
main().catch(e=>{console.error('FATAL',e);process.exit(1);});
