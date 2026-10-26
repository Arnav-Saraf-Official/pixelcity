// Temporary: per-call cost of the texture cache paths used while building chunks.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9352;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcco-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1600,900', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targetWs() { for (let k = 0; k < 80; k++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(150); } throw new Error('no chrome'); }
const ws = new WebSocket(await targetWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err'); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: page });
await sleep(2500);

console.log(JSON.stringify(await ev(`(() => {
  menuPreview.stop(); generateNewWorld('pregenerated', 2024); gameActive = true; setSpeed(0);
  const per = (fn, n) => { fn(); const t = performance.now(); for (let k = 0; k < n; k++) fn(); return +((performance.now() - t) / n * 1000).toFixed(2); };
  const cvs = mk(360, 270), g = cvs.getContext('2d');
  const out = {};
  // calibrate: an empty loop and a bare canvas blit
  out.emptyLoopUs = per(() => {}, 20000);
  const treeCv = TEX.render('trees', 'oak', {}).canvas;
  out.blitUs = per(() => g.drawImage(treeCv, 4, 4), 20000);
  out.texRenderCachedUs = per(() => TEX.render('trees', 'oak', {}, 'k'), 20000);
  out.texDrawCachedUs = per(() => TEX.draw(g, 'trees', 'oak', 4, 4, {}, 'k'), 20000);
  out.texDrawStableUs = per(() => TEX.draw(g, 'trees', 'oak', 4, 4, {}), 20000);
  out.roadDrawUs = per(() => TEX.draw(g, 'roads', 'road', 4, 4, { m: 5, hw: 0, ow: 0, sw: 1, ml: 0, px: 1, py: 2, ed: null }), 20000);
  out.snowCachedUs = per(() => TEX.render('terrain', 'snow_grass', { seed: 5 }, 'hot'), 5000);
  return out;
})()`)));
chrome.kill(); process.exit(0);
