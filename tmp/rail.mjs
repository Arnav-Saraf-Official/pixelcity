// Temporary: two opposing freight trains on a double line, then on a single line.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9373;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcr-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1200,800', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
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
  menuPreview.stop(); worldSettings = {difficulty:'ideal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); enterLoadedWorld(); setSpeed(0);
  const out = {};

  const yard = (id, x, y) => { const b = {id, type:'railyard', x, y, w:4, h:3, cx:x+2, cy:y+1, road:-1, stock:0, people:0, cars:0, residents:0, workers:0, seed:1, queue:[], art:null}; buildings.set(id, b); return b; };

  /* ---- a two-track line between two yards ---- */
  clearWorld(); mapChanged();
  yard(501, 76, 78); yard(502, 122, 78);
  for (let x = 80; x <= 121; x++) { trackOn[79 * MW + x] = 1; trackOn[80 * MW + x] = 1; }
  mapChanged();
  const t1 = newFreightTrain(B(501), 0), t2 = newFreightTrain(B(502), 0);
  t1.consist = ['material']; t2.consist = ['material'];
  for (const [t, home, dest] of [[t1, 501, 502], [t2, 502, 501]]) {
    t.at = home; t.state = 'dwell'; t.wait = 0; t.plan = [dest, home]; t.leg = 0; t.target = dest;
  }
  freight.push(t1, t2);
  const states = [];
  for (let f = 0; f < 900; f++) {
    stepFreight(1/30);
    if (f % 60 === 0) states.push([t1.state, t1.i | 0, t2.state, t2.i | 0]);
  }
  out.double = {
    t1Ran: t1.year > 0, t2Ran: t2.year > 0,
    t1State: t1.state, t2State: t2.state,
    t1At: t1.at, t2At: t2.at,
    waitedTogether: t1.state === 'dwell' && t2.state === 'dwell' && t1.year > 0 && t2.year > 0,
    states: states.slice(0, 8),
  };
  out.doubleLanes = {
    t1Reserved: t1.reserved.length, t2Reserved: t2.reserved.length,
    overlap: t1.reserved.filter(i => t2.reserved.includes(i)).length,
  };

  /* ---- the same trip on a single track: one train has to wait ---- */
  clearWorld(); mapChanged();
  yard(511, 76, 78); yard(512, 122, 78);
  for (let x = 80; x <= 121; x++) trackOn[79 * MW + x] = 1;
  mapChanged();
  const s1 = newFreightTrain(B(511), 0), s2 = newFreightTrain(B(512), 0);
  s1.consist = ['material']; s2.consist = ['material'];
  for (const [t, home, dest] of [[s1, 511, 512], [s2, 512, 511]]) {
    t.at = home; t.state = 'dwell'; t.wait = 0; t.plan = [dest, home]; t.leg = 0; t.target = dest;
  }
  freight.push(s1, s2);
  stepFreight(0.1);
  out.single = {
    first: s1.state === 'run', secondWaits: s2.state !== 'run' && s2.wait > 0,
    overlap: s1.reserved.filter(i => s2.reserved.includes(i)).length,
  };
  return out;
})()`);
console.log(JSON.stringify(result, null, 2));
chrome.kill();
process.exit(0);
