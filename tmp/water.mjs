// Temporary: river trade routes, waterfront leisure, cacti and boulders.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9379;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcw-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=900,600', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targetWs() { for (let k = 0; k < 80; k++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(150); } throw new Error('no chrome'); }
const ws = new WebSocket(await targetWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err'); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: page });
await sleep(2500);

const out = await ev(`(() => {
  menuPreview.stop(); worldSettings = {difficulty:'ideal', placement:'requireEverything', taxSales:0, taxIncome:0};
  generateNewWorld('pregenerated', 777); enterLoadedWorld(); setSpeed(0);
  document.body.style.display = '';
  window.requestAnimationFrame = () => 0;
  const out = {};

  /* ---------- 1. generated terrain: desert cacti, rocky boulders, no rock trees ---------- */
  const cacti = [0,0,0,0], boulders = [0,0,0], rockTrees = 0, desert = [0,0];
  for (let i = 0; i < N; i++) {
    if (water[i]) continue;
    const v = tree[i];
    if (!v) continue;
    if (v === 8) cacti[0]++;
    else if (v >= 9 && v <= 11) cacti[v - 8]++;
    if (v >= 12) boulders[v - 12]++;
    if (biome[i] === 5 && v <= 8) rockTrees++;
    if (biome[i] === 3) desert[0]++, desert[1] += v ? 1 : 0;
  }
  out.cacti = cacti; out.boulders = boulders; out.rockTrees = rockTrees;
  out.desertTiles = desert[0]; out.desertProps = desert[1];

  /* save round-trip: boulders and cacti survive a reload */
  const iRock = (() => { for (let i = 0; i < N; i++) if (tree[i] >= 12) return i; return -1; })();
  const iCactus = (() => { for (let i = 0; i < N; i++) if (tree[i] >= 8 && tree[i] <= 11) return i; return -1; })();
  out.propIdx = [iRock, iCactus, iRock >= 0 ? tree[iRock] : -1, iCactus >= 0 ? tree[iCactus] : -1];
  if (iRock >= 0 && iCactus >= 0) {
    const data = serialize();
    loadData(data);
    out.afterLoad = [tree[iRock], tree[iCactus]];
  }

  /* ---------- 2. sprites for each new prop and building ---------- */
  const sig = (file, name, params) => {
    const cv = TEX.render(file, name, params, 'sig' + Math.random()).canvas;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let h = 0; for (let k = 0; k < d.length; k += 7) h = (h * 31 + d[k]) >>> 0;
    return [cv.width, cv.height, h];
  };
  out.treeSprites = [1, 8, 9, 10, 11, 12, 13, 14].map(v => sig('trees', 'tree', { v }));
  out.buildingSprites = ['boardwalk','aquarium','ferrisWheel','riverWharf'].map(t => sig('buildings', t, { seed: 5, wet: null }));

  /* ---------- 3. a river that runs to the sea, with a wharf on it ---------- */
  clearWorld(); mapChanged();
  // a three-tile-wide channel from the bottom edge up into the map, with bends
  const carve = (x, y) => { if (inb(x, y)) { const i = y * MW + x; water[i] = 1; biome[i] = 0; tree[i] = 0; tile[i] = 0; } };
  for (let y = 0; y < 120; y++) {
    const cx = 100 + Math.round(Math.sin(y / 9) * 4);
    for (let d = -1; d <= 1; d++) carve(cx + d, y);
  }
  for (let y = 60; y <= 118; y++) { const i = y * MW + 92; tile[i] = 1; walkway[i] = 1; }
  mapChanged();
  // wharf: land tile with water right beside it, and a street for the trucks
  let spot = null;
  for (let y = 60; y < 114 && !spot; y++) for (let x = 90; x < 118 && !spot; x++) {
    if (canPlace('riverWharf', x, y, true)) spot = { x, y };
  }
  out.wharfSpot = spot;
  if (spot) {
    const w = placeBuilding('riverWharf', spot.x, spot.y, 4242);
    mapChanged();
    out.wharfIsPort = ports.some(p => p.id === w.id);
    out.wharfBerth = waterNeighbour(w);
    out.wharfStockLimit = stockLimit(w);
    out.wharfAcceptsGoods = acceptsGood(w, 'goods');
    w.stock = 40;
    out.shipLaunched = launchShip(w);
    const s = ships[0];
    out.shipPath = s ? s.path.length : 0;
    out.shipAllWater = s ? s.path.every(i => water[i]) : false;
    const last = s ? s.path[s.path.length - 1] : -1;
    out.shipEndsAtEdge = last >= 0 ? (last % MW === 0 || (last / MW | 0) === 0 || last % MW === MW - 1 || (last / MW | 0) === MH - 1) : false;
    out.shipDestPort = s ? s.destPort : null;
    cargoStats.shipped = 0; cargoStats.moved = 0;
    for (let f = 0; f < 4000 && ships.length; f++) stepShips(1 / 30);
    out.shipShipped = cargoStats.shipped + cargoStats.moved;
    out.shipGone = ships.length === 0;
    // the wharf's stock went out with the ship
    out.wharfStockAfter = Math.round(w.stock);
    // and it is served by trucks: a shop receiving from it
    out.wharfInHubs = hubs.length >= 0;
  }

  /* ---------- 3b. truck -> wharf -> ship, end to end ---------- */
  clearWorld(); mapChanged();
  for (let y = 0; y < 90; y++) for (let d = -1; d <= 1; d++) { const i = y * MW + 100 + d; water[i] = 1; biome[i] = 0; }
  for (let y = 60; y <= 80; y++) { const i = y * MW + 96; tile[i] = 1; walkway[i] = 1; }
  mapChanged();
  const ww = placeBuilding('riverWharf', 97, 64, 7);
  const wh = placeBuilding('warehouse', 93, 64, 8);
  mapChanged();
  wh.inventory = Object.assign(Object.create(null), { goods: 200 }); wh.stock = 200;
  cargoStats.moved = 0; cargoStats.shipped = 0;
  for (let k = 0; k < 900; k++) simStep(1 / 30);
  out.tradeWharfStock = Math.round(ww.stock || 0);
  out.tradeCargo = cargoStats.moved + cargoStats.shipped;
  out.tradeWarehouseLeft = Math.round(warehouseTotal(wh));
  out.tradeShips = ships.length;

  /* ---------- 4. waterfront leisure placement ---------- */
  // find a shore strip with a road for the aquarium
  const shore = t => { for (let x = 0; x < MW - 4; x++) for (let y = 60; y < 110; y++) { if (canPlace(t, x, y, true)) return { x, y }; } return null; };
  const placed = {};
  for (const t of ['boardwalk', 'ferrisWheel', 'aquarium']) {
    const s = shore(t);
    const b = s ? placeBuilding(t, s.x, s.y, 99) : null;
    placed[t] = !!b;
  }
  mapChanged();
  out.placed = placed;
  const byType = t => [...buildings.values()].filter(b => b.type === t);
  out.isLeisureWalk = ['park', 'boardwalk', 'ferrisWheel'].map(t => isLeisureWalk(t));
  out.leisureAll = ['park', 'boardwalk', 'aquarium', 'ferrisWheel'].map(t => isLeisure(t));
  out.destParkHas = ['park','boardwalk','aquarium','ferrisWheel'].filter(t => byType(t).some(b => destPark.includes(b)));
  out.walkTile = ['boardwalk','ferrisWheel'].every(t => { const b = byType(t)[0]; return b && isWalk(b.y * MW + b.x) && b.walk >= 0; });
  out.needsRoad = ['park','boardwalk','ferrisWheel','aquarium'].map(t => needsRoad(t));
  out.aquariumRoad = byType('aquarium').map(b => b.road >= 0);
  out.spotsMarked = ['boardwalk','aquarium','ferrisWheel'].every(t => { const b = byType(t)[0]; return b && (b.art.spots || b.art.win).length > 0; });

  /* ---------- 5. toolbar entries, icons and the inspector ---------- */
  out.tools = ['b:riverWharf','b:boardwalk','b:aquarium','b:ferrisWheel'].map(t => TOOLS[t] && TOOLS[t].name);
  try { const ic = icon('b:boardwalk'); out.icon = [ic.width, ic.height]; } catch (e) { out.icon = 'error: ' + e.message; }
  const bw = [...buildings.values()].find(b => b.type === 'boardwalk');
  if (bw) { select({kind: 'bld', id: bw.id}); updateInspector(); out.inspectorVisitors = document.getElementById('inspector').innerHTML.includes('Visitors'); select(null); }
  // placement rules still explain themselves
  out.inlandBoardwalk = whyNot('boardwalk', 10, 10);
  out.inlandWharf = whyNot('riverWharf', 10, 10);
  return out;
})()`);
console.log(JSON.stringify(out, null, 2));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/water.png', Buffer.from(shot.data, 'base64'));
chrome.kill();
process.exit(0);
