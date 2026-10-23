// =====================================================================
// Static layer: drawn in chunks on demand, plus a one-pixel-per-tile overview
// =====================================================================
const CW = 40, CHH = 30, NCX = MW / CW, NCY = MH / CHH, MAX_CHUNKS = 220;
const chunks = new Map();
let chunkBudget = 0;
function invalidate(x0, y0, x1, y1) {
  for (let cy = Math.max(0, Math.floor(y0 / CHH)); cy <= Math.min(NCY - 1, Math.floor(y1 / CHH)); cy++)
    for (let cx = Math.max(0, Math.floor(x0 / CW)); cx <= Math.min(NCX - 1, Math.floor(x1 / CW)); cx++) chunks.delete(cy * NCX + cx);
}
function markDirty(ax, ay, bx, by) {
  const x0 = Math.max(0, Math.min(ax, bx) - 1), y0 = Math.max(0, Math.min(ay, by) - 1);
  const x1 = Math.min(MW - 1, Math.max(ax, bx) + 1), y1 = Math.min(MH - 1, Math.max(ay, by) + 1);
  invalidate(x0, y0, x1, y1); updateMini(x0, y0, x1, y1);
}
function markAllDirty() { chunks.clear(); updateMini(0, 0, MW - 1, MH - 1); }
const markTiles = tiles => { if (!tiles.length) return; let x0 = MW, y0 = MH, x1 = 0, y1 = 0; for (const i of tiles) { const x = i % MW, y = i / MW | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } markDirty(x0, y0, x1, y1); };
function getChunk(cx, cy) {
  const k = cy * NCX + cx;
  let c = chunks.get(k);
  if (c) { chunks.delete(k); chunks.set(k, c); return c; }
  if (chunkBudget <= 0) return null;
  chunkBudget--;
  c = buildChunk(cx, cy);
  chunks.set(k, c);
  if (chunks.size > MAX_CHUNKS) chunks.delete(chunks.keys().next().value);
  return c;
}
// base, dark speck, light speck, flower, flower — per biome
const BIOME_PAL = {
  1: [88, 156, 68, 78, 144, 60, 104, 172, 80, 236, 224, 120, 240, 140, 170],
  2: [46, 112, 54, 38, 98, 46, 60, 132, 64, 214, 210, 96, 200, 120, 180],
  3: [214, 190, 122, 198, 172, 104, 228, 206, 144, 240, 232, 180, 226, 176, 120],
  4: [226, 233, 242, 210, 220, 234, 240, 246, 252, 196, 214, 236, 232, 238, 248],
  5: [126, 122, 116, 110, 106, 100, 142, 138, 132, 168, 164, 158, 96, 92, 88],
};
function buildChunk(cx, cy) {
  const tx0 = cx * CW, ty0 = cy * CHH, pw = CW * T, ph = CHH * T;
  const cvs = mk(pw, ph), c = cvs.getContext('2d');
  const img = c.createImageData(pw, ph), d = img.data;
  for (let yy = 0; yy < ph; yy++) {
    const y = ty0 * T + yy, ty = (y / T) | 0, ly = y - ty * T;
    for (let xx = 0; xx < pw; xx++) {
      const x = tx0 * T + xx, tx = (x / T) | 0, lx = x - tx * T, i = ty * MW + tx, n = hash(x, y, 7);
      let r, g, b;
      if (water[i]) {
        const shore = (lx === 0 && tx > 0 && !water[i - 1]) || (lx === T - 1 && tx < MW - 1 && !water[i + 1]) ||
                      (ly === 0 && ty > 0 && !water[i - MW]) || (ly === T - 1 && ty < MH - 1 && !water[i + MW]);
        if (shore) { r = 214; g = 196; b = 140; }
        else { r = 46; g = 108; b = 180; if (n > 0.95) { r = 104; g = 162; b = 224; } else if (n > 0.8) { r = 54; g = 120; b = 194; } }
      } else {
        const pal = BIOME_PAL[biome[i]] || BIOME_PAL[1];
        r = pal[0]; g = pal[1]; b = pal[2];
        if (n > 0.88) { r = pal[3]; g = pal[4]; b = pal[5]; }
        else if (n < 0.06) { r = pal[6]; g = pal[7]; b = pal[8]; }
        else if (n < 0.064) { r = pal[9]; g = pal[10]; b = pal[11]; }
        else if (n < 0.067) { r = pal[12]; g = pal[13]; b = pal[14]; }
      }
      const o = (yy * pw + xx) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  c.translate(-tx0 * T, -ty0 * T);
  for (let ty = ty0; ty < ty0 + CHH; ty++) for (let tx = tx0; tx < tx0 + CW; tx++) drawTile(c, ty * MW + tx);
  for (const b of buildings.values()) {
    if (b.x >= tx0 + CW || b.x + b.w <= tx0 || b.y >= ty0 + CHH || b.y + b.h <= ty0) continue;
    drawBuilding(c, b.type, b.x * T, b.y * T, b.seed, wetFor(b));
  }
  return cvs;
}
function drawTile(c, i) {
  const x0 = (i % MW) * T, y0 = (i / MW | 0) * T, t = tile[i];
  if (overpass[i]) { drawRoadTile(c, x0, y0, 5, t === 2, water[i], 0, walkway[i], 0); drawDeck(c, x0, y0, t === 2); }
  else if (t === 1 || t === 2) drawRoadTile(c, x0, y0, cmask[i], t === 2, water[i], oneway[i], walkway[i], autoOw[i], laneEdges(i));
  else if (t === 3) drawPathTile(c, x0, y0, walkMask(i), water[i]);
  else if (t === 4) drawPlazaTile(c, x0, y0, i);
  else if (tree[i] && !bldAt[i]) drawTree(c, x0, y0, tree[i]);
}
const miniCv = mk(MW, MH), mctx = miniCv.getContext('2d'), miniImg = mctx.createImageData(MW, MH);
const MINIC = [[88, 156, 68], [215, 218, 224], [240, 200, 90], [219, 201, 159], [211, 201, 180]];
const MINIB = {res: [222, 158, 96], com: [95, 168, 224], work: [168, 150, 128], civic: [236, 236, 242], ped: [127, 209, 106], lot: [140, 140, 140]};
function miniColor(i) {
  const id = bldAt[i];
  if (id) { const b = B(id); if (b) return b.type === 'metro' ? [31, 79, 176] : b.type === 'farm' || b.type === 'orchard' ? [196, 178, 84] : MINIB[BT[b.type].cat]; }
  const t = tile[i];
  if (t === 1) return water[i] ? [190, 170, 140] : walkway[i] ? MINIC[1] : [176, 160, 120];
  if (t) return MINIC[t];
  if (water[i]) return [46, 108, 180];
  if (tree[i]) return [47, 120, 52];
  const pal = BIOME_PAL[biome[i]];
  return pal ? [pal[0], pal[1], pal[2]] : MINIC[0];
}
function updateMini(x0, y0, x1, y1) {
  const d = miniImg.data;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * MW + x, col = miniColor(i), o = i * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  mctx.putImageData(miniImg, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

// =====================================================================
// Pathfinding (A* with a typed binary heap)
// =====================================================================
const gScore = new Float32Array(N), came = new Int32Array(N), seen = new Uint32Array(N), closed = new Uint32Array(N);
const viaN = new Uint16Array(N), viaD = new Uint8Array(N);
let stampId = 0;
const Hi = new Int32Array(N * 4), Hf = new Float32Array(N * 4); let Hn = 0;
function hpush(i, f) { if (Hn >= Hi.length) return; let k = Hn++; while (k > 0) { const p = (k - 1) >> 1; if (Hf[p] <= f) break; Hi[k] = Hi[p]; Hf[k] = Hf[p]; k = p; } Hi[k] = i; Hf[k] = f; }
function hpop() { const top = Hi[0]; const n = --Hn; if (n > 0) { const li = Hi[n], lf = Hf[n]; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && Hf[c + 1] < Hf[c]) c++; if (Hf[c] >= lf) break; Hi[k] = Hi[c]; Hf[k] = Hf[c]; k = c; } Hi[k] = li; Hf[k] = lf; } return top; }

function carCost(u, v, d) {
  if (!isRoad(v) || !(cmask[u] & bit(d))) return -1;
  const ou = eow(u), ov = eow(v);
  if ((ou && d === OPP[ou]) || (ov && d === OPP[ov])) return -1;
  let c = tile[v] === 2 ? 0.55 : 1;
  c += Math.min(heat[v], 5) * 0.45;
  if (deg[v] >= 3 && !overpass[v]) c += freeflow[v] ? 0.1 : lights.has(v) ? 0.35 : 0.5;
  return c;
}
function walkCost(u, v) {
  const t = tile[v];
  if (t === 1) return walkway[v] ? 1.3 : -1;
  if (t === 3 || t === 4) return 0.75;
  const b = bldAt[v]; if (b) { const ty = B(b).type; if (ty === 'park' || ty === 'metro') return 0.75; }
  return -1;
}
function findPath(s, g, mode, maxCost = Infinity) {
  if (s < 0 || g < 0) return null;
  if (s === g) return [s];
  stampId++; Hn = 0;
  const car = mode === 'car', minC = car ? 0.55 : 0.75, gx = g % MW, gy = g / MW | 0;
  seen[s] = stampId; gScore[s] = 0; came[s] = -1; viaN[s] = 0; hpush(s, 0);
  let found = false;
  while (Hn) {
    const u = hpop();
    if (closed[u] === stampId) continue;
    closed[u] = stampId;
    if (u === g) { found = true; break; }
    if (gScore[u] > maxCost) break;
    const ux = u % MW, uy = u / MW | 0;
    for (let d = 1; d <= 4; d++) {
      let vx = ux + DX[d], vy = uy + DY[d];
      if (vx < 0 || vy < 0 || vx >= MW || vy >= MH) continue;
      let v = vy * MW + vx;
      let c = car ? carCost(u, v, d) : walkCost(u, v);
      if (c < 0) continue;
      let skip = 0;
      if (car && overpass[v]) {
        // overpasses can only be driven straight across, so jump to the far side
        while (overpass[v]) {
          const w = nb(v, d); if (w < 0) { v = -1; break; }
          const cc = carCost(v, w, d); if (cc < 0) { v = -1; break; }
          c += cc; v = w; skip++;
        }
        if (v < 0) continue;
        vx = v % MW; vy = v / MW | 0;
      }
      if (closed[v] === stampId) continue;
      const ng = gScore[u] + c;
      if (seen[v] !== stampId || ng < gScore[v]) {
        seen[v] = stampId; gScore[v] = ng; came[v] = u; viaN[v] = skip; viaD[v] = d;
        hpush(v, ng + minC * (Math.abs(vx - gx) + Math.abs(vy - gy)));
      }
    }
  }
  if (!found) return null;
  const path = [];
  for (let k = g; k !== -1; k = came[k]) {
    path.push(k);
    if (car && viaN[k] && came[k] !== -1) { const st = DX[viaD[k]] + DY[viaD[k]] * MW; let w = k; for (let s2 = 0; s2 < viaN[k]; s2++) { w -= st; path.push(w); } }
  }
  return path.reverse();
}

// =====================================================================
// Map editing and network analysis
// =====================================================================
function canPlace(type, x, y) {
  const d = BT[type];
  if (x < 0 || y < 0 || x + d.w > MW || y + d.h > MH) return false;
  let wet = 0;
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = yy * MW + xx;
    if (tile[i] || bldAt[i]) return false;
    if (water[i]) { if (!d.water) return false; wet++; }
  }
  if (d.water && (wet === 0 || wet === d.w * d.h)) return false;
  if (d.shore && !shoreAdjacent(x, y, d.w, d.h)) return false;
  if (d.rock && biome[y * MW + x] !== 5) return false;
  if (d.jungle && biome[y * MW + x] !== 2) return false;
  if (POWER_REQ[type] && !powerReqMet(type)) return false;
  return true;
}
// Loading an old save must not lose buildings when placement rules get stricter
// later: this checks bounds and overlap only.
function canPlaceLoose(type, x, y) {
  const d = BT[type];
  if (!d || x < 0 || y < 0 || x + d.w > MW || y + d.h > MH) return false;
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = yy * MW + xx;
    if (tile[i] || bldAt[i]) return false;
    if (water[i] && !d.water) return false;
  }
  return true;
}
// Power plants of a higher tier need the industry and research behind them.
function countType(type) { let n = 0; for (const b of buildings.values()) if (b.type === type) n++; return n; }
function powerReqMet(type) {
  const r = POWER_REQ[type];
  if (!r) return true;
  return countType('quarry') >= r.quarry && countType('mine') >= r.mine &&
    countType('researchLab') >= r.labs && countType('gasWell') >= r.gas;
}
function powerGap(type) {
  const r = POWER_REQ[type];
  if (!r) return '';
  const out = [];
  if (countType('quarry') < r.quarry) out.push(`${r.quarry} quarry`);
  if (countType('mine') < r.mine) out.push(`${r.mine} mine`);
  if (countType('researchLab') < r.labs) out.push(`${r.labs} research lab`);
  if (countType('gasWell') < r.gas) out.push(`${r.gas} gas well`);
  return out.join(', ');
}
function computePower() {
  power.plants = [];
  let capacity = 0, demand = 0;
  for (const b of buildings.values()) {
    const r = POWER_REQ[b.type];
    if (r) {
      const ok = powerReqMet(b.type);
      if (ok) capacity += r.out;
      power.plants.push({id: b.id, type: b.type, out: r.out, ok, load: 0});
    }
    demand += BT[b.type].jobs * 2 + BT[b.type].homes * 1.5 + 4;
  }
  power.capacity = capacity;
  power.demand = Math.round(demand);
  power.served = 0;   // scaffolding: the grid is not wired to anything yet
}
function shoreAdjacent(x, y, w, h) {
  for (let xx = x; xx < x + w; xx++) {
    if (inb(xx, y - 1) && water[(y - 1) * MW + xx]) return true;
    if (inb(xx, y + h) && water[(y + h) * MW + xx]) return true;
  }
  for (let yy = y; yy < y + h; yy++) {
    if (inb(x - 1, yy) && water[yy * MW + x - 1]) return true;
    if (inb(x + w, yy) && water[yy * MW + x + w]) return true;
  }
  return false;
}
function perimeter(x, y, w, h) {
  const out = [];
  for (let xx = x; xx < x + w; xx++) { if (inb(xx, y + h)) out.push((y + h) * MW + xx); }
  for (let yy = y; yy < y + h; yy++) { if (inb(x + w, yy)) out.push(yy * MW + x + w); if (inb(x - 1, yy)) out.push(yy * MW + x - 1); }
  for (let xx = x; xx < x + w; xx++) { if (inb(xx, y - 1)) out.push((y - 1) * MW + xx); }
  return out;
}
function touchesStreet(type, x, y) { const d = BT[type]; return perimeter(x, y, d.w, d.h).some(i => tile[i] === 1); }
function placeBuilding(type, x, y, seed) {
  const d = BT[type];
  const b = {id: nextBid++, type, x, y, w: d.w, h: d.h, seed: seed ?? (Math.random() * 1e9 | 0),
    cars: 0, people: 0, residents: 0, workers: 0, asleep: 0, mood: 0.75,
    moodJob: 0.7, moodTransport: 0.7, moodOverall: 0.7, moodRepro: 0.55, road: -1, walk: -1, ws: 0, queue: [], spawnCd: 0, art: null,
    cx: x + d.w / 2, cy: y + d.h / 2};
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) { const i = yy * MW + xx; bldAt[i] = b.id; tree[i] = 0; }
  b.art = drawBuilding(NULLC, type, x * T, y * T, b.seed, wetFor(b));
  buildings.set(b.id, b);
  return b;
}
function computeAccess(b) {
  const per = perimeter(b.x, b.y, b.w, b.h);
  if (!(b.road >= 0 && tile[b.road] === 1 && !overpass[b.road] && per.includes(b.road))) b.road = per.find(i => tile[i] === 1 && !overpass[i]) ?? -1;
  if (b.type === 'park' || b.type === 'metro') b.walk = b.y * MW + b.x;
  else b.walk = per.find(i => isWalk(i)) ?? -1;
  let ws = 0;
  for (let yy = b.y - 4; yy < b.y + b.h + 4; yy++) for (let xx = b.x - 4; xx < b.x + b.w + 4; xx++) {
    if (!inb(xx, yy)) continue; const i = yy * MW + xx;
    if (tile[i] === 3 || tile[i] === 4) ws++;
    else if (bldAt[i] && bldAt[i] !== b.id && B(bldAt[i]).type === 'park') ws += 0.5;
  }
  b.ws = Math.min(14, ws);
}
let roadVersion = 0;
const compR = new Int32Array(N), compW = new Int32Array(N), bfsQ = new Int32Array(N);
function computeComps(comp, pass) {
  comp.fill(0); let id = 0;
  for (let s = 0; s < N; s++) {
    if (comp[s] || !pass(s)) continue;
    id++; let qh = 0, qt = 0; bfsQ[qt++] = s; comp[s] = id;
    while (qh < qt) {
      const u = bfsQ[qh++];
      for (let d = 1; d <= 4; d++) { const v = nb(u, d); if (v >= 0 && !comp[v] && pass(v)) { comp[v] = id; bfsQ[qt++] = v; } }
    }
  }
}
function reach(from, to) {
  if (from.road >= 0 && to.road >= 0 && compR[from.road] === compR[to.road]) return true;
  return from.walk >= 0 && to.walk >= 0 && compW[from.walk] === compW[to.walk] && distB(from, to) <= 26;
}
// Road links. Two highways side by side become one road with two lanes each way:
// they stop connecting sideways and each one carries a single direction.
const hRun = new Int16Array(N), vRun = new Int16Array(N);
function hmask(i) { let m = 0; for (let d = 1; d <= 4; d++) { const j = nb(i, d); if (j >= 0 && tile[j] === 2) m |= bit(d); } return m; }
function computeLinks() {
  cmask.fill(0); autoOw.fill(0);
  for (let i = 0; i < N; i++) {
    if (!isRoad(i)) continue;
    let m = 0; for (let d = 1; d <= 4; d++) { const j = nb(i, d); if (j >= 0 && isRoad(j)) m |= bit(d); }
    cmask[i] = m;
  }
  // Any number of side-by-side highways form one wide highway: the first half of the rows run one way,
  // the rest the other way, and rows stop linking sideways. Where the band starts or ends (a row stops),
  // the column links up again, so traffic merges and spreads across the lanes there.
  const EW = bit(2) | bit(4), NS = bit(1) | bit(3);
  // which way each highway tile runs: along its longer straight stretch, so the middle rows of a wide
  // east-west highway aren't mistaken for a north-south one (and the other way round)
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW;) {
    if (tile[y * MW + x] !== 2) { hRun[y * MW + x] = 0; x++; continue; }
    let x1 = x; while (x1 + 1 < MW && tile[y * MW + x1 + 1] === 2) x1++;
    for (let k = x; k <= x1; k++) hRun[y * MW + k] = x1 - x + 1;
    x = x1 + 1;
  }
  for (let x = 0; x < MW; x++) for (let y = 0; y < MH;) {
    if (tile[y * MW + x] !== 2) { vRun[y * MW + x] = 0; y++; continue; }
    let y1 = y; while (y1 + 1 < MH && tile[(y1 + 1) * MW + x] === 2) y1++;
    for (let k = y; k <= y1; k++) vRun[k * MW + x] = y1 - y + 1;
    y = y1 + 1;
  }
  for (let x = 0; x < MW; x++) {
    for (let y = 0; y < MH;) {
      const thru = yy => { const i = yy * MW + x; return tile[i] === 2 && hRun[i] > vRun[i] && (hmask(i) & EW) === EW; };
      if (!thru(y)) { y++; continue; }
      let y1 = y; while (y1 + 1 < MH && thru(y1 + 1)) y1++;
      const k = y1 - y + 1;
      // a highway joining the band from above or below makes this column a junction, not lanes
      if (k >= 2 && !(y > 0 && tile[(y - 1) * MW + x] === 2) && !(y1 < MH - 1 && tile[(y1 + 1) * MW + x] === 2)) {
        for (let r = 0; r < k; r++) {
          const i = (y + r) * MW + x;
          autoOw[i] = r < (k >> 1) ? 4 : 2;
          if (r > 0) { cmask[i] &= ~bit(1); cmask[i - MW] &= ~bit(3); }
        }
      }
      y = y1 + 1;
    }
  }
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW;) {
      const thru = xx => { const i = y * MW + xx; return tile[i] === 2 && vRun[i] > hRun[i] && (hmask(i) & NS) === NS; };
      if (!thru(x)) { x++; continue; }
      let x1 = x; while (x1 + 1 < MW && thru(x1 + 1)) x1++;
      const k = x1 - x + 1;
      if (k >= 2 && !(x > 0 && tile[y * MW + x - 1] === 2) && !(x1 < MW - 1 && tile[y * MW + x1 + 1] === 2)) {
        for (let c = 0; c < k; c++) {
          const i = y * MW + x + c;
          autoOw[i] = c < (k >> 1) ? 3 : 1;
          if (c > 0) { cmask[i] &= ~bit(4); cmask[i - 1] &= ~bit(2); }
        }
      }
      x = x1 + 1;
    }
  }
}
// For drawing: what lies beside a carriageway tile on each side (0 edge, 1 another lane the same way, 2 the median).
function laneEdges(i) {
  const ml = autoOw[i]; if (!ml) return null;
  return ((ml === 2 || ml === 4) ? [1, 3] : [4, 2]).map(d => {
    const j = nb(i, d);
    if (j < 0 || tile[j] !== 2 || !autoOw[j] || (cmask[i] & bit(d))) return 0;
    return autoOw[j] === ml ? 1 : 2;
  });
}
function mapChanged() {
  relinkRail();
  computeLinks();
  connections = []; overpassList = [];
  for (let i = 0; i < N; i++) {
    deg[i] = isRoad(i) ? bits(cmask[i]) : 0;
    freeflow[i] = 0;
    if (deg[i] >= 3 && tile[i] === 2) { let all = 1; for (let d = 1; d <= 4; d++) if ((cmask[i] & bit(d)) && tile[nb(i, d)] !== 2) all = 0; freeflow[i] = all; }
    if (overpass[i] && deg[i] !== 4) { overpass[i] = 0; markDirty(i % MW, i / MW | 0, i % MW, i / MW | 0); }
    if (overpass[i]) overpassList.push(i);
    if (deg[i]) { const x = i % MW, y = i / MW | 0; if (x === 0 || y === 0 || x === MW - 1 || y === MH - 1) connections.push(i); }
  }
  computeComps(compR, isRoad);
  computeComps(compW, isWalk);
  for (const i of [...lights.keys()]) if (deg[i] < 3 || overpass[i]) lights.delete(i);
  destCom = []; destPark = []; destWork = []; stations = []; docks = []; airports = []; busStops = [];
  for (const b of buildings.values()) {
    computeAccess(b);
    const d = BT[b.type];
    if (d.cat === 'com') destCom.push(b);
    if (d.jobs > 0) destWork.push(b);
    if (b.type === 'park') destPark.push(b);
    if (b.type === 'metro') stations.push(b);
    if (b.type === 'busstop') busStops.push(b);
    if (b.type === 'dock') docks.push(b);
    if (b.type === 'airport') airports.push(b);
  }
  mergeAccess();
  syncUnits();
  computePower();
  roadVersion++;
  validateMovers();
  syncMetros();   // two trains per station, wherever the rails happen to run
}
// Attribute merging: five like buildings that touch each other need only one
// road between them; farms and orchards merge in twenties.
const mergeLimit = type => (type === 'farm' || type === 'orchard' || type === 'farmhouse' || type === 'greenhouse') ? 20 : 5;
function mergeAccess() {
  const seen = new Set();
  for (const b of buildings.values()) b.roadShared = false;
  for (const start of buildings.values()) {
    if (seen.has(start.id) || start.road < 0) continue;
    const cluster = [], queue = [start];
    seen.add(start.id);
    while (queue.length) {
      const b = queue.pop();
      cluster.push(b);
      for (const i of perimeter(b.x, b.y, b.w, b.h)) {
        const oid = bldAt[i];
        if (!oid || oid === b.id || seen.has(oid)) continue;
        const o = B(oid);
        if (!o || o.type !== start.type) continue;
        seen.add(oid);
        queue.push(o);
      }
    }
    if (cluster.length < mergeLimit(start.type)) continue;
    const donor = start;   // every building in the cluster can use its road
    for (const o of cluster) if (o.road < 0) { o.road = donor.road; o.roadShared = true; }
  }
}
function removeBuilding(b) {
  buildings.delete(b.id);
  for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) bldAt[yy * MW + xx] = 0;
  markDirty(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1);
  for (const c of b.queue) { if (!c.dead) { c.dead = true; c.agent.car = null; teleportHome(c.agent); } }
  for (const a of agents) {
    if (a.home === b.id) { killAgent(a); continue; }
    if (a.job === b.id) a.job = 0;
    if (a.lotFor === b.id) a.lotFor = 0;
    if (a.state === 'idle' && a.loc === b.id) a.loc = a.home;
    if (a.carAt === b.id) a.carAt = a.home;
  }
  agents = agents.filter(a => !a.dead);
  recount();
  if (selection && selection.kind === 'bld' && selection.id === b.id) select(null);
}
function recount() {
  for (const b of buildings.values()) { b.people = 0; b.cars = 0; b.residents = 0; b.workers = 0; }
  for (const a of agents) {
    const h = B(a.home); if (h) h.residents++;
    if (a.job) { const j = B(a.job); if (j) j.workers++; else a.job = 0; }
    if (a.state === 'idle') { const l = B(a.loc); if (l) l.people++; }
    if (a.carAt) { const c = B(a.carAt); if (c) c.cars++; }
  }
}
