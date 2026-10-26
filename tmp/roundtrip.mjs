// Temporary: round-trip and long-run correctness checks.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9367;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcs-'));
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

// --- save -> load -> identical frame -------------------------------------
console.log('round-trip', await ev(`(() => {
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
  // paint a district so the district layer travels through the save too
  const d = newDistrict('Test Ward');
  for (let y = t.y - 12; y < t.y + 12; y++) for (let x = t.x - 16; x < t.x + 16; x++) districtLayer[y * MW + x] = d.id;
  updateDistrictUI();
  overlays.districts = true;
  for (let k = 0; k < 6; k++) render();
  const grab = () => { const d2 = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 0; for (let i = 0; i < d2.length; i += 97) h = (h * 31 + d2[i]) | 0; return h; };
  const before = grab();
  const state = { pop: agents.length, cars: cars.length, bld: buildings.size, min: Math.round(gameMin), trucks: freight.length };
  const saved = serialize();
  const json = JSON.parse(JSON.stringify(saved));
  clearWorld();
  loadData(json);
  finishWorld();
  for (let k = 0; k < 6; k++) render();
  const after = grab();
  return { sameFrame: before === after, before, after, state,
    state2: { pop: agents.length, cars: cars.length, bld: buildings.size, min: Math.round(gameMin), trucks: freight.length },
    districts: districts.size, dTiles: (() => { let n = 0; for (let i = 0; i < N; i++) if (districtLayer[i]) n++; return n; })() };
})()`));

// --- long run, three seeds ----------------------------------------------
console.log('longrun', await ev(`(() => {
  const out = [];
  for (const seed of [11, 222, 3333]) {
    generateNewWorld('pregenerated', seed);
    gameActive = true; setSpeed(3);
    let nan = 0, worst = 0;
    for (let k = 0; k < 24000; k++) {
      simStep(1/30);
      if (k % 4000 === 0) {
        for (const c of cars) if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) nan++;
        for (const a of agents) if (!Number.isFinite(a.mood)) nan++;
        for (const b of boats) if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) nan++;
        for (const p of peds) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) nan++;
        for (const p of planes) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) nan++;
      }
      const dt = 0;
      worst = Math.max(worst, cars.length);
    }
    let negPop = 0; for (const b of buildings.values()) if (b.people < 0 || b.cars < 0 || b.residents < 0) negPop++;
    out.push({ seed, pop: agents.length, cars: cars.length, peakCars: worst, bld: buildings.size,
nan, negPop, min: Math.round(gameMin), day: Math.floor(gameMin / 1440) + 1,
      trips: stats.trips.length, air: planes.length, boats: boats.length, freight: freight.length, metros: metros.length });
  }
  return out;
})()`));

chrome.kill();
process.exit(0);
