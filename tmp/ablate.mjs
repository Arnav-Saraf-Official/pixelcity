// Temporary: ablate parts of the 50% frame to find where the time goes.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9362;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcb-'));
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
  for (let k = 0; k < 30; k++) render();
  const time = () => { let best = 1e9; for (let k = 0; k < 12; k++) { const a = performance.now(); render(); const b = performance.now(); if (b - a < best) best = b - a; } return +best.toFixed(2); };
  speed = 0; window.requestAnimationFrame = () => 0;   // stop the main loop so it cannot interleave
  const settle = () => { for (let k = 0; k < 20; k++) render(); };
  settle();
  const base = time();
  const out = { base, buildings: buildings.size, trees: (() => { let n = 0; for (let i = 0; i < N; i++) if (tree[i]) n++; return n; })(), cars: cars.length, agents: agents.length };
  const ablate = (name, fn) => {
    const saved = {};
    for (const k of Object.keys(fn)) { saved[k] = window[k]; window[k] = fn[k]; }
    out[name] = time();
    for (const k of Object.keys(saved)) window[k] = saved[k];
  };
  const noop = () => {};
  ablate('noBuilding', { drawBuilding: noop });
  ablate('noTree', { drawTree: noop });
  ablate('noCars', { drawCarSprite: noop, drawPed: noop, drawBus: noop, drawTruck: noop });
  ablate('noDecor', { drawPathTile: noop, drawPlazaTile: noop, drawPlatform: noop, drawDeck: noop, drawTrackTile: noop });
  ablate('noRoad', { drawRoadTile: noop });
  ablate('noGround', { drawTile: noop });
  settle();
  out.baseAgain = time();
  return out;
})()`));

chrome.kill();
process.exit(0);
