// Temporary: cost of the periodic HUD/overlay work.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9369;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pch-'));
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
  generateNewWorld('pregenerated', 777); gameActive = true; setSpeed(2);
  document.body.classList.remove('menu-screen');
  document.getElementById('startScreen').classList.add('hidden');
  for (let k = 0; k < 6000; k++) simStep(1/30);
  speed = 0; window.requestAnimationFrame = () => 0;
  const t = starterTown; centerOn(t.y * MW + t.x, 2);
  for (let k = 0; k < 6; k++) render();
  const bench = (label, fn, n) => { fn(); const a = performance.now(); for (let k = 0; k < n; k++) fn(); return [+((performance.now() - a) / n).toFixed(2), label]; };
  return {
    computeArea: bench('computeArea', () => computeArea(), 8),
    updateHotspots: bench('updateHotspots', () => updateHotspots(), 8),
    computeDistStats: bench('computeDistStats', () => computeDistStats(), 30),
    hud: bench('hud', () => hud(0.26), 12),
    updateMaterialHUD: bench('updateMaterialHUD', () => updateMaterialHUD(), 30),
    updateHover: bench('updateHover', () => updateHover(), 30),
    minimapFull: bench('updateMini', () => updateMini(0, 0, MW - 1, MH - 1), 6),
    lights: lights.size, buildings: buildings.size, agents: agents.length
  };
})()`));

chrome.kill();
process.exit(0);
