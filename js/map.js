// =====================================================================
// Static layer: drawn in chunks on demand, plus a one-pixel-per-tile overview
// =====================================================================
const CW = 40, CHH = 30, NCX = MW / CW, NCY = MH / CHH, MAX_CHUNKS = 220;
const chunks = new Map();
// Chunk building is capped by time, not by a count: a pan or a zoom then costs
// the same few milliseconds every frame instead of a long freeze whenever eight
// fresh chunks happen to land in the same frame.
const CHUNK_MS = 7;
let chunkDeadline = 0, chunkBuilt = 0;
function invalidate(x0, y0, x1, y1) {
  for (let cy = Math.max(0, Math.floor(y0 / CHH)); cy <= Math.min(NCY - 1, Math.floor(y1 / CHH)); cy++)
    for (let cx = Math.max(0, Math.floor(x0 / CW)); cx <= Math.min(NCX - 1, Math.floor(x1 / CW)); cx++) chunks.delete(cy * NCX + cx);
}
function markDirty(ax, ay, bx, by) {
  const x0 = Math.max(0, Math.min(ax, bx) - 1), y0 = Math.max(0, Math.min(ay, by) - 1);
  const x1 = Math.min(MW - 1, Math.max(ax, bx) + 1), y1 = Math.min(MH - 1, Math.max(ay, by) + 1);
  invalidate(x0, y0, x1, y1);
  updateMini(Math.max(0, x0 - 3), Math.max(0, y0 - 3), Math.min(MW - 1, x1 + 3), Math.min(MH - 1, y1 + 3));
}
function markAllDirty() { chunks.clear(); updateMini(0, 0, MW - 1, MH - 1); }
const markTiles = tiles => { if (!tiles.length) return; let x0 = MW, y0 = MH, x1 = 0, y1 = 0; for (const i of tiles) { const x = i % MW, y = i / MW | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } markDirty(x0, y0, x1, y1); };
function getChunk(cx, cy) {
  const k = cy * NCX + cx;
  let c = chunks.get(k);
  if (c) { chunks.delete(k); chunks.set(k, c); return c; }
  if (chunkBuilt && performance.now() > chunkDeadline) return null;
  chunkBuilt++;
  c = buildChunk(cx, cy);
  chunks.set(k, c);
  if (chunks.size > MAX_CHUNKS) chunks.delete(chunks.keys().next().value);
  return c;
}
// base, dark speck, light speck, flower, flower — per biome
const BIOME_PAL = {
  1: [88, 156, 68, 78, 144, 60, 104, 172, 80, 236, 224, 120, 240, 140, 170],
  2: [91, 69, 43, 75, 55, 34, 113, 84, 52, 126, 95, 60, 148, 112, 72],
  3: [214, 190, 122, 198, 172, 104, 228, 206, 144, 240, 232, 180, 226, 176, 120],
  4: [226, 233, 242, 210, 220, 234, 240, 246, 252, 196, 214, 236, 232, 238, 248],
  5: [126, 122, 116, 110, 106, 100, 142, 138, 132, 168, 164, 158, 96, 92, 88],
};
// Biome borders are dithered at two scales. First whole 9x9 tiles borrow a
// neighbouring biome's palette in a 4x4 ordered pattern, so two biomes interlock
// in blocks; then the tiles that keep their own ground stipple the last few
// pixels of their border with the neighbour's colours. The stored biome never
// changes and still drives every rule and the region map; this is only paint.
const EDGE_BLEND = 4;               // widest per-pixel stitch, in art pixels
// 4x4 ordered dither (Bayer), used at both scales. At pixel scale it is indexed
// by the absolute art-pixel position, so the pattern continues across chunks.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// The eight neighbours in a fixed order, so a tile with several different
// biomes around it picks one consistently (and the starting point is hashed).
const DIR8X = [1, 1, 0, -1, -1, -1, 0, 1];
const DIR8Y = [0, 1, 1, 1, 0, -1, -1, -1];

