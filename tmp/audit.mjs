// Temporary audit: starter-town site quality across seeds, plus sim and render costs.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9361;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pca-'));
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

// --- starter town site quality -------------------------------------------
console.log(await ev(`(() => {
  menuPreview.stop();
  const rows = [];
  for (let seed = 1; seed <= 80; seed++) {
    generateNewWorld('pregenerated', seed * 101);
    const t = starterTown;
    if (!t) { rows.push([seed * 101, 'NO TOWN', 0, 0, 0]); continue; }
    let land = 0, n = 0, roads = 0;
    for (let y = t.y - 24; y <= t.y + 24; y++) for (let x = t.x - 34; x <= t.x + 34; x++) {
      if (!inb(x, y)) continue; n++; if (!water[y * MW + x]) land++;
    }
    for (let i = 0; i < N; i++) if (tile[i] === 1 || tile[i] === 2) roads++;
    rows.push([seed * 101, (land / n * 100).toFixed(0), roads, buildings.size, treesNear(t)]);
  }
  function treesNear(t) { let k = 0; for (let y = t.y - 20; y <= t.y + 20; y++) for (let x = t.x - 30; x <= t.x + 30; x++) if (inb(x, y) && tree[y * MW + x]) k++; return k; }
  const bad = rows.filter(r => r[1] !== 'NO TOWN' && r[1] < 85);
  return { seeds: rows.length, noTown: rows.filter(r => r[1] === 'NO TOWN').length, lowLand: bad.length, worst: rows.slice().sort((a, b) => a[1] - b[1]).slice(0, 8), avgRoads: (rows.reduce((s, r) => s + r[2], 0) / rows.length) | 0, avgBld: (rows.reduce((s, r) => s + r[3], 0) / rows.length) | 0 };
})()`));

// --- sim cost ------------------------------------------------------------
console.log(await ev(`(() => {
  generateNewWorld('pregenerated', 777); gameActive = true; setSpeed(3);
  for (let k = 0; k < 3000; k++) simStep(1/30);
  const t0 = performance.now();
  for (let k = 0; k < 3000; k++) simStep(1/30);
  return { simStepMs: +((performance.now() - t0) / 3000).toFixed(3), cars: cars.length, agents: agents.length, peds: peds.length };
})()`));

// --- render cost at each zoom, and cache growth --------------------------
console.log(await ev(`(() => {
  const out = [];
  for (const z of ZOOMS) {
    const t = starterTown || {x: MW >> 1, y: MH >> 1};
    centerOn(t.y * MW + t.x, z);
    for (let k = 0; k < 25; k++) render();
    let best = 1e9;
    for (let k = 0; k < 12; k++) { const a = performance.now(); render(); const b = performance.now(); if (b - a < best) best = b - a; }
    out.push([z, +best.toFixed(1), frameCv.width + 'x' + frameCv.height]);
  }
  return out;
})()`));

console.log(await ev(`(() => ({ chunks: chunks.size, districtChunks: districtChunks.size, textureCache: TEX.cacheSize ? TEX.cacheSize() : 'n/a', treesOk: true }))()`));

// --- overlays do not leak state -----------------------------------------
console.log(await ev(`(() => {
  const t = starterTown; centerOn(t.y * MW + t.x, 3);
  const before = [overlays.heat, overlays.grid, overlays.underground];
  overlays.heat = true; overlays.grid = true; overlays.underground = true;
  for (let k = 0; k < 5; k++) render();
  overlays.heat = false; overlays.grid = false; overlays.underground = false;
  for (let k = 0; k < 3; k++) render();
  return { alpha: ctx.globalAlpha, smoothing: ctx.imageSmoothingEnabled, frameSmoothing: fctx.imageSmoothingEnabled, dash: ctx.getLineDash().length, before };
})()`));

chrome.kill();
process.exit(0);
