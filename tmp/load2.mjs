// Temporary: load determinism and post-load repopulation.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9368;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcl-'));
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
  menuPreview.stop();
  worldSettings = {difficulty:'normal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 9090);
  gameActive = true; setSpeed(3);
  document.body.classList.remove('menu-screen');
  document.getElementById('startScreen').classList.add('hidden');
  for (let k = 0; k < 9000; k++) simStep(1/30);
  speed = 0; window.requestAnimationFrame = () => 0;
  const t = starterTown || {x: MW >> 1, y: MH >> 1};
  centerOn(t.y * MW + t.x, 2);
  const saved = JSON.parse(JSON.stringify(serialize()));
  const hashFrame = () => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; };
  const load = () => { clearWorld(); loadData(saved); finishWorld(); for (let k = 0; k < 6; k++) render(); return hashFrame(); };
  const h1 = load(), h2 = load();
  const repop = [];
  for (const steps of [300, 1200, 3000]) {
    clearWorld(); loadData(saved); finishWorld();
    for (let k = 0; k < steps; k++) simStep(1/30);
    let res = 0; for (const b of buildings.values()) res += b.residents;
    repop.push({ steps, pop: agents.length, cars: cars.length, residents: res });
  }
  return { deterministic: h1 === h2, h1, h2, repop };
})()`));

chrome.kill();
process.exit(0);
