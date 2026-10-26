// Temporary: inspector for crossings + live rail signals.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9375;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcu-'));
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
  menuPreview.stop(); worldSettings = {difficulty:'ideal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); enterLoadedWorld(); setSpeed(0);
  const out = {};
  clearWorld(); mapChanged();
  const RY = 100, CX = 100;
  for (let x = 88; x <= 112; x++) { const i = RY * MW + x; tile[i] = 1; walkway[i] = 1; }
  for (let y = 92; y <= 108; y++) trackOn[y * MW + CX] = 1;
  mapChanged();

  inspectAt({x: CX, y: RY});
  out.kind = selection && selection.kind;
  out.panelVisible = !document.getElementById('inspector').classList.contains('hidden');
  out.gateText = document.getElementById('ivGate')?.textContent;
  out.trainText = document.getElementById('ivTrain')?.textContent;
  out.buttons = [...document.querySelectorAll('#iCrossBtns button')].map(b => b.textContent);
  document.querySelector('#iCrossBtns button').click();
  out.gateAfterClick = gates.has(RY * MW + CX);
  out.gateTextAfter = document.getElementById('ivGate')?.textContent;
  out.buttonsAfter = [...document.querySelectorAll('#iCrossBtns button')].map(b => b.textContent);
  document.querySelector('#iCrossBtns button').click();
  out.gateRemoved = !gates.has(RY * MW + CX);

  // the road tools button switches the panel without losing the tile
  const last = [...document.querySelectorAll('#iCrossBtns button')].pop();
  last.click();
  out.switchedToRoad = selection && selection.kind === 'road';

  // live signals: split the line into blocks and watch the hold count
  sigNode[100 * MW + CX] = 1;
  mapChanged();
  out.signalCount = trackSignals.length / 3;
  const path = []; for (let y = 92; y <= 108; y++) path.push(y * MW + CX);
  const train = {id: 7777, reserved: [], consist: []};
  out.reserved = reservePath(train, path);
  const roots = new Set(trackSignals.map((_, k, a) => k % 3 === 2 ? a[k] : null).filter(v => v));
  const busyNow = [...new Set(trackSignals.filter((_, k) => k % 3 === 2).map(b => b))].map(b => blockBusy(b));
  out.blockBusyWhileHeld = busyNow;
  releaseBlocks(train);
  const busyAfter = [...new Set(trackSignals.filter((_, k) => k % 3 === 2).map(b => b))].map(b => blockBusy(b));
  out.blockBusyAfter = busyAfter;

  // inspect a light still works, and a plain road is a road
  inspectAt({x: 90, y: RY});
  out.plainRoad = selection && selection.kind;
  return out;
})()`);
console.log(JSON.stringify(result, null, 2));
chrome.kill();
process.exit(0);
