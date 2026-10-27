// =====================================================================
// World generation
// =====================================================================
function clearWorld(keepClock) {
  tile.fill(0); water.fill(0); tree.fill(0); platform.fill(0); oneway.fill(0); walkway.fill(0); bldAt.fill(0); heat.fill(0); heatAcc.fill(0); resv.fill(0); overpass.fill(0); rail.fill(0); railOn.fill(0); track.fill(0); trackOn.fill(0); trackWide.fill(0); gateOff.fill(0);
  lights.clear(); gates.clear(); buildings.clear(); carById.clear(); chunks.clear();
  districts.clear(); districtLayer.fill(0); nextDid = 1; markDistrictsDirty(); units = []; incidents.length = 0; wrecks.length = 0;
  roadClosed.fill(0); streetClosures.clear();
  power.plants = []; power.capacity = 0; power.demand = 0;
  agents = []; cars = []; peds = []; planes = []; boats = []; metros = []; ships = []; freight = []; connections = []; busWait.clear(); metroWait.clear();
  if (typeof resetLogistics === 'function') resetLogistics();
  nextBid = 1; nextAid = 1; nextCid = 1;
  if (!keepClock) { simTime = 0; gameMin = 6.5 * 60; }
  stats = {trips: [], modes: [], totalTrips: 0, frustrated: 0, stranded: 0, ti: 0, tiAcc: 0, tiN: 0, waitN: 0, hist: [], lastFrustToast: stats.lastFrustToast,
    planeCrashes: 0, planeDeaths: 0, crashes: 0, crashesCleared: 0, firesOut: 0, burned: 0, evacuated: 0};
  if (typeof resetSickness === 'function') resetSickness();
  if (typeof invalidateBillboardHealth === 'function') invalidateBillboardHealth();
  if (typeof invalidateLocalMoodFactors === 'function') invalidateLocalMoodFactors();
  select(null);
}
function finishWorld() { markAllDirty(); mapChanged(); computeDistStats(); if (typeof initWeather === 'function') initWeather(); }
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
// A commuter suburb in the East district, linked to downtown by the highway.
// Farms and an airport in the West district, on country roads off the highway.
// A lakeside village in the South district with a marina.
// Roads that stop at the shoreline instead of running out to sea.
function lineRoadLand(x0, y0, x1, y1, t = 1) {
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0); let x = x0, y = y0;
  for (;;) {
    const i = y * MW + x;
    if (!water[i]) { tile[i] = t; tree[i] = 0; oneway[i] = 0; walkway[i] = t === 1 ? 1 : 0; }
    if (x === x1 && y === y1) break;
    x += dx; y += dy;
  }
}
// The best building site on the mainland: the land-heaviest box near its centre.
function mainLandBox(w, h) {
  const seen = new Uint8Array(N), st = new Int32Array(N);
  let best = null;
  for (let s0 = 0; s0 < N; s0++) {
    if (water[s0] || seen[s0]) continue;
    let qh = 0, qt = 0, size = 0, sx = 0, sy = 0; st[qt++] = s0; seen[s0] = 1;
    while (qh < qt) {
      const u = st[qh++], ux = u % MW, uy = u / MW | 0; size++; sx += ux; sy += uy;
      for (let d = 1; d <= 4; d++) { const v = nb(u, d); if (v >= 0 && !water[v] && !seen[v]) { seen[v] = 1; st[qt++] = v; } }
    }
    if (!best || size > best.size) best = {size, cx: sx / size, cy: sy / size};
  }
  if (!best) return null;
  let pick = null;
  for (let by = 0; by <= MH - h - 1; by += 12) {
    for (let bx = 0; bx <= MW - w - 1; bx += 12) {
      let land = 0, sea = 0, seaN = 0;
      for (let y = by; y < by + h; y += 2) for (let x = bx; x < bx + w; x += 2) if (!water[y * MW + x]) land++;
      // a coastal site scores higher: the sea should be within a short walk
      for (let y = by - 10; y < by + h + 10; y += 3) for (let x = bx - 10; x < bx + w + 10; x += 3) {
        seaN++;
        if (inb(x, y) && water[y * MW + x]) sea++;
      }
      const score = land / ((w / 2) * (h / 2)) + 0.45 * (sea / Math.max(1, seaN));
      if (!pick || score > pick.score) pick = {x: bx, y: by, score};
    }
  }
  return pick && {x: Math.floor(pick.x), y: Math.floor(pick.y), score: pick.score};
}
function buildStarterTown() {
  starterTown = null;
  const rng = mulberry((worldSeed ^ 4242) >>> 0);
  // A city needs a big, mostly dry site. The biggest landmass of an island
  // world may be smaller than the mainland of a normal one, so step down to
  // smaller footprints until one is properly covered in land.
  let box = null, boxW = 72, boxH = 50;
  for (const [bw, bh] of [[72, 50], [56, 40], [38, 28]]) {
    const b = mainLandBox(bw, bh);
    if (b && (!box || b.score > box.score + 0.05)) { box = b; boxW = bw; boxH = bh; }
    if (box && box.score >= 0.95) break;
  }
  if (box) {
    const xs = [], ys = [];
    for (let x = box.x + 2; x <= box.x + boxW - 6; x += 13) xs.push(x);
    for (let y = box.y + 2; y <= box.y + boxH - 6; y += 12) ys.push(y);
    for (const y of ys) lineRoadLand(xs[0], y, xs[xs.length - 1], y, y === ys[Math.floor(ys.length / 2)] ? 2 : 1);
    for (const x of xs) lineRoadLand(x, ys[0], x, ys[ys.length - 1], 1);
    for (let xi = 0; xi < xs.length - 1; xi++) for (let yi = 0; yi < ys.length - 1; yi++) {
      const list = xi === 0 && yi === 0 ? ['market', 'shop', 'house']
        : ['house', 'house', 'house', 'apartment', 'shop', 'house'];
      fillArea(xs[xi] + 1, ys[yi] + 1, xs[xi + 1] - 1, ys[yi + 1] - 1, list, rng);
    }
    const bx1 = box.x + boxW - 2, by1 = box.y + boxH - 2;
    findSpot('school', box.x, box.y, bx1, by1, 11);
    findSpot('hospital', box.x, box.y, bx1, by1, 12);
    findSpot('parking', box.x, box.y, bx1, by1, 13);
    for (let k = 0; k < 3; k++) findSpot('park', box.x, box.y, bx1, by1, 20 + k);
    // The demo's two stations are joined at their own tiles, so the generated
    // city starts with a working line instead of two stranded platforms.
    const met1 = findSpot('metro', box.x, box.y, bx1, by1, 31);
    if (met1 && typeof connectMetroStation === 'function') connectMetroStation(met1);
    const met2 = findSpot('metro', box.x, box.y, bx1, by1, 32);
    if (met2 && typeof connectMetroStation === 'function') connectMetroStation(met2);
    for (let k = 0; k < 4; k++) findSpot('busstop', box.x, box.y, bx1, by1, 40 + k);
    starterTown = {x: Math.round(best2(xs)), y: Math.round(best2(ys))};
    placeFreightYards(box, xs, ys);
  }
  placeCargoPorts(rng);
  placeCoastalBuildings(rng);
  finishWorld();
}
const best2 = a => a[Math.floor(a.length / 2)];
let starterTown = null;

