// Temporary: count how many times each drawing helper is called for one frame.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9364;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcc-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: page });
await sleep(2500);

const Z = process.argv[3] || '1';
console.log(await ev(`(() => {
  menuPreview.stop(); worldSettings = {difficulty:'normal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); gameActive = true; setSpeed(2);
  document.body.classList.remove('menu-screen'); document.getElementById('startScreen').classList.add('hidden');
  for (let k = 0; k < 4000; k++) simStep(1/30);
  const t = starterTown; centerOn(t.y * MW + t.x, ${Z});
  speed = 0; window.requestAnimationFrame = () => 0;
  for (let k = 0; k < 25; k++) render();
  const names = ['drawCarSprite','drawPed','drawBus','drawTruck','drawTree','drawTile','drawBuilding','drawRoadTile','drawPathTile','drawPlazaTile','drawDeck','drawTrackTile','drawBoat','drawShip','drawFire','drawFreightCar'];
  const counts = {};
  const saved = {};
  for (const n of names) { saved[n] = window[n]; counts[n] = 0; const f = saved[n]; window[n] = function (...a) { counts[n]++; return f.apply(this, a); }; }
  render();
  for (const n of names) window[n] = saved[n];
  const ctxCalls = { fillRect: 0, drawImage: 0, fill: 0, rect: 0, stroke: 0 };
  // count real 2d calls for one frame by wrapping the frame context
  const wrap = (obj, key, ctr) => { const f = obj[key]; obj[key] = function (...a) { ctr[key]++; return f.apply(this, a); }; return () => { obj[key] = f; }; };
  const undo = [wrap(fctx, 'fillRect', {set fillRect(v){}, get fillRect(){return 0;}})].slice(0,0);
  const a1 = fctx.fillRect.bind(fctx);
  let fr = 0, di = 0, fi = 0, rc = 0, st = 0;
  fctx.fillRect = function (...a) { fr++; return a1(...a); };
  const a2 = fctx.drawImage.bind(fctx); fctx.drawImage = function (...a) { di++; return a2(...a); };
  const a3 = fctx.fill.bind(fctx); fctx.fill = function (...a) { fi++; return a3(...a); };
  const a4 = fctx.rect.bind(fctx); fctx.rect = function (...a) { rc++; return a4(...a); };
  const a5 = ctx.stroke.bind(ctx); ctx.stroke = function (...a) { st++; return a5(...a); };
  render();
  counts.frameFillRect = fr; counts.frameDrawImage = di; counts.frameFill = fi; counts.frameRect = rc; counts.frameStroke = st;
  return counts;
})()`));

chrome.kill();
process.exit(0);
