// Temporary: final visual check of the rendered city, heat and district overlays.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9355;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcf-'));
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

await ev(`(() => {
  menuPreview.stop(); worldSettings = {difficulty:'normal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); gameActive = true; setSpeed(1);
  document.body.classList.remove('menu-screen');
  document.getElementById('startScreen').classList.add('hidden');
  for (let k = 0; k < 8000; k++) simStep(1/30);
  const t = starterTown || {x: MW >> 1, y: MH >> 1};
  centerOn(t.y * MW + t.x, 2.5);
  for (let k = 0; k < 60; k++) render();
  return 1;
})()`);
await sleep(300);
let shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/final-city.png', Buffer.from(shot.data, 'base64'));

await ev(`(() => { overlays.heat = true; for (let k = 0; k < 30; k++) render(); return 1; })()`);
await sleep(300);
shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/final-heat.png', Buffer.from(shot.data, 'base64'));

await ev(`(() => {
  overlays.heat = false;
  const d = newDistrict('Riverside');
  const t = starterTown || {x: MW >> 1, y: MH >> 1};
  for (let y = t.y - 40; y < t.y + 40; y++) for (let x = t.x - 60; x < t.x + 60; x++) districtLayer[y * MW + x] = d.id;
  updateDistrictUI();
  for (let k = 0; k < 30; k++) render();
  return 1;
})()`);
await sleep(300);
shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/final-district.png', Buffer.from(shot.data, 'base64'));

console.log('saved');
chrome.kill();
process.exit(0);