// ---------------------------------------------------------------------
// Generated industries
//
// A pregenerated city is a place to look at as well as a place to drive:
// it needs a working freight spur and a pair of quays, not just houses. Both
// are laid in the empty band below the town grid, so no existing street or
// building is moved.
// ---------------------------------------------------------------------
function placeFreightYards(box, xs, ys) {
  if (!box || xs.length < 2 || ys.length < 2) return;
  const roadRow = ys[ys.length - 1];
  const yardY = roadRow + 1, trackY = roadRow + 4;
  if (trackY >= MH) return;
  const x0 = xs[0], x1 = xs[xs.length - 1];
  if (x1 - x0 < 14) return;

  // A yard fits when its 4x3 footprint and the 4-track row under it are clear
  // land. The road above the band belongs to the town already.
  const clearFootprint = x => {
    for (let y = yardY; y < yardY + 3; y++) for (let xx = x; xx < x + 4; xx++) {
      if (!inb(xx, y)) return false;
      const i = y * MW + xx;
      if (water[i] || tile[i] || bldAt[i] || trackOn[i]) return false;
    }
    for (let xx = x; xx < x + 4; xx++) {
      if (!inb(xx, trackY)) return false;
      const i = trackY * MW + xx;
      if (water[i] || bldAt[i] || trackOn[i]) return false;
    }
    return true;
  };
  const starts = [];
  for (let x = x0; x <= x1 - 3; x++) if (clearFootprint(x)) starts.push(x);
  if (starts.length < 2) return;

  // Pick the widest pair whose connecting track stays on clear land. This is
  // deterministic: the same seed always gives the same two sites.
  let pair = null;
  for (const a of starts) {
    for (let k = starts.length - 1; k >= 0; k--) {
      const b = starts[k];
      if (b - a < 12) break;
      let clear = true;
      for (let x = a; x <= b + 3; x++) {
        const i = trackY * MW + x;
        if (water[i] || bldAt[i]) { clear = false; break; }
      }
      if (clear) { pair = [a, b]; break; }
    }
    if (pair) break;
  }
  if (!pair) return;
  const [ax, bx] = pair;
  for (let x = ax; x <= bx + 3; x++) {
    const i = trackY * MW + x;
    trackOn[i] = 1; tree[i] = 0;
  }
  if (!canPlace('railyard', ax, yardY) || !canPlace('railyard', bx, yardY)) {
    for (let x = ax; x <= bx + 3; x++) trackOn[trackY * MW + x] = 0;
    return;
  }
  placeBuilding('railyard', ax, yardY, 7101);
  placeBuilding('railyard', bx, yardY, 7102);

  // A starter warehouse beside each yard gives the automatic freight trains a
  // reason to run; their cargo is normal goods inventory once the city starts.
  for (const [k, yx] of [ax, bx].entries()) {
    for (const dx of [4, -3, 5, -4, 6, -5, 7]) {
      const wx = yx + dx;
      if (!inb(wx, yardY) || !canPlace('warehouse', wx, yardY)) continue;
      const b = placeBuilding('warehouse', wx, yardY, 7110 + k);
      b.stock = 120;
      break;
    }
  }
}