// Which biome a tile's ground looks like. Called for the chunk and a one-tile
// ring, so the pixel stitcher can compare against neighbouring *looks* rather
// than stored biomes.
function groundBiomeAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return 0;
  const i = ty * MW + tx, b = biome[i];
  if (water[i] || !PAL_RGB[b]) return b;
  const start = (hash(tx, ty, 0x3c6ef372) * 8) | 0;
  let cand = 0;
  for (let k = 0; k < 8; k++) {
    const dir = (start + k) & 7;
    const nx = tx + DIR8X[dir], ny = ty + DIR8Y[dir];
    if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
    const j = ny * MW + nx, nb = biome[j];
    if (!water[j] && nb !== b && PAL_RGB[nb]) { cand = nb; break; }
  }
  if (!cand) return b;
  // How much of this stretch of border mixes varies over patches of about 8x8
  // tiles: some places interlock heavily, others are nearly sharp.
  const level = hash(tx >> 3, ty >> 3, 0x51ed270b);
  const p = 0.14 + level * 0.46;
  return (BAYER4[(ty & 3) * 4 + (tx & 3)] + 0.5) / 16 < p ? cand : b;
}
// The five colours a pixel can take out of a biome palette — base, light
// speckle, dark speckle and two flowers — packed the way the image data stores
// them (RGBA, little endian, alpha included), so a painted pixel is one 32-bit
// write instead of four clamped byte writes.
const packRGBA = (r, g, b) => (r | (g << 8) | (b << 16) | 0xff000000) >>> 0;
const PAL_RGB = {};
for (const k of Object.keys(BIOME_PAL)) {
  const p = BIOME_PAL[k];
  PAL_RGB[k] = [
    packRGBA(p[0], p[1], p[2]),
    packRGBA(p[3], p[4], p[5]),
    packRGBA(p[6], p[7], p[8]),
    packRGBA(p[9], p[10], p[11]),
    packRGBA(p[12], p[13], p[14]),
  ];
}
// The noise thresholds, compared against the top 32 bits of the value instead of
// a 0..1 float: one integer compare per pixel rather than a divide.
const N_LIGHT = Math.floor(0.88 * 4294967296), N_DARK = Math.ceil(0.06 * 4294967296);
const N_FLOWER1 = Math.ceil(0.064 * 4294967296), N_FLOWER2 = Math.ceil(0.067 * 4294967296);
const N_W_MID = Math.floor(0.8 * 4294967296), N_W_LIGHT = Math.floor(0.95 * 4294967296);
const W_BASE = packRGBA(46, 108, 180), W_MID = packRGBA(54, 120, 194);
const W_LIGHT = packRGBA(104, 162, 224), W_SAND = packRGBA(214, 196, 140);

