// Temporary: long simulation run, gate persistence, and stuck-traffic checks.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9374;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcs-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1400,900', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
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

const result = await ev(`(() => {
  window.__errs = [];
  window.addEventListener('error', e => window.__errs.push(String(e.message)));
  menuPreview.stop(); worldSettings = {difficulty:'normal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); enterLoadedWorld(); setSpeed(0);
  document.body.style.display = '';
  const out = {};
  for (let k = 0; k < 9000; k++) simStep(1/30);
  out.errs = window.__errs.slice(0, 3);
  out.cars = cars.length;
  out.peds = peds.length;
  out.agents = agents.length;
  out.freight = freight.map(t => ({state: t.state, year: t.year || 0, i: t.i | 0, path: t.path ? t.path.length : 0}));
  out.trainRuns = cargoStats.trainRuns;
  out.deliveries = cargoStats.deliveries;
  out.nanCars = cars.filter(c => !Number.isFinite(c.x) || !Number.isFinite(c.y)).length;
  out.stuck = cars.filter(c => c.wait > 30).length;
  out.gates = gates.size;

  /* save round trip with a gate and a crossing */
  const RY = 100, CX = 100;
  for (let x = 90; x <= 110; x++) { const i = RY * MW + x; tile[i] = 1; walkway[i] = 1; }
  for (let y = 92; y <= 108; y++) trackOn[y * MW + CX] = 1;
  mapChanged();
  gates.add(RY * MW + CX);
  mapChanged();
  out.gateBeforeSave = gates.has(RY * MW + CX);
  const code = JSON.stringify(serialize());
  out.serializedGates = JSON.parse(code).gates;
  const reloaded = JSON.parse(code);
  const before = gates.size;
  loadData(reloaded);
  out.gateAfterLoad = gates.has(RY * MW + CX);
  out.gateCountAfter = gates.size;
  out.trackAfter = trackOn[RY * MW + CX];

  /* a gate click on a non-crossing is rejected, on a crossing accepted */
  setTool('gate');
  const t2 = {x: 90, y: 94};
  clickGate(t2);
  out.badGateRejected = !gates.has(94 * MW + 90);
  clickGate({x: CX, y: RY});
  out.goodGate = gates.has(RY * MW + CX);
  clickGate({x: CX, y: RY});
  out.gateRemoved = !gates.has(RY * MW + CX);
  return out;
})()`);
console.log(JSON.stringify(result, null, 2));
chrome.kill();
process.exit(0);