function spurTiles(rx, ry, tx, ty, blocked) {
  const route = [];
  const add = (x0, y0, x1, y1) => {
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    let x = x0, y = y0;
    for (;;) {
      route.push([x, y]);
      if (x === x1 && y === y1) break;
      x += dx; y += dy;
    }
  };
  add(rx, ry, tx, ry); add(tx, ry, tx, ty);
  for (const [x, y] of route) {
    if (!inb(x, y)) return null;
    const i = y * MW + x;
    if (blocked(x, y) || water[i] || bldAt[i] || trackOn[i]) return null;
    if (tile[i] && tile[i] !== 1 && tile[i] !== 2) return null;
  }
  return route;
}

function placeCargoPorts(rng) {
  const town = starterTown;
  if (!town) return;
  const roadTiles = [];
  for (let i = 0; i < N; i++) if (tile[i] === 1) roadTiles.push(i);
  const ports = [];
  for (let r = 8; r < 170 && ports.length < 2; r += 4) {
    for (let a = 0; a < 48 && ports.length < 2; a++) {
      const ang = a / 48 * Math.PI * 2 + r * 0.07;
      const x = Math.round(town.x + Math.cos(ang) * r), y = Math.round(town.y + Math.sin(ang) * r);
      if (!inb(x, y) || !canPlace('port', x, y, true)) continue;
      if (ports.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < 24)) continue;
      // Try a road spur to any side that is on land. The L-shaped route may
      // bend, but it never crosses the port's own footprint.
      const inFootprint = (xx, yy) => xx >= x && xx < x + 4 && yy >= y && yy < y + 3;
      const sides = [[x - 1, y + 1], [x + 4, y + 1], [x + 1, y - 1], [x + 1, y + 3]];
      let made = false;
      for (const [tx, ty] of sides) {
        if (!inb(tx, ty) || water[ty * MW + tx] || bldAt[ty * MW + tx] || trackOn[ty * MW + tx]) continue;
        const near = [];
        for (const i of roadTiles) near.push({i, d: Math.abs(i % MW - tx) + Math.abs((i / MW | 0) - ty)});
        near.sort((a, b) => a.d - b.d);
        for (const {i} of near.slice(0, 24)) {
          const rx = i % MW, ry = i / MW | 0;
          const route = spurTiles(rx, ry, tx, ty, inFootprint);
          if (!route) continue;
          for (const [sx, sy] of route) {
            const j = sy * MW + sx;
            if (tile[j] === 1 || tile[j] === 2) continue;
            tile[j] = 1; walkway[j] = 1; tree[j] = 0; oneway[j] = 0;
            roadTiles.push(j);
          }
          if (!canPlace('port', x, y)) continue;
          const b = placeBuilding('port', x, y, (rng() * 1e9) | 0);
          b.stock = 160;
          ports.push(b);
          made = true;
          break;
        }
        if (made) break;
      }
    }
  }
}

