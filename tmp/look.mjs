// Temporary: visual check of the gate, planes and emergency units.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9372;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcl-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=760,520', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targetWs() { for (let k = 0; k < 80; k++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(150); } throw new Error('no chrome'); }
const ws = new WebSocket(await targetWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err'); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 520, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: page });
await sleep(2500);

console.log(await ev(`(() => {
  menuPreview.stop(); worldSettings = {difficulty:'ideal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); enterLoadedWorld(); setSpeed(0);
  document.body.style.display = '';
  window.requestAnimationFrame = () => 0;
  clearWorld(); mapChanged();
  const RY = 100, CX = 100;
  for (let x = 88; x <= 112; x++) { const i = RY * MW + x; tile[i] = 1; walkway[i] = 1; }
  for (let y = 90; y <= 112; y++) trackOn[y * MW + CX] = 1;
  mapChanged();
  gates.add(RY * MW + CX);
  mapChanged();
  const tp = []; for (let y = 90; y <= 112; y++) tp.push(y * MW + CX);
  freight.push({id: 9001, path: tp, i: 9, t: 0.4, consist: ['material','liquid'], state: 'run', reserved: [], dead: false});
  markRailBusy();
  const path = []; for (let x = 92; x <= 108; x++) path.push(RY * MW + x);
  const car = newCar({path, color: '#e5e7eb', dest: 0, intent: 0, max: 22});
  carGeom(car); cars.push(car); carById.set(car.id, car);
  for (let f = 0; f < 240; f++) { buildBuckets(); stepCar(car, 1/30); }
  units.push({x: 96.5, y: 100.5, d: 2, kind: 'firetruck', state: 'enroute', path: [], i: 0, home: 0, target: 0, timer: 0});
  units.push({x: 95.5, y: 100.5, d: 4, kind: 'ambulance', state: 'enroute', path: [], i: 0, home: 0, target: 0, timer: 0});
  planes.push({id: 1, x: 99.5 * T, y: 103 * T, ang: 0, speed: 0, alt: 10, phase: 'fly'});
  planes.push({id: 2, x: 95.5 * T, y: 102.5 * T, ang: Math.PI / 2, speed: 0, alt: 10, phase: 'fly'});
  speed = 0; overlays.sky = true;
  for (const el of document.querySelectorAll('.panel')) el.style.display = 'none';
  centerOn(RY * MW + 99, 10);
  for (let k = 0; k < 6; k++) render();
  buildBuckets();
  return {z: cam.z, gate: gates.size, busy: railBusyAt(RY * MW + CX), soon: railSoonAt(RY * MW + CX), car: +(car.x / T).toFixed(2), carI: car.i, carT: +car.t.toFixed(3), spd: +car.speed.toFixed(2)};
})()`));
await sleep(250);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/look.png', Buffer.from(shot.data, 'base64'));
chrome.kill();
process.exit(0);