// One scratch pixel buffer for every chunk: panning builds chunk after chunk, and
// a fresh 388 KB image per chunk is a lot of allocation and zeroing for memory
// that is overwritten pixel by pixel anyway.
let chunkImg = null;
function buildChunk(cx, cy) {
  const tx0 = cx * CW, ty0 = cy * CHH, pw = CW * T, ph = CHH * T;
  const cvs = mk(pw, ph), c = cvs.getContext('2d');
  if (!chunkImg || chunkImg.width !== pw || chunkImg.height !== ph) chunkImg = c.createImageData(pw, ph);
  const img = chunkImg, d = new Uint32Array(img.data.buffer);
  // hash(x, y, 7) mixes three products; the x term depends only on the column and
  // the y term only on the row, so a pixel costs one add plus the final mix.
  const hx = new Int32Array(pw);
  for (let xx = 0; xx < pw; xx++) hx[xx] = (tx0 * T + xx) * 374761393;
  const hb = new Int32Array(ph);
  for (let yy = 0; yy < ph; yy++) hb[yy] = (ty0 * T + yy) * 668265263 + 7 * 1442695041;
  const bdH = new Int32Array(T), palH = new Array(T);
  // Column index into the 4x4 dither pattern, shared by every row of the chunk.
  const dhx = new Uint8Array(pw);
  for (let xx = 0; xx < pw; xx++) dhx[xx] = (tx0 * T + xx) & 3;
  // Effective (painted) biome of every tile in the chunk plus a one-tile ring.
  const EW = CW + 2, EH = CHH + 2;
  const effB = new Uint8Array(EW * EH);
  for (let ey = 0; ey < EH; ey++) for (let ex = 0; ex < EW; ex++)
    effB[ey * EW + ex] = groundBiomeAt(tx0 + ex - 1, ty0 + ey - 1);
  const effIdx = (tx, ty) => (ty - ty0 + 1) * EW + (tx - tx0 + 1);
  for (let ty = ty0; ty < ty0 + CHH; ty++) {
    for (let tx = tx0; tx < tx0 + CW; tx++) {
      const i = ty * MW + tx, px0 = (tx - tx0) * T, py0 = (ty - ty0) * T;
      if (water[i]) {
        const bW = tx > 0 && !water[i - 1], bE = tx < MW - 1 && !water[i + 1];
        const bN = ty > 0 && !water[i - MW], bS = ty < MH - 1 && !water[i + MW];
        // A waterway with land on both sides is a river, not a coast: its edges
        // take the colour of the bank it runs through instead of a strip of sand.
        const channel = (bW && bE) || (bN && bS);
        // The bank takes the colour of the land beside it. A land tile that was
        // painted over water can still carry biome 0, so fall back to plains.
        const bank = (bx, by) => (PAL_RGB[effB[(by - ty0 + 1) * EW + (bx - tx0 + 1)]] || PAL_RGB[1])[0];
        const sW = bW ? (channel ? bank(tx - 1, ty) : W_SAND) : 0;
        const sE = bE ? (channel ? bank(tx + 1, ty) : W_SAND) : 0;
        const sN = bN ? (channel ? bank(tx, ty - 1) : W_SAND) : 0;
        const sS = bS ? (channel ? bank(tx, ty + 1) : W_SAND) : 0;
        for (let ly = 0; ly < T; ly++) {
          const row = (py0 + ly) * pw + px0, h = hb[py0 + ly];
          for (let lx = 0; lx < T; lx++) {
            let col;
            if (lx === 0 && bW) col = sW;
            else if (lx === T - 1 && bE) col = sE;
            else if (ly === 0 && bN) col = sN;
            else if (ly === T - 1 && bS) col = sS;
            else {
              const v0 = (hx[px0 + lx] + h) | 0;
              const v = Math.imul(v0 ^ (v0 >>> 13), 1274126177) ^ 0;
              const n = (v ^ (v >>> 16)) >>> 0;
              col = n > N_W_LIGHT ? W_LIGHT : n > N_W_MID ? W_MID : W_BASE;
            }
            d[row + lx] = col;
          }
        }
        continue;
      }
      // Whole-tile dithering has already picked this tile's painted palette;
      // now stitch only the pixels along its border with the neighbours' painted
      // palettes. The band width varies per tile, so the seam texture is not
      // identical everywhere along a border.
      const bi = effB[effIdx(tx, ty)], pal = PAL_RGB[bi] || PAL_RGB[1];
      const band = 2 + ((hash(tx >> 1, ty >> 1, 0x9e3779b1) * 3) | 0);
      const nbPal = (bx, by) => {
        const b2 = effB[effIdx(bx, by)];
        return b2 !== bi ? PAL_RGB[b2] : null;
      };
      const pW = tx > 0 && !water[i - 1] ? nbPal(tx - 1, ty) : null;
      const pE = tx < MW - 1 && !water[i + 1] ? nbPal(tx + 1, ty) : null;
      const pN = ty > 0 && !water[i - MW] ? nbPal(tx, ty - 1) : null;
      const pS = ty < MH - 1 && !water[i + MW] ? nbPal(tx, ty + 1) : null;
      const edge = pW || pE || pN || pS;
      if (edge) {
        for (let lx = 0; lx < T; lx++) {
          let bd = EDGE_BLEND + 1, p = null;
          if (lx < bd && pW) { bd = lx; p = pW; }
          if (T - 1 - lx < bd && pE) { bd = T - 1 - lx; p = pE; }
          bdH[lx] = bd; palH[lx] = p;
        }
      }
      for (let ly = 0; ly < T; ly++) {
        const row = (py0 + ly) * pw + px0, h = hb[py0 + ly];
        const upBd = ly < EDGE_BLEND + 1 && pN ? ly : EDGE_BLEND + 1;
        const dnBd = T - 1 - ly < EDGE_BLEND + 1 && pS ? T - 1 - ly : EDGE_BLEND + 1;
        const bayerRow = ((ty * T + ly) & 3) * 4;
        for (let lx = 0; lx < T; lx++) {
          const v0 = (hx[px0 + lx] + h) | 0;
          const v = Math.imul(v0 ^ (v0 >>> 13), 1274126177) ^ 0;
          const n = (v ^ (v >>> 16)) >>> 0;
          const k = n > N_LIGHT ? 1 : n < N_DARK ? 2 : n < N_FLOWER1 ? 3 : n < N_FLOWER2 ? 4 : 0;
          let col = pal[k];
          if (edge) {
            let bd = bdH[lx], nb2 = palH[lx];
            if (upBd < bd) { bd = upBd; nb2 = pN; }
            if (dnBd < bd) { bd = dnBd; nb2 = pS; }
            // 50/50 on the border itself, thinning to nothing `band` pixels in.
            if (nb2 && bd < band && BAYER4[bayerRow + dhx[px0 + lx]] < Math.round(8 * (band - bd) / band)) col = nb2[k];
          }
          d[row + lx] = col;
        }
      }
    }
  }
  c.putImageData(img, 0, 0);
  // Translucent frost grains from the terrain texture keep snow legible without
  // hiding the biome-edge blend underneath it. The pattern only depends on the
  // low digits of the seed, so the grains are cached by those: 63 sprites for the
  // whole map instead of one texture per tile, which used to make a snowy chunk
  // several times more expensive to build than a temperate one.
  for (let ty = ty0; ty < ty0 + CHH; ty++) for (let tx = tx0; tx < tx0 + CW; tx++) {
    const i = ty * MW + tx;
    if (water[i] || biome[i] !== 4) continue;
    const grain = (i % 7) + ':' + ((i / 11 | 0) % 9);
    c.drawImage(sprite('terrain', 'snow_grass', {seed: i}, grain), tx * T - tx0 * T, ty * T - ty0 * T);
  }
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
  if (platform[i]) drawPlatform(c, x0, y0, platform[i]);
  if (overpass[i]) { drawRoadTile(c, x0, y0, 5, t === 2, water[i], 0, walkway[i], 0); drawDeck(c, x0, y0, t === 2); }
  else if (t === 1 || t === 2) drawRoadTile(c, x0, y0, cmask[i], t === 2, water[i], oneway[i], walkway[i], autoOw[i], laneEdges(i));
  else if (t === 3) drawPathTile(c, x0, y0, walkMask(i), water[i]);
  else if (t === 4) drawPlazaTile(c, x0, y0, i);
  else if (tree[i] && !bldAt[i]) drawTree(c, x0, y0, tree[i]);
  // Surface freight track lies over whatever is underneath, so a line can
  // cross a street at grade and still leave the street intact for traffic.
  // Signal lamps are not baked in here: they change whenever a train claims a
  // block, so the frame draws them from the block boundary list instead.
  if (trackOn[i]) drawTrackTile(c, x0, y0, track[i], water[i]);
}
// District paint, baked one chunk at a time. The district layer only changes
// when the player draws a district, so a frame is one blit per visible chunk
// instead of a fill per run of tiles plus a border check on every single tile.
let districtVersion = 0;
const districtChunks = new Map();
function markDistrictsDirty() { districtVersion++; districtChunks.clear(); }
function districtChunk(cx, cy) {
  const k = cy * NCX + cx;
  const hit = districtChunks.get(k);
  if (hit && hit.v === districtVersion) return hit.c;
  const tx0 = cx * CW, ty0 = cy * CHH, cvs = mk(CW * T, CHH * T), c = cvs.getContext('2d');
  let any = false;
  c.globalAlpha = 0.22;
  for (let ty = ty0; ty < ty0 + CHH; ty++) {
    let tx = tx0;
    while (tx < tx0 + CW) {
      const id = districtLayer[ty * MW + tx];
      if (!id) { tx++; continue; }
      let x2 = tx;
      while (x2 + 1 < tx0 + CW && districtLayer[ty * MW + x2 + 1] === id) x2++;
      const d = districts.get(id);
      if (d) { c.fillStyle = d.color; c.fillRect((tx - tx0) * T, (ty - ty0) * T, (x2 - tx + 1) * T, T); any = true; }
      tx = x2 + 1;
    }
  }
  if (any) {
    c.globalAlpha = 0.7;
    for (let ty = ty0; ty < ty0 + CHH; ty++) for (let tx = tx0; tx < tx0 + CW; tx++) {
      const i = ty * MW + tx, id = districtLayer[i];
      if (!id) continue;
      const d = districts.get(id); if (!d) continue;
      const up = ty > 0 ? districtLayer[i - MW] : 0, left = tx > 0 ? districtLayer[i - 1] : 0;
      c.fillStyle = d.color;
      if (up !== id) c.fillRect((tx - tx0) * T, (ty - ty0) * T, T, 1);
      if (left !== id) c.fillRect((tx - tx0) * T, (ty - ty0) * T, 1, T);
    }
  }
  const out = any ? cvs : null;
  districtChunks.set(k, {v: districtVersion, c: out});
  // A chunk canvas is 400x300, so the cap is about 30 MB of paint at worst; the
  // whole map at the far zoom needs 48 of them, and they are only built when the
  // districts overlay is actually on.
  if (districtChunks.size > 64) districtChunks.delete(districtChunks.keys().next().value);
  return out;
}
const miniCv = mk(MW, MH), mctx = miniCv.getContext('2d'), miniImg = mctx.createImageData(MW, MH);
const MINIC = [[88, 156, 68], [215, 218, 224], [240, 200, 90], [219, 201, 159], [211, 201, 180]];
const MINIB = {res: [222, 158, 96], com: [95, 168, 224], work: [168, 150, 128], civic: [236, 236, 242], ped: [127, 209, 106], lot: [140, 140, 140]};
function miniColor(i) {
  const id = bldAt[i];
  if (id) { const b = B(id); if (b) return b.charred ? [118, 118, 118] : b.type === 'metro' ? [31, 79, 176] : b.type === 'farm' || b.type === 'orchard' ? [196, 178, 84] : MINIB[BT[b.type].cat] || MINIB.work; }
  const t = tile[i];
  if (t === 1) return water[i] ? [190, 170, 140] : walkway[i] ? MINIC[1] : [176, 160, 120];
  if (t) return MINIC[t];
  if (platform[i]) return platform[i] === 1 ? [143, 146, 151] : platform[i] === 2 ? [83, 91, 101] : [112, 88, 59];
  if (water[i]) return [46, 108, 180];
  if (tree[i]) return [47, 120, 52];
  const bi = biome[i], pal = BIOME_PAL[bi];
  if (!pal) return MINIC[0];
  let col = [pal[0], pal[1], pal[2]];
  // The region overview is one pixel per tile, so dither a short blend band
  // across biome borders rather than exposing the raw biome array's hard edge.
  let other = -1, edgeDistance = 99;
  const x = i % MW, y = (i / MW) | 0;
  for (let radius = 1; radius <= 3 && other < 0; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const dx = radius - Math.abs(dy);
      const x1 = x - dx, x2 = x + dx, ny = y + dy;
      if (ny < 0 || ny >= MH) continue;
      for (const nx of dx ? [x1, x2] : [x1]) {
        if (nx < 0 || nx >= MW) continue;
        const j = ny * MW + nx;
        if (!water[j] && biome[j] !== bi) { other = biome[j]; edgeDistance = radius; break; }
      }
      if (other >= 0) break;
    }
  }
  if (other >= 0) {
    const q = BIOME_PAL[other];
    // One overview pixel cannot show a continuous fade. Spatial dithering gives
    // the same gradual cross-biome mix over three tile rows/columns instead.
    const neighborShare = 0.5 * (4 - edgeDistance) / 3;
    if (q && hash(x, y, worldSeed ^ 0x5bd1e995) < neighborShare) col = [q[0], q[1], q[2]];
  }
  return col;
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