// Coastal industry only exists where land meets water; the demo town gets a few.
function placeCoastalBuildings(rng) {
  const town = starterTown || {x: MW >> 1, y: MH >> 1};
  const roadTiles = [];
  for (let i = 0; i < N; i++) if (tile[i] === 1) roadTiles.push(i);
  if (!roadTiles.length) return;
  const types = ['fishery', 'seafoodMarket', 'seafoodPlant'];
  let made = 0;
  for (let r = 6; r < 150 && made < 6; r += 3) {
    for (let a = 0; a < 32 && made < 6; a++) {
      const ang = a / 32 * Math.PI * 2 + r * 0.11;
      const x = Math.round(town.x + Math.cos(ang) * r), y = Math.round(town.y + Math.sin(ang) * r);
      const type = types[made % types.length];
      if (!inb(x, y) || !canPlace(type, x, y, true)) continue;
      let best = null, bd = Infinity;
      for (const i of roadTiles) {
        const d = Math.abs(i % MW - x) + Math.abs((i / MW | 0) - y);
        if (d < bd) { bd = d; best = i; }
      }
      if (!best || bd > 20) continue;
      // a short spur that runs along the road's row and then up the lot's left
      // side, so it can never cross the lot it is serving
      const rx = best % MW, ry = best / MW | 0;
      let blocked = false;
      for (let xx = Math.min(rx, x - 1); xx <= Math.max(rx, x - 1); xx++) if (water[ry * MW + xx] || bldAt[ry * MW + xx]) blocked = true;
      for (let yy = Math.min(ry, y); yy <= Math.max(ry, y); yy++) if (water[yy * MW + x - 1] || bldAt[yy * MW + x - 1]) blocked = true;
      if (blocked || x - 1 < 0) continue;
      lineRoadLand(rx, ry, x - 1, ry, 1); lineRoadLand(x - 1, ry, x - 1, y, 1);
      placeBuilding(type, x, y, (rng() * 1e9) | 0);
      made++;
    }
  }
}
function genRegion(demo, seed = demo ? 12345 : Math.floor(Math.random() * 1e6)) {
  clearWorld();
  for (const key of Object.keys(resources)) resources[key] = 0;
  worldSeed = seed;
  genTerrainInto(worldSeed, water, tree);
  if (demo) buildStarterTown();
  else finishWorld();
}
function genDemo() {
  genRegion(true);
  const t = starterTown || {x: MW >> 1, y: MH >> 1};
  centerOn(t.y * MW + t.x, 3);
}
function genEmpty() { genRegion(false); fitRegion(); toast('Fresh land. Draw a road to get started!'); }
function generateNewWorld(mapType, seed) {
  genRegion(mapType === 'pregenerated', seed);
  if (mapType === 'pregenerated') { const t = starterTown || {x: MW >> 1, y: MH >> 1}; centerOn(t.y * MW + t.x, 3); }
  else fitRegion();
}
function clearDistrict(m) {
  const x0 = (m % RW) * DW, y0 = (m / RW | 0) * DH, x1 = x0 + DW - 1, y1 = y0 + DH - 1;
  const kill = new Set();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * MW + x;
    if (bldAt[i]) kill.add(bldAt[i]);
    tile[i] = 0; platform[i] = 0; oneway[i] = 0; walkway[i] = 0; overpass[i] = 0; lights.delete(i);
  }
  for (const id of kill) { const b = B(id); if (b) removeBuilding(b); }
  if (typeof clearRuinsRect === 'function') clearRuinsRect(x0, y0, x1, y1);
  const gw = new Uint8Array(N), gt = new Uint8Array(N); genTerrainInto(worldSeed, gw, gt);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * MW + x; water[i] = gw[i]; tree[i] = bldAt[i] ? 0 : gt[i]; }
  markDirty(x0, y0, x1, y1); mapChanged();
  toast(`Cleared the ${DISTRICTS[m]} district.`);
}
