// Temporary probe: cost of the snow overlay pass during chunk building.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9351;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcin-'));
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
await send('Page.navigate', { url: page });
await sleep(2500);

console.log(JSON.stringify(await ev(`(() => {
  menuPreview.stop(); generateNewWorld('pregenerated', 2024); gameActive = true; setSpeed(0);
  const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  // find a snowy chunk and a temperate chunk
  let snow = null, grass = null;
  for (let cy = 0; cy < 15; cy += 3) for (let cx = 0; cx < 45; cx += 3) {
    let s = 0, g = 0;
    for (let y = cy * 30; y < cy * 30 + 30; y++) for (let x = cx * 40; x < cx * 40 + 40; x++) {
      const i = y * MW + x;
      if (water[i]) continue;
      if (biome[i] === 4) s++; else if (biome[i] === 1) g++;
    }
    if (!snow && s > 900) snow = [cx, cy];
    if (!grass && g > 900) grass = [cx, cy];
  }
  const time = (cx, cy, n) => { const t = []; for (let k = 0; k < n; k++) { const c = performance.now(); buildChunk(cx, cy); if (k > 2) t.push(performance.now() - c); } return +med(t).toFixed(2); };
  const out = { snow, grass };
  if (snow) out.snowMs = time(snow[0], snow[1], 14);
  if (grass) out.grassMs = time(grass[0], grass[1], 14);
  // cost of a single snow tile sprite, cold
  TEX.clear && TEX.clear();
  const t0 = performance.now();
  for (let k = 0; k < 300; k++) TEX.render('terrain', 'snow_grass', { seed: 100000 + k * 7919 }, 'k' + k);
  out.snowSpriteColdUs = +((performance.now() - t0) / 300 * 1000).toFixed(1);
  const t1 = performance.now();
  for (let k = 0; k < 300; k++) TEX.render('terrain', 'snow_grass', { seed: 42 }, 'hot');
  out.snowSpriteHotUs = +((performance.now() - t1) / 300 * 1000).toFixed(2);
  out.cacheSize = TEX.cacheSize ? TEX.cacheSize() : 'n/a';
  return out;
})()`)));
chrome.kill(); process.exit(0);
