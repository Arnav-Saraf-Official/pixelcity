// Temporary: micro-benchmark small sprite blits and rect paths in the game's frame buffer.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9365;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcm-'));
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

console.log(await ev(`(() => {
  menuPreview.stop(); worldSettings = {difficulty:'normal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); gameActive = true; setSpeed(2);
  document.body.style.display = '';
  for (let k = 0; k < 3000; k++) simStep(1/30);
  speed = 0; window.requestAnimationFrame = () => 0;
  const t = starterTown; centerOn(t.y * MW + t.x, 1);
  for (let k = 0; k < 10; k++) render();
  const f = fctx;
  const sp = sprite('vehicles', 'car_h', { color: '#e5e7eb' }, '#e5e7eb');
  const t0 = performance.now();
  for (let k = 0; k < 1151; k++) f.drawImage(sp, (k % 120) * 10, ((k / 120 | 0)) * 8);
  const blits = performance.now() - t0;
  const t1 = performance.now();
  f.fillStyle = '#e5e7eb'; f.beginPath();
  for (let k = 0; k < 1151; k++) { const x = (k % 120) * 10, y = ((k / 120 | 0)) * 8; f.rect(x, y, 10, 3); f.rect(x + 1, y + 3, 8, 3); }
  f.fill();
  const pathFill = performance.now() - t1;
  const t2 = performance.now();
  for (let k = 0; k < 1151; k++) sprite('vehicles', 'car_h', { color: '#e5e7eb' }, '#e5e7eb');
  const lookups = performance.now() - t2;
  return { blits: +blits.toFixed(2), pathFill: +pathFill.toFixed(2), lookups: +lookups.toFixed(2) };
})()`));

chrome.kill();
process.exit(0);
