// =====================================================================
// World generation
// =====================================================================
function clearWorld(keepClock) {
  tile.fill(0); water.fill(0); tree.fill(0); oneway.fill(0); walkway.fill(0); bldAt.fill(0); heat.fill(0); heatAcc.fill(0); resv.fill(0); overpass.fill(0);
  lights.clear(); buildings.clear(); carById.clear(); chunks.clear();
  agents = []; cars = []; peds = []; planes = []; boats = []; connections = []; busWait.clear();
  nextBid = 1; nextAid = 1; nextCid = 1;
  if (!keepClock) { simTime = 0; gameMin = 6.5 * 60; }
  stats = {trips: [], modes: [], frustrated: 0, stranded: 0, ti: 0, tiAcc: 0, tiN: 0, waitN: 0, hist: [], lastFrustToast: stats.lastFrustToast};
  select(null);
}
function finishWorld() { markAllDirty(); mapChanged(); computeDistStats(); }
function lineRoad(x0, y0, x1, y1, t = 1, sw = 1) {
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0); let x = x0, y = y0;
  for (;;) { const i = y * MW + x; tile[i] = t; tree[i] = 0; oneway[i] = 0; walkway[i] = t === 1 ? sw : 0; if (x === x1 && y === y1) break; x += dx; y += dy; }
}
function fillArea(x0, y0, x1, y1, list, rng) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * MW + x; if (bldAt[i] || tile[i]) continue;
    for (const t of shuffle(list.slice(), rng)) {
      const d = BT[t]; if (x + d.w - 1 > x1 || y + d.h - 1 > y1) continue;
      if (canPlace(t, x, y) && touchesStreet(t, x, y)) { placeBuilding(t, x, y, (rng() * 1e9) | 0); break; }
    }
  }
}
function findSpot(type, x0, y0, x1, y1, seed) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (canPlace(type, x, y) && touchesStreet(type, x, y)) return placeBuilding(type, x, y, seed);
  return null;
}
function buildDowntown(ox, oy) {
  const rng = mulberry(99);
  const at = (x, y) => (y + oy) * MW + x + ox;
  const road = (x0, y0, x1, y1, t = 1) => lineRoad(x0 + ox, y0 + oy, x1 + ox, y1 + oy, t);
  const xs = [16, 26, 36, 46, 56, 66], ys = [18, 26, 34, 42, 50, 58];
  overpass[at(6, 10)] = 1;                       // the two regional highways cross here
  road(7, 6, 9, 6, 2); road(9, 7, 9, 9, 2);       // north-east ramp
  road(5, 14, 3, 14, 2); road(3, 13, 3, 11, 2);   // south-west ramp
  road(7, 34, 15, 34);                            // highway to downtown
  for (const y of ys) road(16, y, 66, y);
  for (const x of xs) road(x, 18, x, 58);
  road(36, 11, 36, 17); road(56, 11, 56, 17); road(16, 11, 16, 17);
  road(67, 34, 96, 34); road(88, 22, 88, 50); road(89, 22, 100, 22); road(89, 50, 100, 50); road(100, 22, 100, 50);
  road(88, 11, 88, 21);
  const ped = (i, t) => { tile[i] = t; tree[i] = 0; };
  for (let x = 57; x <= 65; x++) ped(at(x, 19), 4);
  for (let y = 22; y <= 25; y++) ped(at(61, y), 3);
  for (let x = 37; x <= 45; x++) ped(at(x, 30), 4);
  for (let y = 35; y <= 41; y++) ped(at(41, y), 3);
  const put = (t, x, y, s) => placeBuilding(t, x + ox, y + oy, s);
  put('metro', 37, 27, 1); put('metro', 27, 51, 2); put('metro', 89, 35, 3); put('metro', 57, 43, 4);
  put('parking', 47, 35, 5); put('garage', 44, 27, 6);
  // a ring of bus stops through downtown and the east side
  for (const [bx, by] of [[0, 1], [1, 4], [2, 0], [3, 2], [4, 3], [0, 3], [4, 0]]) findSpot('busstop', ox + xs[bx] + 1, oy + ys[by] + 1, ox + xs[bx + 1] - 1, oy + ys[by + 1] - 1, 50 + bx * 7 + by);
  findSpot('busstop', ox + 89, oy + 40, ox + 99, oy + 49, 61);
  for (const x of [57, 59, 63]) put('park', x, 20, 7 + x);
  findSpot('school', ox + 27, oy + 43, ox + 35, oy + 49, 11);
  findSpot('hospital', ox + 47, oy + 43, ox + 55, oy + 49, 12);
  const fill = (x0, y0, x1, y1, list) => fillArea(x0 + ox, y0 + oy, x1 + ox, y1 + oy, list, rng);
  for (let bx = 0; bx < 5; bx++) for (let by = 0; by < 5; by++) {
    const x0 = xs[bx] + 1, x1 = xs[bx + 1] - 1, y0 = ys[by] + 1, y1 = ys[by + 1] - 1;
    let list;
    if (bx === 2 && (by === 1 || by === 2)) list = ['hq', 'office', 'office', 'shop'];
    else if (bx >= 1 && bx <= 3 && by >= 1 && by <= 3) list = ['market', 'shop', 'shop', 'house', 'office', 'shop', 'apartment', 'house'];
    else if (bx === 0 && by === 4) list = ['factory', 'factory', 'warehouse', 'shop'];
    else if (bx === 4 && by === 4) list = ['mall', 'shop'];
    else list = ['house', 'house', 'house', 'house', 'house', 'house', 'apartment', 'shop'];
    fill(x0, y0, x1, y1, list);
  }
  fill(80, 23, 87, 49, ['house', 'house', 'house', 'house', 'shop']);
  fill(89, 23, 99, 49, ['house', 'house', 'house', 'house', 'apartment', 'market']);
  findSpot('dock', ox + 60, oy + 35, ox + 93, oy + 36, 13);
  for (const [x, y] of [[36, 26], [46, 26], [36, 34], [46, 34], [36, 42], [46, 42], [56, 34], [26, 34]]) lights.set(at(x, y), {ns: 8, ew: 8, off: Math.random() * 10});
}
// A commuter suburb in the East district, linked to downtown by the highway.
function buildSuburb(ox, oy) {
  const rng = mulberry(7);
  const xs = [30, 40, 50, 60], ys = [55, 63, 71, 79];
  lineRoad(ox + 30, oy + 46, ox + 30, oy + 79); lineRoad(ox + 60, oy + 46, ox + 60, oy + 79);
  for (const x of [40, 50]) lineRoad(ox + x, oy + 55, ox + x, oy + 79);
  for (const y of ys) lineRoad(ox + 30, oy + y, ox + 60, oy + y);
  lineRoad(346, oy + 63, ox + 29, oy + 63);   // local street west into downtown's east side
  for (const x of [30, 60]) lights.set((oy + 45) * MW + ox + x, {ns: 7, ew: 10, off: x / 6});
  for (let bx = 0; bx < 3; bx++) for (let by = 0; by < 3; by++)
    fillArea(ox + xs[bx] + 1, oy + ys[by] + 1, ox + xs[bx + 1] - 1, oy + ys[by + 1] - 1, bx === 1 && by === 0 ? ['market', 'shop', 'house'] : ['house', 'house', 'house', 'house', 'house', 'house', 'apartment'], rng);
  fillArea(ox + 31, oy + 46, ox + 59, oy + 54, ['house', 'house', 'house', 'shop'], rng);
  // a business park next door, so most of the suburb can work close to home
  lineRoad(ox + 61, oy + 63, ox + 120, oy + 63);
  fillArea(ox + 61, oy + 56, ox + 120, oy + 62, ['office', 'factory', 'warehouse', 'shop'], rng);
  for (const [x0, y0] of [[31, 56], [51, 72], [61, 64]]) findSpot('busstop', ox + x0, oy + y0, ox + x0 + 8, oy + y0 + 6, 70 + x0);
  findSpot('airport', ox + 98, oy + 64, ox + 110, oy + 66, 32);   // a second airport, so flights go airport to airport
  fillArea(ox + 61, oy + 64, ox + 120, oy + 70, ['office', 'warehouse', 'factory', 'market'], rng);
}
// Farms and an airport in the West district, on country roads off the highway.
function buildCountryside() {
  const rng = mulberry(21);
  lineRoad(40, 180, 232, 180, 1, 0); lineRoad(232, 181, 232, 194, 1, 0);
  lineRoad(232, 196, 232, 220); lineRoad(118, 220, 231, 220);
  fillArea(40, 170, 228, 179, ['farmhouse', 'farm', 'orchard', 'farm', 'farmhouse'], rng);
  fillArea(40, 181, 228, 191, ['farmhouse', 'farm', 'orchard', 'farmhouse'], rng);
  placeBuilding('airport', 120, 215, 31);
  fillArea(133, 221, 200, 223, ['warehouse', 'warehouse', 'shop'], rng);
  lights.set(195 * MW + 232, {ns: 9, ew: 9, off: 0});
}
// A lakeside village in the South district with a marina.
function buildLakeside() {
  const rng = mulberry(33);
  const ly = Math.floor(DH * 2.5 - 15 * 1.25);
  let y = ly; while (y > ly - 10 && [...Array(30).keys()].some(k => water[y * MW + 254 + k])) y--;
  lineRoad(252, y, 300, y);
  fillArea(253, y - 2, 300, y - 1, ['house', 'house', 'house', 'shop'], rng);
  findSpot('dock', 253, y + 1, 300, y + 2, 41);
  fillArea(253, y + 1, 300, y + 1, ['house', 'house'], rng);
}
function genRegion(demo) {
  clearWorld();
  worldSeed = demo ? 12345 : Math.floor(Math.random() * 1e6);
  genTerrainInto(worldSeed, water, tree);
  if (demo) {
    // two regional highways cross the whole region; the west and east stretches have two lanes each way
    lineRoad(0, 195, MW - 1, 195, 2); lineRoad(251, 0, 251, MH - 1, 2);
    lineRoad(0, 194, 225, 194, 2); lineRoad(0, 196, 225, 196, 2); lineRoad(0, 197, 225, 197, 2);   // four rows side by side: four lanes each way
    lineRoad(345, 196, 420, 196, 2);
    buildDowntown(245, 185);
    buildSuburb(400, 150);
    buildCountryside();
    buildLakeside();
  }
  finishWorld();
}
function genDemo() { genRegion(true); centerOn((185 + 37) * MW + 245 + 42, 3); }
function genEmpty() { genRegion(false); fitDistrict(4); toast('Fresh land. Draw a road to get started!'); }
function clearDistrict(m) {
  const x0 = (m % RW) * DW, y0 = (m / RW | 0) * DH, x1 = x0 + DW - 1, y1 = y0 + DH - 1;
  const kill = new Set();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * MW + x;
    if (bldAt[i]) kill.add(bldAt[i]);
    tile[i] = 0; oneway[i] = 0; walkway[i] = 0; overpass[i] = 0; lights.delete(i);
  }
  for (const id of kill) { const b = B(id); if (b) removeBuilding(b); }
  const gw = new Uint8Array(N), gt = new Uint8Array(N); genTerrainInto(worldSeed, gw, gt);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * MW + x; water[i] = gw[i]; tree[i] = bldAt[i] ? 0 : gt[i]; }
  markDirty(x0, y0, x1, y1); mapChanged();
  toast(`Cleared the ${DISTRICTS[m]} district.`);
}
