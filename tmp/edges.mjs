// Temporary: how much the skipped screen clear costs, and whether the screen
// edges stay clean after panning and zooming.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9354;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pce-'));
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

console.log('clearCost', await ev(`(() => {
  generateNewWorld('pregenerated', 777); gameActive = true; setSpeed(0);
  const t = [];
  for (let k = 0; k < 20; k++) { const c = performance.now(); ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.getImageData(0,0,1,1); t.push(performance.now() - c); }
  t.sort((a, b) => a - b);
  return { fullClearMs: +t[10].toFixed(2), canvas: cv.width + 'x' + cv.height };
})()`));

// pan and zoom around, then look at the screen edges
await ev(`(() => {
  for (const z of [0.5, 1, 2, 6, 0.75, 0.5]) {
    zoomTo(z);
    for (let k = 0; k < 30; k++) { cam.x += 7.3; cam.y -= 4.7; clampCam(); render(); }
  }
  zoomTo(0.5);
  for (let k = 0; k < 40; k++) render();
  return 1;
})()`);
await sleep(300);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/edges.png', Buffer.from(shot.data, 'base64'));

// sample the outermost pixel rows/columns for the background colour (#0d1018)
console.log('edges', await ev(`(() => {
  const g = cv.getContext('2d');
  const pick = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
  const w = cv.width, h = cv.height;
  return { topLeft: pick(0, 0), topRight: pick(w - 1, 0), bottomLeft: pick(0, h - 1), bottomRight: pick(w - 1, h - 1) };
})()`));
chrome.kill();
process.exit(0);
