// Temporary verification pass for the renderer changes.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9353;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcv-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1600,900', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targetWs() { for (let k = 0; k < 80; k++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(150); } throw new Error('no chrome'); }
const ws = new WebSocket(await targetWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(); const errors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
});
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err'); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: page });
await sleep(2500);

// 1. snow grain: two seeds with the same residues must paint identical pixels
console.log('snow', await ev(`(() => {
  const px = (seed) => {
    const t = TEX.render('terrain', 'snow_grass', { seed }, 'direct' + seed);
    return t.canvas.getContext('2d').getImageData(0, 0, 9, 9).data;
  };
  const a = px(5000), b = px(5000 + 693), c = px(5001);
  let same = 0, differ = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] === b[i]) same++; else differ++; }
  let other = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) other++;
  return { sameResiduesIdentical: differ === 0, nextSeedDiffers: other > 0, channelDiffs: differ };
})()`));

// 2. a land tile painted over water keeps biome 0: building that chunk must not throw
console.log('landTool', await ev(`(() => {
  generateNewWorld('pregenerated', 2024); gameActive = true; setSpeed(0);
  let found = null;
  for (let y = 1; y < MH - 1 && !found; y++) for (let x = 1; x < MW - 1 && !found; x++) {
    const i = y * MW + x;
    if (water[i] && !water[i - 1] && !water[i + 1]) found = { x, y, i };
  }
  if (!found) return 'no narrow channel in this world';
  water[found.i - 1] = 0; biome[found.i - 1] = 0;   // the "land" paint tool leaves biome alone
  const cx = (found.x / CW) | 0, cy = (found.y / CHH) | 0;
  buildChunk(cx, cy);
  water[found.i - 1] = 1; biome[found.i - 1] = 0;
  return 'ok';
})()`));

// 3. frame costs and draw calls after the changes
console.log('frames', await ev(`(() => {
  generateNewWorld('pregenerated', 777); gameActive = true; setSpeed(0);
  document.body.classList.remove('menu-screen');
  for (let k = 0; k < 12000; k++) simStep(1/30);
  const counts = { fillRect: 0, drawImage: 0, fill: 0, beginPath: 0 };
  const wrap = (g) => { for (const m of Object.keys(counts)) { const o = g[m]; g[m] = function(...a) { counts[m]++; return o.apply(this, a); }; } };
  const out = {};
  for (const zoom of [0.5, 1, 3]) {
    zoomTo(zoom);
    for (let k = 0; k < 70; k++) render();
    wrap(fctx); wrap(ctx);
    for (const m of Object.keys(counts)) counts[m] = 0;
    let best = Infinity;
    for (let r = 0; r < 12; r++) { const t = performance.now(); render(); best = Math.min(best, performance.now() - t); }
    out['z' + zoom] = { ms: +best.toFixed(2), fillRect: Math.round(counts.fillRect / 12), drawImage: Math.round(counts.drawImage / 12), framePx: frameCv.width + 'x' + frameCv.height };
  }
  out.spriteCache = spriteCache.size;
  out.chunks = chunks.size;
  return out;
})()`));

// 4. chunk build cost in snow vs temperate country
console.log('chunks', await ev(`(() => {
  generateNewWorld('pregenerated', 2024); gameActive = true; setSpeed(0);
  const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  const time = (cx, cy) => { const t = []; for (let k = 0; k < 14; k++) { const c = performance.now(); buildChunk(cx, cy); if (k > 3) t.push(performance.now() - c); } return +med(t).toFixed(2); };
  let snow = null, grass = null;
  for (let cy = 0; cy < 15; cy += 2) for (let cx = 0; cx < 45; cx += 2) {
    let s = 0, g = 0;
    for (let y = cy * 30; y < cy * 30 + 30; y++) for (let x = cx * 40; x < cx * 40 + 40; x++) {
      const i = y * MW + x;
      if (water[i]) continue;
      if (biome[i] === 4) s++; else if (biome[i] === 1) g++;
    }
    if (!snow && s > 800) snow = [cx, cy];
    if (!grass && g > 800) grass = [cx, cy];
  }
  return { snow: snow && time(snow[0], snow[1]), grass: grass && time(grass[0], grass[1]) };
})()`));

// 5. overlays that involve per-tile work: heat and districts
console.log('overlays', await ev(`(() => {
  generateNewWorld('pregenerated', 3333); gameActive = true; setSpeed(0);
  for (let k = 0; k < 6000; k++) simStep(1/30);
  zoomTo(0.5);
  for (let k = 0; k < 40; k++) render();
  const time = () => { let best = Infinity; for (let r = 0; r < 10; r++) { const t = performance.now(); render(); best = Math.min(best, performance.now() - t); } return +best.toFixed(2); };
  const base = time();
  overlays.heat = true;
  for (let k = 0; k < 10; k++) render();
  const heat = time();
  overlays.heat = false;
  const d = newDistrict('Painted');
  for (let y = 60; y < 200; y++) for (let x = 120; x < 400; x++) districtLayer[y * MW + x] = d.id;
  updateDistrictUI();
  for (let k = 0; k < 10; k++) render();
  const withDistricts = time();
  for (let y = 60; y < 200; y++) for (let x = 120; x < 400; x++) districtLayer[y * MW + x] = 0;
  updateDistrictUI();
  return { base, heat, withDistricts, districtChunks: districtChunks.size };
})()`));

console.log('errors', errors.length ? errors : 'none');
chrome.kill();
process.exit(0);
