// Temporary: exercise crossings, two-way rail, truck targeting and plane art.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9371;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcf-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: page });
await sleep(2500);

const result = await ev(`(() => {
  menuPreview.stop(); worldSettings = {difficulty:'ideal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); gameActive = true; setSpeed(0);
  document.body.style.display = '';
  const out = {};

  /* ---------- 1. crossing: a road east-west, track north-south ---------- */
  clearWorld(); mapChanged();
  const RY = 100, CX = 100;
  for (let x = 80; x <= 120; x++) { const i = RY * MW + x; tile[i] = 1; walkway[i] = 1; }
  for (let y = 90; y <= 110; y++) trackOn[y * MW + CX] = 1;
  mapChanged();
  out.crossMask = track[RY * MW + CX];
  const trackPathTiles = [];
  for (let y = 90; y <= 110; y++) trackPathTiles.push(y * MW + CX);
  const train = {id: 9001, path: trackPathTiles, i: 2, t: 0, consist: ['material','material'], state: 'run', reserved: [], dead: false};
  freight.push(train);
  markRailBusy();
  out.busyAtCrossing = railBusyAt(RY * MW + CX);
  out.busyAtFarTile = railBusyAt(92 * MW + CX);

  // a car driving east toward the crossing
  const path = [];
  for (let x = 94; x <= 108; x++) path.push(RY * MW + x);
  const car = newCar({path, color: '#fff', dest: 0, intent: 0, max: 22});
  carGeom(car); cars.push(car); carById.set(car.id, car);
  for (let f = 0; f < 90; f++) { buildBuckets(); stepCar(car, 1/30); }
  out.carTileBefore = +(car.x / T).toFixed(2);
  out.carSpeedBefore = +car.speed.toFixed(2);

  // train leaves, road clears
  freight.length = 0; markRailBusy();
  for (let f = 0; f < 90; f++) { buildBuckets(); stepCar(car, 1/30); }
  out.carTileAfter = +(car.x / T).toFixed(2);
  car.dead = true; cars.length = 0; carById.clear();

  /* ---------- 2. crossing gate data ---------- */
  gates.add(RY * MW + CX);
  mapChanged();
  out.gateKept = gates.has(RY * MW + CX);
  out.gateHoriz = (track[RY * MW + CX] & 10) !== 0;

  /* ---------- 3. two-way rail: two parallel tracks ---------- */
  clearWorld(); mapChanged();
  // two lanes, top y=80 and bottom y=81, joined at both ends by a crossover
  for (let x = 80; x <= 120; x++) { trackOn[80 * MW + x] = 1; trackOn[81 * MW + x] = 1; }
  for (let y = 78; y <= 83; y++) { trackOn[y * MW + 80] = 1; trackOn[y * MW + 120] = 1; }
  trackOn[80 * MW + 80] = 1; trackOn[80 * MW + 120] = 1;
  mapChanged();
  const A = 80 * MW + 80, Bt = 80 * MW + 120;
  // an opposing train already holds a stretch of the direct lane
  const other = {id: 9101, reserved: [], consist: []};
  out.midReserved = reservePath(other, [80 * MW + 100, 80 * MW + 101, 80 * MW + 102]);
  const p2 = trackPath(A, Bt);
  const t2 = {id: 9102, reserved: [], consist: []};
  out.directBlocked = !reservePath(t2, p2);
  const alt = trackPath(A, Bt, i => railRes[i] && railRes[i] !== 9102);
  out.altExists = !!alt;
  out.altReserved = alt ? reservePath(t2, alt) : false;
  out.disjoint = alt ? alt.every(i => !other.reserved.includes(i)) : false;
  out.p2Tiles = p2 ? p2.length : 0;
  out.altTiles = alt ? alt.length : 0;
  releaseBlocks(other); releaseBlocks(t2);
  out.releaseClears = blockHold.every(n => n === 0) && railRes.every(n => n === 0);
  out.sameTrackConflict = (() => {
    // two trains on one single line still cannot share it
    clearWorld(); mapChanged();
    for (let x = 80; x <= 120; x++) trackOn[80 * MW + x] = 1;
    mapChanged();
    const a = {id: 9201, reserved: [], consist: []}, b = {id: 9202, reserved: [], consist: []};
    reservePath(a, trackPath(80 * MW + 80, 80 * MW + 120));
    return !reservePath(b, trackPath(80 * MW + 80, 80 * MW + 120));
  })();

  /* ---------- 4. trucks pick the emptiest shop ---------- */
  clearWorld(); mapChanged();
  for (let x = 80; x <= 120; x++) { const i = 100 * MW + x; tile[i] = 1; walkway[i] = 1; }
  mapChanged();
  const mkB = (bid, type, x, y, w, h) => { const b = {id: bid, type, x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), road: 100 * MW + (x + (w >> 1)), stock: 0, people: 0, cars: 0, residents: 0, workers: 0}; buildings.set(bid, b); return b; };
  const farm = mkB(1, 'farm', 82, 92, 4, 3); farm.stock = 90;
  const near = mkB(2, 'shop', 90, 96, 1, 1); near.stock = 55;      // nearly full, close
  const far = mkB(3, 'shop', 118, 96, 1, 1); far.stock = 0;        // empty, farther
  const half = mkB(4, 'shop', 100, 96, 1, 1); half.stock = 30;     // half full, halfway
  out.pick = findCustomer(farm, 'produce')?.id;
  out.pickAmount = Math.min(TRUCK_CAP, 20, stockLimit(far) - far.stock);

  /* ---------- 5. plane heading + shadow designs ---------- */
  const nose = (h) => {
    const cv = TEX.render('vehicles', 'plane', {h, night: 1, blink: 0}, 'n' + h).canvas;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const o = (y * cv.width + x) * 4;
      if (d[o] === 254 && d[o + 1] === 231 && d[o + 2] === 113) return [x, y];
    }
    return null;
  };
  out.noseEastHeading = nose(planeHeading({ang: 0}));
  out.noseWestHeading = nose(planeHeading({ang: Math.PI}));
  out.noseSouthHeading = nose(planeHeading({ang: Math.PI / 2}));
  const sh = (h) => {
    const cv = TEX.render('vehicles', 'plane_shadow', {h}, 'x').canvas;
    return cv ? 'ok' : 'fail';
  };
  out.shadows = [0,1,2,3,4,5,6,7].map(sh).join(',');
  const shPix = (h) => {
    const cv = TEX.render('vehicles', 'plane_shadow', {h}, 's' + h).canvas;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const o = (y * cv.width + x) * 4;
      if (d[o + 3] > 0) { sx += x; sy += y; n++; }
    }
    return n ? [Math.round(sx / n), Math.round(sy / n), n] : null;
  };
  out.shadow0 = shPix(0);
  out.shadow4 = shPix(4);

  /* ---------- 6. emergency unit lane offset ---------- */
  out.unitOffsetEast = [OX[2], OY[2]];
  out.unitOffsetNorth = [OX[1], OY[1]];

  return out;
})()`);
console.log(JSON.stringify(result, null, 2));
chrome.kill();
process.exit(0);
