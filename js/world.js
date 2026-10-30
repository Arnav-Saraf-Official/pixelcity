// =====================================================================
// World generation
// =====================================================================
function clearWorld(keepClock) {
  tile.fill(0); water.fill(0); tree.fill(0); platform.fill(0); oneway.fill(0); walkway.fill(0); bldAt.fill(0); heat.fill(0); heatAcc.fill(0); resv.fill(0); overpass.fill(0); rail.fill(0); railOn.fill(0); track.fill(0); trackOn.fill(0); trackWide.fill(0); gateOff.fill(0);
  lights.clear(); gates.clear(); buildings.clear(); charredBuildings.clear(); carById.clear(); chunks.clear();
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
// A pregenerated region is a small country, not one town: a main city and two
// satellite towns, airports tying them together, farms in the gaps and a metro
// network in every town. Roads, runways and lanes are laid before the buildings,
// so the first tick already has working frontage, signals and transit.
function buildStarterTown() {
  starterTown = null;
  const rng = mulberry((worldSeed ^ 4242) >>> 0);
  // A city needs a big, mostly dry site. The biggest landmass of an island
  // world may be smaller than the mainland of a normal one, so step down to
  // smaller footprints until one is properly covered in land.
  const towns = [];
  let mainBox = null, boxW = 72, boxH = 50;
  for (const [bw, bh] of [[72, 50], [56, 40], [38, 28]]) {
    const b = mainLandBox(bw, bh);
    if (b && (!mainBox || b.score > mainBox.score + 0.05)) { mainBox = b; boxW = bw; boxH = bh; }
    if (mainBox && mainBox.score >= 0.95) break;
  }
  if (mainBox) towns.push({x: mainBox.x, y: mainBox.y, w: boxW, h: boxH, main: true});
  // Satellite towns go on their own dry site, far enough away to read as a
  // separate place and close enough to be worth a highway.
  for (let k = 0; k < 2; k++) {
    const site = findSatelliteSite(46, 34, towns, 48);
    if (site) towns.push(site);
  }
  if (towns.length) {
    for (const t of towns) layTownGrid(t);
    for (const t of towns.slice(1)) highwayLink(towns[0], t);
    // Airports go in before the blocks: the access lane they cut becomes
    // street frontage, and every town that fits one gets an airfield.
    let airports = 0;
    for (const t of towns) if (placeAirport(t)) airports++;
    for (let k = 0; k < 2 && airports < 2 && towns[0]; k++) if (placeAirport(towns[0], true)) airports++;
    for (const t of towns) { fillTownBlocks(t, rng); townCivics(t, rng); }
    for (const t of towns) balanceTown(t, rng, t.main ? 70 : 30);
    for (const t of towns) ruralFarms(t, rng);
    const main = towns[0];
    starterTown = {x: Math.round(best2(main.xs)), y: Math.round(best2(main.ys))};
    placeFreightYards({x: main.x, y: main.y, w: main.w, h: main.h}, main.xs, main.ys);
  }
  placeCargoPorts(rng);
  placeCoastalBuildings(rng);
  finishWorld();
}

// The flattest, driest rectangle that is not already a town site.
function findSatelliteSite(w, h, towns, minDist) {
  let best = null;
  for (let by = 6; by <= MH - h - 6; by += 6) {
    for (let bx = 6; bx <= MW - w - 6; bx += 6) {
      let near = false;
      for (const t of towns) {
        if (Math.hypot(t.x + t.w / 2 - (bx + w / 2), t.y + t.h / 2 - (by + h / 2)) < minDist) { near = true; break; }
      }
      if (near) continue;
      let land = 0, total = 0, trees = 0;
      for (let y = by; y < by + h; y += 2) for (let x = bx; x < bx + w; x += 2) {
        total++;
        if (!water[y * MW + x]) land++;
        if (tree[y * MW + x]) trees++;
      }
      if (land < total) continue;               // a town needs unbroken dry land
      const score = total - trees * 0.02 - (towns[0] ? Math.hypot(towns[0].x - bx, towns[0].y - by) * 0.01 : 0);
      if (!best || score > best.score) best = {x: bx, y: by, score};
    }
  }
  return best ? {x: best.x, y: best.y, w, h, main: false} : null;
}

// The street grid: a wider artery through the middle, cross streets every block.
function layTownGrid(t) {
  const xs = [], ys = [];
  const stepX = t.main ? 13 : 12, stepY = t.main ? 12 : 10;
  for (let x = t.x + 2; x <= t.x + t.w - 6; x += stepX) xs.push(x);
  for (let y = t.y + 2; y <= t.y + t.h - 6; y += stepY) ys.push(y);
  if (xs.length < 2 || ys.length < 2) { t.xs = [t.x + 1, t.x + 2]; t.ys = [t.y + 1, t.y + 2]; t.cx = t.x + 1; t.cy = t.y + 1; return; }
  const mid = Math.floor(ys.length / 2);
  for (let k = 0; k < ys.length; k++) lineRoadLand(xs[0], ys[k], xs[xs.length - 1], ys[k], k === mid ? 2 : 1);
  for (const x of xs) lineRoadLand(x, ys[0], x, ys[ys.length - 1], 1);
  t.xs = xs; t.ys = ys;
  t.cx = xs[Math.floor(xs.length / 2)]; t.cy = ys[mid];
}

// Two lanes each way between towns: side-by-side highways become directional
// lanes in the linker, so intercity traffic does not meet head-on.
function highwayLink(a, b) {
  if (!a || !b) return;
  const ax = a.cx, ay = a.cy, bx = b.cx, by = b.cy;
  lineRoadLand(ax, ay, bx, ay, 2);
  lineRoadLand(ax, ay + 1, bx, ay + 1, 2);
  lineRoadLand(bx, ay, bx, by, 2);
  lineRoadLand(bx + 1, ay + 1, bx + 1, by + 1, 2);
}

// Nearest street or highway inside a rectangle, for cutting an access lane.
function nearestRoadRect(x0, y0, x1, y1) {
  let best = -1, bd = Infinity;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let y = Math.max(0, y0); y <= Math.min(MH - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(MW - 1, x1); x++) {
      const i = y * MW + x;
      if (tile[i] !== 1 && tile[i] !== 2) continue;
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}

// An airport needs a long, flat plot and a road to its gate. Island worlds and
// cities hemmed in by water may not fit one; the caller just tries again.
function placeAirport(t, force) {
  const d = BT.airport, w = d.w, h = d.h;
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  for (let r = force ? 30 : 20; r <= 96; r += 4) {
    for (let a = 0; a < 24; a++) {
      const ang = a / 24 * Math.PI * 2 + r * 0.11;
      const bx = Math.round(cx + Math.cos(ang) * r) - (w >> 1);
      const by = Math.round(cy + Math.sin(ang) * r) - (h >> 1);
      if (bx < 2 || by < 2 || bx + w > MW - 2 || by + h > MH - 2) continue;
      if (whyNot('airport', bx, by, true) !== '') continue;
      const near = nearestRoadRect(bx - 30, by - 30, bx + w + 30, by + h + 30);
      if (near < 0) continue;
      const inFoot = (x, y) => x >= bx && x < bx + w && y >= by && y < by + h;
      const sides = [[bx - 1, by + 2], [bx + w, by + 2], [bx + 2, by - 1], [bx + 2, by + h]];
      for (const [tx, ty] of sides) {
        if (!inb(tx, ty) || water[ty * MW + tx] || bldAt[ty * MW + tx]) continue;
        const route = spurTiles(near % MW, near / MW | 0, tx, ty, inFoot);
        if (!route) continue;
        for (const [sx, sy] of route) {
          const j = sy * MW + sx;
          if (tile[j] === 1 || tile[j] === 2 || water[j] || bldAt[j]) continue;
          tile[j] = 1; walkway[j] = 1; tree[j] = 0; oneway[j] = 0;
        }
        if (!canPlace('airport', bx, by)) continue;
        return placeBuilding('airport', bx, by, (r * 131 + a * 17) | 0);
      }
    }
  }
  return null;
}

// Downtown gets the towers and workplaces, the edges get homes and shops.
function fillTownBlocks(t, rng) {
  const xs = t.xs, ys = t.ys;
  const midx = (xs.length - 1) / 2, midy = (ys.length - 1) / 2;
  for (let xi = 0; xi < xs.length - 1; xi++) for (let yi = 0; yi < ys.length - 1; yi++) {
    const dist = Math.max(Math.abs(xi - midx), Math.abs(yi - midy));
    const list = t.main && dist <= 1
      ? ['hq', 'office', 'mall', 'apartment', 'tower', 'office', 'apartment', 'garage', 'shop']
      : dist <= 2 || !t.main
        ? ['apartment', 'tower', 'office', 'shop', 'house', 'apartment', 'parking', 'house', 'office']
        : ['house', 'house', 'apartment', 'house', 'shop', 'parking', 'house', 'apartment'];
    fillArea(xs[xi] + 1, ys[yi] + 1, xs[xi + 1] - 1, ys[yi + 1] - 1, list, rng);
  }
}

// Try a spot near a target point first, so civic buildings and stations spread
// across the town instead of filling the first free row.
function placeNear(type, x0, y0, x1, y1, tx, ty, seed) {
  const r = 16;
  const ax = clamp(Math.round(tx - r), x0, x1), bx = clamp(Math.round(tx + r), x0, x1);
  const ay = clamp(Math.round(ty - r), y0, y1), by = clamp(Math.round(ty + r), y0, y1);
  return findSpot(type, ax, ay, bx, by, seed) || findSpot(type, x0, y0, x1, y1, seed);
}

// Civic buildings, transit and signals. Stations are spread along a cross and
// joined in placement order, so each one tunnels back to the nearest existing
// line and the town sits on one network rather than a pile of platforms.
function townCivics(t, rng) {
  const x0 = t.x, y0 = t.y, x1 = t.x + t.w - 1, y1 = t.y + t.h - 1;
  const midX = t.xs[Math.floor(t.xs.length / 2)], midY = t.ys[Math.floor(t.ys.length / 2)];
  const firstX = t.xs[1] ?? x0, firstY = t.ys[1] ?? y0;
  const lastX = t.xs[t.xs.length - 2] ?? x1, lastY = t.ys[t.ys.length - 2] ?? y1;
  const spots = t.main
    ? [
        ['school', firstX, firstY], ['school', lastX, lastY],
        ['hospital', midX, t.ys[0]], ['hospital', t.xs[0], midY],
        ['fireStation', firstX, midY], ['policeStation', lastX, midY],
        ['researchLab', midX, lastY],
        ['factory', t.xs[0], lastY], ['factory', lastX, firstY], ['factory', midX, firstY],
        ['warehouse', t.xs[0], firstY], ['warehouse', lastX, lastY], ['warehouse', firstX, lastY],
        ['garage', midX, firstY], ['garage', lastX, midY],
        ['parking', firstX, midY + 6], ['parking', lastX, midY - 6], ['parking', midX, lastY],
        ['park', firstX, lastY], ['park', midX + 8, midY], ['park', lastX, firstY],
        ['metro', firstX, midY], ['metro', midX, firstY], ['metro', lastX, midY], ['metro', midX, lastY], ['metro', midX, midY],
      ]
    : [
        ['school', firstX, firstY], ['hospital', lastX, midY],
        ['policeStation', firstX, midY], ['factory', lastX, lastY], ['warehouse', midX, firstY],
        ['parking', firstX, midY - 5], ['parking', lastX, firstY],
        ['park', midX, lastY], ['park', lastX, midY + 5],
        ['metro', firstX, midY], ['metro', midX, firstY], ['metro', lastX, lastY],
      ];
  // Bus stops along the main cross, one per block, so every district is served.
  const stops = [];
  for (let k = 1; k < t.xs.length - 1; k++) stops.push(['busstop', t.xs[k], midY]);
  for (let k = 1; k < t.ys.length - 1; k++) stops.push(['busstop', midX, t.ys[k]]);
  spots.push(...stops.slice(0, t.main ? 8 : 4));
  let seed = 900 + (t.x | 0);
  const metros = [];
  for (const [type, tx, ty] of spots) {
    const b = placeNear(type, x0, y0, x1, y1, tx, ty, seed++);
    if (b && type === 'metro') metros.push(b);
  }
  for (const m of metros) if (typeof connectMetroStation === 'function') connectMetroStation(m);
  townSignals(t);
}

// Signals on every junction where two directions cross. A highway junction gets
// a longer green than a side street, which keeps the arterial moving.
function townSignals(t) {
  for (let y = Math.max(1, t.y - 1); y <= Math.min(MH - 2, t.y + t.h); y++) {
    for (let x = Math.max(1, t.x - 1); x <= Math.min(MW - 2, t.x + t.w); x++) {
      const i = y * MW + x;
      if (!isRoad(i) || overpass[i] || lights.has(i)) continue;
      const ns = isRoad(i - MW) || isRoad(i + MW);
      const ew = isRoad(i - 1) || isRoad(i + 1);
      if (!ns || !ew) continue;
      const major = tile[i] === 2 || tile[i - MW] === 2 || tile[i + MW] === 2 || tile[i - 1] === 2 || tile[i + 1] === 2;
      lights.set(i, {ns: major ? 14 : 10, ew: major ? 10 : 8, off: 0});
    }
  }
}

// A generated city should not be a bedroom town: top up workplaces until the
// jobs roughly match the homes, using the densest types that still fit.
function balanceTown(t, rng, maxAdd) {
  const totals = () => {
    let homes = 0, jobs = 0;
    for (const b of buildings.values()) {
      if (b.x < t.x || b.x >= t.x + t.w || b.y < t.y || b.y >= t.y + t.h) continue;
      const d = BT[b.type];
      homes += d.homes; jobs += d.jobs;
    }
    return {homes, jobs};
  };
  for (let g = 0; g < maxAdd; g++) {
    const {homes, jobs} = totals();
    if (!homes || jobs >= homes * 0.9) break;
    const type = g % 4 === 0 ? 'office' : g % 4 === 1 ? 'hq' : g % 4 === 2 ? 'mall' : 'factory';
    if (!findSpot(type, t.x, t.y, t.x + t.w - 1, t.y + t.h - 1, 5000 + g)) break;
  }
}

// A country lane from the fields back to the nearest street.
function connectLane(x, y) {
  const near = nearestRoadRect(x - 40, y - 40, x + 40, y + 40);
  if (near < 0) return false;
  const route = spurTiles(near % MW, near / MW | 0, x, y, () => false);
  if (!route) return false;
  for (const [sx, sy] of route) {
    const j = sy * MW + sx;
    if (water[j] || bldAt[j] || tile[j]) continue;
    tile[j] = 1; walkway[j] = 0; tree[j] = 0; oneway[j] = 0;
  }
  return true;
}

// Farms and orchards in the gaps between towns, on a lane off the nearest road.
function ruralFarms(t, rng) {
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  let zones = 0;
  for (let r = 26; r <= 96 && zones < 2; r += 7) {
    for (let a = 0; a < 26 && zones < 2; a++) {
      const ang = a / 26 * Math.PI * 2 + r * 0.17;
      const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
      if (!inb(x, y) || water[y * MW + x] || tile[y * MW + x] || bldAt[y * MW + x]) continue;
      let bad = 0;
      for (let yy = y - 6; yy <= y + 6; yy += 2) for (let xx = x; xx <= x + 11; xx += 2) {
        if (!inb(xx, yy) || water[yy * MW + xx] || bldAt[yy * MW + xx]) bad++;
      }
      if (bad > 2) continue;
      if (!connectLane(x, y)) continue;
      lineRoadLand(x, y, Math.min(MW - 2, x + 11), y, 1);
      lineRoadLand(x + 6, Math.max(1, y - 6), x + 6, Math.min(MH - 2, y + 6), 1);
      fillArea(Math.max(0, x + 1), Math.max(0, y - 5), Math.min(MW - 2, x + 11), Math.min(MH - 2, y + 5),
        ['farm', 'orchard', 'farmhouse', 'greenhouse', 'farm'], rng);
      zones++;
    }
  }
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
  worldGenVersion = GEN_VERSION;
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
  const gw = new Uint8Array(N), gt = new Uint8Array(N); genTerrainInto(worldSeed, gw, gt, worldGenVersion);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * MW + x; water[i] = gw[i]; tree[i] = bldAt[i] ? 0 : gt[i]; }
  markDirty(x0, y0, x1, y1); mapChanged();
  toast(`Cleared the ${DISTRICTS[m]} district.`);
}
