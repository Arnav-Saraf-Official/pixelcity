// Temporary: chunk-cache invalidation test. Every edit must leave no stale chunk:
// rebuild every cached chunk from scratch and compare it to the cached pixels.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9366;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcv-'));
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
  generateNewWorld('pregenerated', 4242);
  gameActive = true; setSpeed(0);
  document.body.classList.remove('menu-screen');
  document.getElementById('startScreen').classList.add('hidden');
  for (let k = 0; k < 3000; k++) simStep(1/30);
  speed = 0; window.requestAnimationFrame = () => 0;
  const t = starterTown || {x: MW >> 1, y: MH >> 1};
  centerOn(t.y * MW + t.x, 3);
  for (let k = 0; k < 8; k++) render();

  const snap = () => {
    const out = [];
    for (const [k, canvas] of chunks) {
      const cw = canvas.width, ch = canvas.height;
      const d = canvas.getContext('2d').getImageData(0, 0, cw, ch).data;
      out.push([k, d]);
    }
    return out;
  };
  const diff = (a, b) => {
    let bad = 0, worst = null;
    for (const [k, da] of a) {
      const m = b.get(k);
      if (!m) continue;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) if (da[i] !== m[i] || da[i+1] !== m[i+1] || da[i+2] !== m[i+2] || da[i+3] !== m[i+3]) n++;
      if (n) { bad++; if (!worst || n > worst[1]) worst = [k, n]; }
    }
    return { bad, worst };
  };
  // force a full rebuild and index the fresh pixels
  const rebuilt = () => {
    chunks.clear();
    render();
    const m = new Map();
    for (const [k, canvas] of chunks) m.set(k, canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    return m;
  };

  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const tools = ['road', 'street', 'highway', 'path', 'plaza', 'tree', 'erase', 'water', 'land'];
  const results = { edits: 0, diffAfterEdit: [], diffAfterStable: 0 };

  for (let round = 0; round < 26; round++) {
    // make a few edits through the real edit path
    for (let e = 0; e < 3; e++) {
      const tool = tools[(rnd() * tools.length) | 0];
      const x = 4 + (rnd() * (MW - 8)) | 0, y = 4 + (rnd() * (MH - 8)) | 0;
      try { commitRect(tool, x, y, x + 1 + (rnd() * 4 | 0), y + 1 + (rnd() * 3 | 0)); results.edits++; }
      catch (err) { results.diffAfterEdit.push(['throw ' + tool, err.message]); }
    }
    // A chunk that survives an edit must match a full rebuild. Compare the cached
    // pixels as they are now against the rebuild, chunk by chunk.
    const cachedKeys = new Set(chunks.keys());
    const wasCached = new Map();
    for (const [k, canvas] of chunks) wasCached.set(k, canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    chunks.clear(); render();
    const fresh = new Map();
    for (const [k, canvas] of chunks) fresh.set(k, canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    for (const [k, old] of wasCached) {
      const nw = fresh.get(k);
      if (!nw) continue;
      let n = 0;
      for (let i = 0; i < old.length; i += 4) if (old[i] !== nw[i] || old[i+1] !== nw[i+1] || old[i+2] !== nw[i+2]) { n++; if (n > 8) break; }
      if (n) results.diffAfterEdit.push([k, n]);
    }
  }
  results.cachedKeys = results.cachedKeys || undefined;
  return results;
})()`));

chrome.kill();
process.exit(0);
