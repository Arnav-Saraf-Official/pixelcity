// Temporary: probe the signal draw path.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9378;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcs2-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=700,500', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targetWs() { for (let k = 0; k < 80; k++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(150); } throw new Error('no chrome'); }
const ws = new WebSocket(await targetWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err'); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 500, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: page });
await sleep(2500);

console.log(await ev(`(() => {
  menuPreview.stop(); worldSettings = {difficulty:'ideal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); enterLoadedWorld(); setSpeed(0);
  for (const el of document.querySelectorAll('.panel')) el.style.display = 'none';
  window.requestAnimationFrame = () => 0;
  clearWorld(); mapChanged();
  for (let x = 88; x <= 112; x++) trackOn[100 * MW + x] = 1;
  sigNode[100 * MW + 100] = 1;
  mapChanged();
  centerOn(100 * MW + 101, 10);
  let calls = [];
  const orig = drawTrackSignal;
  drawTrackSignal = (c, x, y, d, r) => { calls.push([x, y, d, r]); orig(c, x, y, d, r); };
  for (let k = 0; k < 3; k++) render();
  drawTrackSignal = orig;
  const row = [];
  for (let x = 86; x <= 114; x++) row.push([x, trackOn[100 * MW + x], track[100 * MW + x], sigNode[100 * MW + x], blockOf[100 * MW + x]]);
  return {trackSignals, calls: calls.slice(0, 5), row, cam, cvW: cv.width, cvH: cv.height, dpr, T, FW, FH,
    view: {x0: cam.x, y0: cam.y, x1: cam.x + innerWidth / cam.z, y1: cam.y + innerHeight / cam.z}};
})()`));
chrome.kill();
process.exit(0);