function carCost(u, v, d, ignoreClosed) {
  if (!isRoad(v) || !(cmask[u] & bit(d))) return -1;
  // a street shut by a crash is impassable, but crews answering it still get in
  if (!ignoreClosed && roadClosed[v] > simTime) return -1;
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
  const b = bldAt[v]; if (b) { const building = B(b); if (building && !building.charred && (isLeisureWalk(building.type) || building.type === 'metro')) return 0.75; }
  return -1;
}
function findPath(s, g, mode, maxCost = Infinity, ignoreClosed = false) {
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
      let c = car ? carCost(u, v, d, ignoreClosed) : walkCost(u, v);
      if (c < 0) continue;
      let skip = 0;
      if (car && overpass[v]) {
        // overpasses can only be driven straight across, so jump to the far side
        while (overpass[v]) {
          const w = nb(v, d); if (w < 0) { v = -1; break; }
          const cc = carCost(v, w, d, ignoreClosed); if (cc < 0) { v = -1; break; }
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
// Every building has an access rule. Streets (not highways) carry cars and
// trucks up to the door; parks and metro stations are reached on foot instead.
function roadAdjacent(x, y, w, h) { return perimeter(x, y, w, h).some(i => tile[i] === 1 && !overpass[i]); }
function adjacentEfficiency(type, x, y, w, h) {
  const i = y * MW + x;
  if (type === 'oilRig') return oilField[i];
  if (type === 'gasWell') return gasField[i];
  if (type === 'quarry' || type === 'mine') return biome[i] === 5 ? vnoise(x / 18, y / 18, worldSeed + 61) * 5 : 0.25;
  if (type === 'fishery' || type === 'seafoodPlant') return shoreAdjacent(x, y, w, h) ? 1 : 0.35;
  return 1;
}
function industryEfficiency(type, x, y, d = BT[type]) {
  let e = adjacentEfficiency(type, x, y, d.w, d.h) * (d.efficiencyBase || 1);
  const site = {cx:x + d.w / 2, cy:y + d.h / 2};
  if (type === 'loggingCamp') {
    if (biome[y * MW + x] === 2) e *= 1.25;
    if (nearType(site, 'orchard', 10)) e *= 1.2;
    if (nearType(site, 'greenhouse', 10)) e *= 1.2;
  }
  return clamp(e, 0.1, 10);
}
function trackAdjacent(x, y, w, h) { return perimeter(x, y, w, h).some(i => trackOn[i]); }
// A crossing can carry a gate where the rails run straight across the street,
// rather than alongside it.
const crossingTile = i => trackOn[i] && isRoad(i) && bits(track[i]) === 2 && !(cmask[i] & ((track[i] & 1) ? 5 : 10));
function hubAdjacent(x, y, w, h) {
  for (const i of perimeter(x, y, w, h)) {
    if (trackOn[i]) return true;
    const id = bldAt[i];
    if (id) { const b = B(id); if (b && !b.charred && (b.type === 'port' || b.type === 'riverWharf')) return true; }
  }
  return false;
}
// How far a plot is from the nearest train yard, in blocks between footprints.
function railyardNear(x, y, w, h) {
  for (const o of buildings.values()) {
    if (o.type !== 'railyard') continue;
    const dx = Math.max(0, x - (o.x + o.w), o.x - (x + w));
    const dy = Math.max(0, y - (o.y + o.h), o.y - (y + h));
    if (dx + dy <= 5) return true;
  }
  return false;
}
// A warehouse within the same radius gives a resource site a truck route to
// the rail network, so rigs no longer have to sit beside a train yard.
function warehouseNear(x, y, w, h) {
  for (const o of buildings.values()) {
    if (o.type !== 'warehouse') continue;
    const dx = Math.max(0, x - (o.x + o.w), o.x - (x + w));
    const dy = Math.max(0, y - (o.y + o.h), o.y - (y + h));
    if (dx + dy <= 5) return true;
  }
  return false;
}
const needsRoad = type => !isLeisureWalk(type) && type !== 'metro';
// Why a plot cannot take a building. An empty string means it fits. The order
// matters: an unmet research requirement is a more useful answer than a
// shoreline complaint on a dam that is not unlocked yet.
function whyNot(type, x, y, ignoreRoad) {
  const d = BT[type];
  if (!d) return 'Unknown building.';
  if (x < 0 || y < 0 || x + d.w > MW || y + d.h > MH) return 'That does not fit inside the region.';
  let wet = 0;
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = yy * MW + xx;
    if (tile[i] || bldAt[i] || trackOn[i] || platform[i]) return 'That spot is already taken.';
    if (water[i]) { if (!d.water) return 'Buildings cannot sit on water.'; wet++; }
  }
  if (d.water && (wet === 0 || wet === d.w * d.h)) return 'A dock goes on the shoreline: part on land, part on water.';
  if (POWER_REQ[type] && !powerReqMet(type)) return 'Needs ' + powerGap(type) + ' first.';
  if (d.shore && !shoreAdjacent(x, y, d.w, d.h)) return 'This one has to sit on a shoreline.';
  if (d.rock && biome[y * MW + x] !== 5) return 'That needs rocky ground.';
  if (d.logging && biome[y * MW + x] !== 2 && !nearType({cx:x + d.w / 2, cy:y + d.h / 2}, 'greenhouse', 10) && !nearType({cx:x + d.w / 2, cy:y + d.h / 2}, 'orchard', 10)) return 'Logging needs jungle, or an orchard/greenhouse within 10 tiles.';
  if (d.rig && !railyardNear(x, y, d.w, d.h) && !warehouseNear(x, y, d.w, d.h)) return 'Oil and gas need a train yard or warehouse within 5 blocks.';
  if (d.rail && !trackAdjacent(x, y, d.w, d.h)) return 'A train yard needs a freight track running alongside it.';
  if (d.hub && !hubAdjacent(x, y, d.w, d.h)) return 'A distribution terminal needs a port or freight track next to it.';
  if (!ignoreRoad && worldSettings.placement !== 'lenientRoads' && needsRoad(type) && !roadAdjacent(x, y, d.w, d.h)) return 'It needs a street next to it.';
  return '';
}
function canPlace(type, x, y, ignoreRoad) { return whyNot(type, x, y, ignoreRoad) === ''; }
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
  if (d.platform) throw new Error('Platform tiles are stored in the terrain layer, not as buildings.');
  const b = {id: nextBid++, type, x, y, w: d.w, h: d.h, seed: seed ?? (Math.random() * 1e9 | 0), inventory: type === 'warehouse' ? Object.create(null) : undefined, efficiency: d.efficiencyBase ? industryEfficiency(type, x, y, d) : undefined,
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
  b.road = per.find(i => tile[i] === 1 && !overpass[i]) ?? -1;
  if (isLeisureWalk(b.type) || b.type === 'metro') b.walk = b.y * MW + b.x;
  else b.walk = per.find(i => isWalk(i)) ?? -1;
  let ws = 0;
  for (let yy = b.y - 4; yy < b.y + b.h + 4; yy++) for (let xx = b.x - 4; xx < b.x + b.w + 4; xx++) {
    if (!inb(xx, yy)) continue; const i = yy * MW + xx;
    if (tile[i] === 3 || tile[i] === 4) ws++;
    else if (bldAt[i] && bldAt[i] !== b.id) {
      const neighbor = B(bldAt[i]);
      if (neighbor && !neighbor.charred && isLeisureWalk(neighbor.type)) ws += 0.5;
    }
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
  relinkTrack();
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
  // Every place a straight run of track crosses a street is a level crossing,
  // so a gate is created there automatically. A gate the player deliberately
  // removed stays removed until the crossing itself changes.
  for (const i of [...gates]) if (!crossingTile(i)) gates.delete(i);
  for (let i = 0; i < N; i++) {
    if (gateOff[i]) { if (!crossingTile(i)) gateOff[i] = 0; continue; }
    if (crossingTile(i)) gates.add(i);
  }
  destCom = []; destPark = []; destWork = []; stations = []; docks = []; airports = []; busStops = []; ports = []; yards = []; hubs = [];
  for (const b of buildings.values()) {
    computeAccess(b);
    const d = BT[b.type];
    if (d.cat === 'com') destCom.push(b);
    if (d.jobs > 0) destWork.push(b);
    if (isLeisure(b.type)) destPark.push(b);
    if (b.type === 'metro') stations.push(b);
    if (b.type === 'busstop') busStops.push(b);
    if (b.type === 'dock') docks.push(b);
    if (b.type === 'airport') airports.push(b);
    if (b.type === 'port' || b.type === 'riverWharf') ports.push(b);
    if (b.type === 'railyard') yards.push(b);
    if (b.type === 'distribution') hubs.push(b);
  }
  mergeAccess();
  syncUnits();
  computePower();
  roadVersion++;
  validateMovers();
  syncMetros();   // two trains per station, wherever the rails happen to run
  if (typeof syncLogistics === 'function') syncLogistics();
}
// Attribute merging: five like buildings that touch each other need only one
// road between them; farms and orchards merge in twenties.
const mergeLimit = type => (type === 'farm' || type === 'orchard' || type === 'farmhouse' || type === 'greenhouse') ? 30 : 5;
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
        if (!o || o.charred || o.type !== start.type) continue;
        seen.add(oid);
        queue.push(o);
      }
    }
  const threshold = mergeLimit(start.type);
  if (cluster.length < threshold) continue;
  const roads = [...new Set(cluster.map(o => o.road).filter(i => i >= 0))];
  const donor = roads[0] ?? -1;
  // Clusters of ordinary homes/shops may share one frontage; dense workplaces
  // such as high-rises need additional driveways and nearby parking to maintain
  // service. Rural plots scale up to thirty connected parcels.
  const demand = cluster.reduce((sum, b) => sum + BT[b.type].homes + BT[b.type].jobs, 0);
  const needed = threshold === 30 ? 1 : Math.max(1, Math.ceil(cluster.length / 5), Math.ceil(demand / 120));
  let parkingOK = true;
  if (start.type === 'tower' || start.type === 'hq' || start.type === 'apartment' || start.type === 'mall') {
    const parkedCapacity = cluster.reduce((sum, b) => sum + BT[b.type].cap, 0);
    const extraLots = [...buildings.values()].filter(b => BT[b.type].cat === 'lot' && cluster.some(o => distB(o, b) <= 8)).reduce((sum, b) => sum + BT[b.type].cap, 0);
    parkingOK = parkedCapacity + extraLots >= cluster.reduce((sum, b) => sum + Math.ceil((BT[b.type].homes + BT[b.type].jobs) * 0.25), 0);
  }
  for (const o of cluster) {
    o.roadShared = false;
    if (roads.includes(o.road)) continue;
    if (parkingOK && roads.length >= needed && donor >= 0) { o.road = donor; o.roadShared = true; }
  }
  }
}
function removeBuilding(b) {
  buildings.delete(b.id);
  charredBuildings.delete(b.id);
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
