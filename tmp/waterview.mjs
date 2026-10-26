// Temporary: visual look at the waterfront blocks and the new ground props.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9381;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcv-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1000,700', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targetWs() { for (let k = 0; k < 80; k++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(150); } throw new Error('no chrome'); }
const ws = new WebSocket(await targetWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err'); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: page });
await sleep(2500);

console.log(await ev(`(() => {
  menuPreview.stop(); worldSettings = {difficulty:'ideal', placement:'lenientRoads', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); enterLoadedWorld(); setSpeed(0);
  document.body.style.display = '';
  window.requestAnimationFrame = () => 0;
  clearWorld();
  const W0 = 78, W1 = 122;
  for (let y = 50; y <= 52; y++) for (let x = W0; x <= W1; x++) { const i = y * MW + x; water[i] = 1; biome[i] = 0; tree[i] = 0; }
  for (let x = W0; x <= W1; x++) { const i = 46 * MW + x; tile[i] = 1; walkway[i] = 1; }
  mapChanged();
  placeBuilding('boardwalk', 84, 49, 11);
  placeBuilding('ferrisWheel', 90, 48, 12);
  placeBuilding('aquarium', 94, 48, 13);
  placeBuilding('riverWharf', 97, 48, 14);
  placeBuilding('boardwalk', 101, 49, 15);
  // a rocky slope with boulders, and a desert strip with every cactus
  for (let y = 40; y <= 44; y++) for (let x = W0; x <= W0 + 16; x++) { const i = y * MW + x; biome[i] = 5; tree[i] = 12 + ((x + y) % 3); }
  for (let y = 40; y <= 44; y++) for (let x = W0 + 17; x <= W1; x++) { const i = y * MW + x; biome[i] = 3; tree[i] = 8 + ((x + y) % 4); }
  markAllDirty();
  for (const el of document.querySelectorAll('.panel')) el.style.display = 'none';
  centerOn(48 * MW + 95, 9);
  mapChanged();
  for (let k = 0; k < 8; k++) render();
  return {z: cam.z, cam: [Math.round(cam.x), Math.round(cam.y)], wh: [innerWidth, innerHeight, cv.width, cv.height], buildings: buildings.size, ports: ports.length, destPark: destPark.length};
})()`));
await sleep(250);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/waterview.png', Buffer.from(shot.data, 'base64'));
chrome.kill();
process.exit(0);
