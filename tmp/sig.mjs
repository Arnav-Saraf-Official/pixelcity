// Temporary: screenshot a rail signal lamp red while held, green when free.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9377;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcsg-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=700,500', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targetWs() { for (let k = 0; k < 80; k++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(150); } throw new Error('no chrome'); }
const ws = new WebSocket(await targetWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err'); return r.result.value; };
const shot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`tmp/${name}.png`, Buffer.from(s.data, 'base64')); };
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
  centerOn(100 * MW + 100, 6);
  speed = 0;
  for (let k = 0; k < 4; k++) render();
  return {sig: trackSignals.length / 3, block: blockOf[100 * MW + 101], busy: blockBusy(blockOf[100 * MW + 101])};
})()`));
await shot('sig-green');

console.log(await ev(`(() => {
  const path = []; for (let x = 101; x <= 112; x++) path.push(100 * MW + x);
  window.__train = {id: 8181, reserved: [], consist: []};
  const ok = reservePath(window.__train, path);
  for (let k = 0; k < 4; k++) render();
  return {ok, busy: blockBusy(blockOf[100 * MW + 101])};
})()`));
await shot('sig-red');
console.log(await ev(`(() => { releaseBlocks(window.__train); for (let k = 0; k < 4; k++) render(); return blockBusy(blockOf[100 * MW + 101]); })()`));
chrome.kill();
process.exit(0);
