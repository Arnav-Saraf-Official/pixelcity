// =====================================================================
// Rendering
// =====================================================================
let dpr = Math.max(1, window.devicePixelRatio || 1);
const cam = {x: 0, y: 0, z: 3};
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
let flash = null; // {i, until} highlighted hotspot
function resize() {
  dpr = Math.max(1, window.devicePixelRatio || 1);
  cv.width = Math.floor(innerWidth * dpr); cv.height = Math.floor(innerHeight * dpr);
  clampCam();
  if (typeof layoutBottom === 'function') layoutBottom();
}
function clampCam() {
  const vw = innerWidth / cam.z, vh = innerHeight / cam.z;
  cam.x = Math.max(-vw * 0.5, Math.min(FW - vw * 0.5, cam.x));
  cam.y = Math.max(-vh * 0.5, Math.min(FH - vh * 0.5, cam.y));
}
function darkness(h) {
  if (h >= 7 && h < 17.5) return 0;
  if (h >= 17.5 && h < 20) return (h - 17.5) / 2.5 * 0.58;
  if (h >= 5 && h < 7) return (1 - (h - 5) / 2) * 0.58;
  return 0.58;
}
const LCOL = ['#3ef06b', '#ffd23f', '#ff4848'];
const moodFace = m => m >= 0.7 ? 'happy' : m >= 0.5 ? 'ok' : m >= 0.3 ? 'sad' : 'angry';
function render() {
  if (regionView) { renderRegion(); return; }
  const z = cam.z;
  const fw = Math.ceil(innerWidth / z) + 2, fh = Math.ceil(innerHeight / z) + 2;
  if (frameCv.width !== fw || frameCv.height !== fh) { frameCv.width = fw; frameCv.height = fh; }
  const fx0 = Math.floor(cam.x), fy0 = Math.floor(cam.y), f = fctx;
  f.setTransform(1, 0, 0, 1, 0, 0); f.imageSmoothingEnabled = false;
  f.fillStyle = '#0d1018'; f.fillRect(0, 0, fw, fh);
  f.setTransform(1, 0, 0, 1, -fx0, -fy0);
  const sx0 = Math.max(0, fx0), sy0 = Math.max(0, fy0), sx1 = Math.min(FW, fx0 + fw), sy1 = Math.min(FH, fy0 + fh);
  if (sx1 > sx0 && sy1 > sy0) {
    if (overlays.underground) drawUnderground(f, sx0, sy0, sx1, sy1);
    else drawWorld(f, sx0, sy0, sx1, sy1);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = z < 1;
  const zz = z * dpr;
  ctx.drawImage(frameCv, 0, 0, fw, fh, Math.round((fx0 - cam.x) * zz), Math.round((fy0 - cam.y) * zz), Math.round(fw * zz), Math.round(fh * zz));
  const ox = Math.round(-cam.x * zz), oy = Math.round(-cam.y * zz);
  // district borders
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(1, dpr); ctx.setLineDash([6 * dpr, 6 * dpr]);
  ctx.beginPath();
  for (let k = 1; k < RW; k++) { const x = ox + k * DW * T * zz; ctx.moveTo(x, oy); ctx.lineTo(x, oy + FH * zz); }
  for (let k = 1; k < RH; k++) { const y = oy + k * DH * T * zz; ctx.moveTo(ox, y); ctx.lineTo(ox + FW * zz, y); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.strokeRect(ox, oy, FW * zz, FH * zz);
  if (overlays.grid && z >= 2) {
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1; ctx.beginPath();
    const step = T * zz;
    const xa = Math.max(0, Math.floor(-ox / step)), xb = Math.min(MW, Math.ceil((cv.width - ox) / step));
    const ya = Math.max(0, Math.floor(-oy / step)), yb = Math.min(MH, Math.ceil((cv.height - oy) / step));
    for (let x = xa; x <= xb; x++) { const sx = ox + x * step + 0.5; ctx.moveTo(sx, Math.max(0, oy + ya * step)); ctx.lineTo(sx, Math.min(cv.height, oy + yb * step)); }
    for (let y = ya; y <= yb; y++) { const sy = oy + y * step + 0.5; ctx.moveTo(Math.max(0, ox + xa * step), sy); ctx.lineTo(Math.min(cv.width, ox + xb * step), sy); }
    ctx.stroke();
  }
}
// District paint: one fill per run of tiles, and only inside the camera frame.
function drawDistricts(f, vx0, vy0, vx1, vy1) {
  const seen = new Set();
  for (let y = vy0; y <= vy1; y++) {
    let x = vx0;
    while (x <= vx1) {
      const id = districtLayer[y * MW + x];
      if (!id) { x++; continue; }
      let x2 = x;
      while (x2 + 1 <= vx1 && districtLayer[y * MW + x2 + 1] === id) x2++;
      const d = districts.get(id);
      if (d) {
        f.globalAlpha = 0.22;
        f.fillStyle = d.color;
        f.fillRect(x * T, y * T, (x2 - x + 1) * T, T);
        f.globalAlpha = 1;
        seen.add(d.id);
      }
      x = x2 + 1;
    }
  }
  // borders: a thin line wherever the district changes
  f.globalAlpha = 0.7;
  for (let y = vy0; y <= vy1; y++) {
    for (let x = vx0; x <= vx1; x++) {
      const id = districtLayer[y * MW + x];
      if (!id) continue;
      const d = districts.get(id);
      if (!d) continue;
      const up = y > 0 ? districtLayer[(y - 1) * MW + x] : 0;
      const left = x > 0 ? districtLayer[y * MW + x - 1] : 0;
      f.fillStyle = d.color;
      if (up !== id) f.fillRect(x * T, y * T, T, 1);
      if (left !== id) f.fillRect(x * T, y * T, 1, T);
    }
  }
  f.globalAlpha = 1;
}
function drawWorld(f, sx0, sy0, sx1, sy1) {
  const sw = sx1 - sx0, sh = sy1 - sy0;
  const vx0 = Math.floor(sx0 / T), vy0 = Math.floor(sy0 / T), vx1 = Math.min(MW - 1, Math.floor((sx1 - 1) / T)), vy1 = Math.min(MH - 1, Math.floor((sy1 - 1) / T));
  const inV = b => !(b.x > vx1 || b.x + b.w <= vx0 || b.y > vy1 || b.y + b.h <= vy0);
  const inP = (x, y) => x >= sx0 - 12 && y >= sy0 - 30 && x <= sx1 + 12 && y <= sy1 + 12;
  chunkBudget = 8;
  for (let cy = Math.floor(vy0 / CHH); cy <= Math.floor(vy1 / CHH); cy++) for (let cx = Math.floor(vx0 / CW); cx <= Math.floor(vx1 / CW); cx++) {
    const ch = getChunk(cx, cy);
    if (ch) f.drawImage(ch, cx * CW * T, cy * CHH * T);
    else f.drawImage(miniCv, cx * CW, cy * CHH, CW, CHH, cx * CW * T, cy * CHH * T, CW * T, CHH * T);
  }
  if (overlays.districts && districts.size) drawDistricts(f, vx0, vy0, vx1, vy1);
  const h = (gameMin / 60) % 24, dark = darkness(h);
  const vis = [];
  for (const b of buildings.values()) if (inV(b)) vis.push(b);
  // parked cars and park visitors
  for (const b of vis) {
    const a = b.art; if (!a) continue;
    const d = BT[b.type];
    if (a.park.length && d.cap) {
      const n = b.cars > 0 ? Math.min(a.park.length, Math.max(1, Math.round(b.cars / d.cap * a.park.length))) : 0;
      for (let k = 0; k < n; k++) { const s = a.park[k]; drawCarSprite(f, s[0], s[1], !s[2], CARC[(b.id * 7 + k * 5) % CARC.length]); }
    }
    if (b.type === 'park') {
      const n = Math.min(a.win.length, b.people);
      for (let k = 0; k < n; k++) { const w = a.win[a.order[k]]; f.fillStyle = SHIRT[(k * 3 + b.id) % SHIRT.length]; f.fillRect(w[0], w[1], 1, 1); }
    }
  }

  // emergency units and the incidents they are working
  for (const u of units) {
    if (!inP(u.x * T, u.y * T)) continue;
    const px = Math.round(u.x * T), py = Math.round(u.y * T);
    f.fillStyle = u.kind === 'firetruck' ? '#d92b2b' : '#f4f7fb';
    f.fillRect(px - 3, py - 2, 6, 4);
    f.fillStyle = u.kind === 'firetruck' ? '#ffd75e' : '#d92b2b';
    f.fillRect(px - 1, py - 1, 2, 2);
    if (u.state === 'onscene') {
      f.fillStyle = (performance.now() / 300 | 0) % 2 ? '#ff5050' : '#6fb3ff';
      f.fillRect(px - 1, py - 8, 2, 2);
    }
  }
  for (const inc of incidents) {
    if (!inP(inc.x * T, inc.y * T)) continue;
    const px = Math.round(inc.x * T), py = Math.round(inc.y * T);
    if (inc.kind === 'fire') {
      const k = (performance.now() / 120 | 0) % 3;
      f.fillStyle = '#ff6a00'; f.fillRect(px - 3, py - 6 + k, 6, 6 - k);
      f.fillStyle = '#ffd24a'; f.fillRect(px - 1, py - 4 + k, 2, 4 - k);
    } else {
      f.fillStyle = '#3a3a44'; f.fillRect(px - 3, py - 2, 2, 2); f.fillRect(px + 1, py - 1, 2, 2);
      f.fillStyle = '#ff9b3d'; f.fillRect(px, py - 2, 1, 1);
    }
  }
  for (const b of boats) if (inP(b.x, b.y)) drawBoat(f, b);
  for (const s of ships) if (inP(s.x, s.y)) drawShip(f, s);
  for (const p of peds) {
    if (p.dead || p.hidden || !inP(p.x, p.y)) continue;
    drawPed(f, Math.round(p.x - 0.5), Math.round(p.y - 0.5), p.color);
  }
  // people queueing at bus stops (metro riders wait underground, out of sight)
  for (const b of vis) {
    const sp = b.art && b.art.spots; if (!sp || b.type !== 'busstop' || !b.waiting) continue;
    const n = Math.min(sp.length, b.waiting);
    for (let k = 0; k < n; k++) drawPed(f, sp[k][0], sp[k][1], SHIRT[(k * 3 + b.id) % SHIRT.length]);
  }
  // cars (east-west cars on an overpass are drawn after its deck, so the others pass underneath)
  const drawCar = c => {
    const hz = c.d === 2 || c.d === 4;
    if (c.bus) {
      // a long yellow bus with a row of windows
      drawBus(f, Math.round(c.x - (hz ? 2.5 : 1)), Math.round(c.y - (hz ? 1 : 2.5)), hz);
      return;
    }
    if (c.truck) {
      drawTruck(f, Math.round(c.x - (hz ? 2.5 : 1)), Math.round(c.y - (hz ? 1 : 2.5)), hz, c.color);
      return;
    }
    drawCarSprite(f, Math.round(c.x - (hz ? 1.5 : 1)), Math.round(c.y - (hz ? 1 : 1.5)), hz, c.color);
  };
  const onDeck = [];
  for (const c of cars) {
    if (c.dead || !inP(c.x, c.y)) continue;
    if (overpassList.length && (c.d === 2 || c.d === 4) && overpass[tileAt(c.x, c.y)]) { onDeck.push(c); continue; }
    drawCar(c);
  }
  for (const i of overpassList) { const x = i % MW, y = i / MW | 0; if (x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1) drawDeck(f, x * T, y * T, tile[i] === 2); }
  for (const c of onDeck) drawCar(c);
  // freight trains on the surface tracks: the head, then one wagon per tile behind it
  for (const t of freight) {
    if (!t.path || t.state === 'dwell') continue;
    const hz = t.d === 2 || t.d === 4;
    for (let k = 0; k < t.consist.length; k++) {
      const idx = t.i - k;
      if (idx < 0 || idx >= t.path.length - 1) continue;
      const a = t.path[idx], b = t.path[idx + 1];
      const ax = a % MW, ay = a / MW | 0, bx = b % MW, by = b / MW | 0;
      const tt = k === 0 ? t.t : 0.5;
      const px = (ax + (bx - ax) * tt) * T + 4.5, py = (ay + (by - ay) * tt) * T + 4.5;
      if (px / T < vx0 - 2 || px / T > vx1 + 2 || py / T < vy0 - 2 || py / T > vy1 + 2) continue;
      drawFreightCar(f, Math.round(px - (hz ? 3.5 : 1.5)), Math.round(py - (hz ? 1.5 : 3.5)), hz, t.consist[k]);
    }
  }
  // roads that leave the region
  f.fillStyle = '#6fb3ff';
  for (const i of connections) {
    const x = i % MW, y = i / MW | 0;
    if (x === 0) f.fillRect(0, y * T + 2, 1, 5); if (x === MW - 1) f.fillRect(FW - 1, y * T + 2, 1, 5);
    if (y === 0) f.fillRect(x * T + 2, 0, 5, 1); if (y === MH - 1) f.fillRect(x * T + 2, FH - 1, 5, 1);
  }
  if (overlays.occ) {
    for (const b of vis) {
      const d = BT[b.type];
      const v = Math.min(1, d.homes ? b.people / d.homes : d.cap ? b.cars / d.cap : Math.min(1, b.people / 12));
      f.fillStyle = `rgba(${Math.round(60 + 195 * v)},${Math.round(200 - 140 * v)},${Math.round(255 - 200 * v)},.55)`;
      f.fillRect(b.x * T, b.y * T, b.w * T, b.h * T);
    }
  }
  if (dark > 0) { f.fillStyle = `rgba(8,12,40,${dark})`; f.fillRect(sx0, sy0, sw, sh); }
  // lit windows (on top of darkness so they glow); sleepers turn their lights off
  f.fillStyle = dark > 0.2 ? '#ffe27a' : '#f5cf55';
  for (const b of vis) {
    const a = b.art; if (!a || !a.win.length || b.type === 'park') continue;
    const d = BT[b.type];
    const capP = d.homes || (d.jobs + d.cap) || 1;
    const awake = d.homes ? Math.max(0, b.people - b.asleep) : b.people;
    const n = awake > 0 ? Math.min(a.win.length, Math.max(1, Math.round(awake / capP * a.win.length))) : 0;
    for (let k = 0; k < n; k++) { const w = a.win[a.order[k]]; f.fillRect(w[0], w[1], 1, 1); }
  }
  const blink = (performance.now() / 700 | 0) % 2;
  for (const b of vis) {
    const a = b.art; if (!a) continue;
    const d = BT[b.type];
    if (a.stat) {
      const r = d.homes ? b.people / d.homes : d.cap ? b.cars / d.cap : 0;
      f.fillStyle = (d.homes ? b.people === 0 : b.cars === 0) ? '#59606f' : r >= 1 ? '#ff4848' : r >= 0.75 ? '#ffc23f' : '#3ef06b';
      f.fillRect(a.stat[0], a.stat[1], 2, 1);
    }
    if (d.homes && b.residents) {
      // a little "z" when everyone inside is asleep, and a face showing how residents feel about traffic
      if (dark > 0.2 && b.asleep && b.asleep >= b.people) {
        const x = b.x * T + b.w * T - 4, y = b.y * T + (blink ? 0 : 1);
        f.fillStyle = 'rgba(190,210,255,.85)'; f.fillRect(x, y, 3, 1); f.fillRect(x + 1, y + 1, 1, 1); f.fillRect(x, y + 2, 3, 1);
      }
      if (overlays.mood) drawFace(f, b.x * T + 1, b.y * T - 2, moodFace(b.mood));
    }
    // blinking no-parking sign where drivers recently gave up looking for a space
    if (b.parkFail !== undefined && simTime - b.parkFail < 40 && (performance.now() / 450 | 0) % 2) {
      const x = b.x * T + (b.w * T >> 1) - 2, y = b.y * T - 4;
      f.fillStyle = '#ffffff'; f.fillRect(x - 1, y - 1, 7, 8);
      f.fillStyle = '#2f6fd0'; f.fillRect(x, y, 5, 6);
      f.fillStyle = '#ffffff'; for (const [px, py] of [[1, 1], [2, 1], [1, 2], [3, 2], [1, 3], [2, 3], [1, 4]]) f.fillRect(x + px, y + py, 1, 1);
      f.fillStyle = '#ff3b3b'; for (let k = 0; k < 6; k++) f.fillRect(x + Math.round(k * 0.8), y + 5 - k, 1, 1);
    }
    const missingRoad = needsRoad(b.type) && b.road < 0;
    if (missingRoad && (performance.now() / 400 | 0) % 2) {
      const x = b.x * T + (b.w * T >> 1) - 1, y = b.y * T + 1;
      f.fillStyle = '#ff3b3b'; f.fillRect(x, y, 2, 4); f.fillRect(x, y + 5, 2, 2);
    }
  }
  if (dark > 0.15) {
    for (const c of cars) {
      if (c.dead || !inP(c.x, c.y)) continue;
      const hx = DX[c.d], hy = DY[c.d];
      f.fillStyle = 'rgba(255,240,170,.9)';
      f.fillRect(Math.round(c.x + hx * 2 - 0.5 - (hy ? 0.5 : 0)), Math.round(c.y + hy * 2 - 0.5 - (hx ? 0.5 : 0)), hy ? 2 : 1, hx ? 2 : 1);
      f.fillStyle = 'rgba(255,240,170,.25)';
      f.fillRect(Math.round(c.x + hx * 3 - 1), Math.round(c.y + hy * 3 - 1), 2, 2);
    }
  }
  for (const [i, L] of lights) {
    const tx = i % MW, ty = i / MW | 0; if (tx < vx0 || tx > vx1 || ty < vy0 || ty > vy1) continue;
    const x0 = tx * T, y0 = ty * T;
    f.fillStyle = LCOL[lightState(L, 0)]; f.fillRect(x0, y0, 1, 1); f.fillRect(x0 + 8, y0 + 8, 1, 1);
    f.fillStyle = LCOL[lightState(L, 1)]; f.fillRect(x0 + 8, y0, 1, 1); f.fillRect(x0, y0 + 8, 1, 1);
  }
  // the sky layer owns aircraft in flight; anything on a runway or parked stays visible
  for (const p of planes) if (inP(p.x, p.y) && (overlays.sky || p.alt < 1)) drawPlane(f, p, dark > 0.2);
  // congestion map: dim the city, paint a smooth green-to-red field, then color each road tile
  if (overlays.heat) {
    f.fillStyle = 'rgba(10,12,24,.55)'; f.fillRect(sx0, sy0, sw, sh);
    f.imageSmoothingEnabled = true;
    f.drawImage(areaCv, sx0 / T, sy0 / T, sw / T, sh / T, sx0, sy0, sw, sh);
    f.imageSmoothingEnabled = false;
    for (let ty = vy0; ty <= vy1; ty++) for (let tx = vx0; tx <= vx1; tx++) {
      const i = ty * MW + tx; if (!isRoad(i)) continue;
      const [r, g, b] = heatRGB(heat[i] / 2);
      f.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},.9)`;
      f.fillRect(tx * T + 1, ty * T + 1, 7, 7);
      const m = cmask[i];
      if (m & 1) f.fillRect(tx * T + 1, ty * T, 7, 1); if (m & 4) f.fillRect(tx * T + 1, ty * T + 8, 7, 1);
      if (m & 8) f.fillRect(tx * T, ty * T + 1, 1, 7); if (m & 2) f.fillRect(tx * T + 8, ty * T + 1, 1, 7);
    }
  }
  if (flash && performance.now() < flash.until) {
    const x = (flash.i % MW) * T + 4, y = (flash.i / MW | 0) * T + 4, r = 10 + ((performance.now() / 60) % 12);
    f.strokeStyle = '#ffffff'; f.lineWidth = 2; f.beginPath(); f.arc(x, y, r, 0, Math.PI * 2); f.stroke();
  }
  if (overlays.weather) drawWeather(f, sx0, sy0, sx1, sy1);
  drawPreview(f);
}

// Weather: one soft disc per cell. The middle is a little darker, the rim is
// fully transparent, so two neighbouring cells cross-fade into each other.
function drawWeather(f, sx0, sy0, sx1, sy1) {
  for (const cell of weatherCells) {
    const k = WEATHER_KINDS[cell.kind];
    if (!k || !k.tint) continue;
    const cx = cell.x * T, cy = cell.y * T, R = WX_R * T;
    if (cx + R < sx0 || cx - R > sx1 || cy + R < sy0 || cy - R > sy1) continue;
    const [r, g, b, a] = k.tint;
    const gr = f.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    gr.addColorStop(0.7, `rgba(${r},${g},${b},${a})`);
    gr.addColorStop(0.9, `rgba(${r},${g},${b},${a * 0.4})`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    f.fillStyle = gr;
    f.fillRect(cx - R, cy - R, R * 2, R * 2);
    if (k.wet && weatherSnowAt(cell.x, cell.y)) drawSnow(f, cell, R, sx0, sy0, sx1, sy1);
    else if (k.wet) drawRain(f, cell, R, sx0, sy0, sx1, sy1);
    else if (cell.kind === 'snow') drawSnow(f, cell, R, sx0, sy0, sx1, sy1);
  }
}
function drawRain(f, cell, R, sx0, sy0, sx1, sy1) {
  const t = performance.now() / 1000;
  const cx = cell.x * T, cy = cell.y * T, heavy = cell.kind === 'storm';
  const n = heavy ? 390 : 255, speed = heavy ? 430 : 365;
  for (let k = 0; k < n; k++) {
    const ang = hash(k, 11, cell.id) * Math.PI * 2, rr = Math.sqrt(hash(k, 12, cell.id)) * R;
    const fall = (t * speed + hash(k, 13, cell.id) * 900) % 210;
    const x = cx + Math.cos(ang) * rr + fall * 0.18, y = cy + Math.sin(ang) * rr + fall * 0.55;
    if (x < sx0 - 3 || x > sx1 + 3 || y < sy0 - 3 || y > sy1 + 3) continue;
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > R * R) continue;
    const px = Math.round(x), py = Math.round(y), phase = (t * speed + hash(k, 13, cell.id) * 900) % 210;
    const tx = Math.floor(x / T), ty = Math.floor(y / T), ti = inb(tx, ty) ? ty * MW + tx : -1;
    if (ti >= 0 && biome[ti] === 4) {
      f.fillStyle = 'rgba(248,252,255,.85)'; f.fillRect(px, py, 1, 1);
    } else if (phase > 196 && ti >= 0 && !water[ti]) {
      // A drop breaks into tiny droplets when it reaches the ground.
      f.fillStyle = 'rgba(205,230,255,.55)';
      f.fillRect(px - 1, py, 1, 1); f.fillRect(px, py - 1, 1, 1); f.fillRect(px + 1, py, 1, 1);
      f.fillRect(px - 2, py + 1, 1, 1); f.fillRect(px + 2, py + 1, 1, 1);
    } else {
      f.fillStyle = heavy ? 'rgba(178,205,255,.7)' : 'rgba(190,220,255,.55)';
      f.fillRect(px, py, 1, 2);
    }
  }
}
function drawSnow(f, cell, R, sx0, sy0, sx1, sy1) {
  const t = performance.now() / 1000, cx = cell.x * T, cy = cell.y * T;
  const n = cell.kind === 'storm' ? 170 : 120;
  f.fillStyle = 'rgba(248,252,255,.85)';
  for (let k = 0; k < n; k++) {
    const ang = hash(k, 31, cell.id) * Math.PI * 2, rr = Math.sqrt(hash(k, 32, cell.id)) * R;
    const fall = (t * 22 + hash(k, 33, cell.id) * 420) % 210;
    const x = cx + Math.cos(ang) * rr + Math.sin(t * 0.7 + k) * 2, y = cy + Math.sin(ang) * rr + fall * 0.35;
    const dx = x - cx, dy = y - cy;
    if (x >= sx0 && x <= sx1 && y >= sy0 && y <= sy1 && dx * dx + dy * dy <= R * R) f.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}

// Underground view: the city above is gone, so all that is left of the surface
// is the water. What you look at instead is the network: traces, junction pads,
// reversing blocks, platforms and the trains between them.
function drawUnderground(f, sx0, sy0, sx1, sy1) {
  f.fillStyle = '#04080b';
  f.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
  const vx0 = Math.floor(sx0 / T), vy0 = Math.floor(sy0 / T);
  const vx1 = Math.min(MW - 1, Math.floor((sx1 - 1) / T)), vy1 = Math.min(MH - 1, Math.floor((sy1 - 1) / T));

  for (let ty = vy0; ty <= vy1; ty++) for (let tx = vx0; tx <= vx1; tx++) {
    if (!water[ty * MW + tx]) continue;
    f.fillStyle = '#0b2434'; f.fillRect(tx * T, ty * T, T, T);
    if ((tx * 3 + ty) % 5 === 0) { f.fillStyle = '#123b52'; f.fillRect(tx * T, ty * T + 4, T, 1); }
  }

  for (let ty = vy0; ty <= vy1; ty++) for (let tx = vx0; tx <= vx1; tx++) {
    const i = ty * MW + tx, m = rail[i];
    if (!m) continue;
    const n = bits(m);
    drawRailTile(f, tx * T, ty * T, m, n === 1 ? 'reverse' : n >= 3 ? 'junction' : 'rail');
  }

  for (const s of stations) {
    if (s.x < vx0 || s.x > vx1 || s.y < vy0 || s.y > vy1) continue;
    drawStationPad(f, s.x * T, s.y * T);
    // a pip per waiting rider, up to five, so demand is visible at a glance
    const n = Math.min(5, s.waiting || 0);
    f.fillStyle = '#9ff0c8';
    for (let k = 0; k < n; k++) f.fillRect(s.x * T + 1 + k, s.y * T + 8, 1, 1);
  }

  for (const m of metros) {
    const tx = m.x / T, ty = m.y / T;
    if (tx < vx0 - 1 || tx > vx1 + 1 || ty < vy0 - 1 || ty > vy1 + 1) continue;
    const hz = m.d === 2 || m.d === 4;
    drawMetro(f, Math.round(m.x - (hz ? 3.5 : 1.5)), Math.round(m.y - (hz ? 1.5 : 3.5)), hz);
  }
  // the placement ghost still works down here, so you can see where a station lands
  drawPreview(f);
}

// Region view: every district at once, live.
let distStats = [];
function computeDistStats() {
  distStats = DISTRICTS.map(() => ({homes: 0, jobs: 0, pop: 0}));
  for (const b of buildings.values()) { const s = distStats[districtOf(b.cx, b.cy)]; s.homes += BT[b.type].homes; s.jobs += BT[b.type].jobs; s.pop += b.residents; }
}
function openRegion() { regionView = true; regionHover = -1; document.body.classList.add('region'); select(null); hideTip(); setT('zoomLbl', 'Region'); }
function closeRegion() { regionView = false; document.body.classList.remove('region'); cv.style.cursor = curTool === 'inspect' ? 'pointer' : 'crosshair'; zoomTo(cam.z); }
function regionHit(sx, sy) {
  const L = regionLayout; if (!L) return -1;
  const mx = Math.floor((sx - L.x0) / (DW * T * L.s)), my = Math.floor((sy - L.y0) / (DH * T * L.s));
  return (mx >= 0 && my >= 0 && mx < RW && my < RH) ? my * RW + mx : -1;
}
function renderRegion() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, cv.width, cv.height);
  const W = innerWidth, H = innerHeight, top = document.getElementById('top').getBoundingClientRect().bottom + 14, bot = 64;
  const s = Math.min((W - 40) / FW, (H - top - bot) / FH);
  const x0 = (W - FW * s) / 2, y0 = top + (H - top - bot - FH * s) / 2;
  regionLayout = {x0, y0, s};
  const k = dpr;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(miniCv, x0 * k, y0 * k, FW * s * k, FH * s * k);
  if (overlays.heat) { ctx.imageSmoothingEnabled = true; ctx.drawImage(areaCv, x0 * k, y0 * k, FW * s * k, FH * s * k); ctx.imageSmoothingEnabled = false; }
  const dot = Math.max(1.5, 2 * s * T) * k;
  ctx.fillStyle = '#ff5d5d';
  for (const c of cars) ctx.fillRect((x0 + c.x * s) * k - dot / 2, (y0 + c.y * s) * k - dot / 2, dot, dot);
  ctx.fillStyle = '#ffffff';
  for (const b of boats) ctx.fillRect((x0 + b.x * s) * k - dot / 2, (y0 + b.y * s) * k - dot / 2, dot, dot);
  for (const p of planes) {
    const px = (x0 + (p.x - p.alt * 0.5) * s) * k, py = (y0 + (p.y - p.alt) * s) * k;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect((x0 + p.x * s) * k - 2 * k, (y0 + p.y * s) * k - k, 4 * k, 2 * k);
    ctx.fillStyle = '#f4f5f7'; ctx.fillRect(px - 3 * k, py - k / 2, 6 * k, k); ctx.fillRect(px - k / 2, py - 3 * k, k, 6 * k);
  }
  const dw = DW * T * s, dh = DH * T * s;
  for (let m = 0; m < RW * RH; m++) {
    const x = x0 + (m % RW) * dw, y = y0 + (m / RW | 0) * dh;
    ctx.lineWidth = (m === regionHover ? 3 : 1) * k;
    ctx.strokeStyle = m === regionHover ? '#ffd75e' : 'rgba(0,0,0,.65)';
    ctx.strokeRect(x * k + ctx.lineWidth / 2, y * k + ctx.lineWidth / 2, dw * k - ctx.lineWidth, dh * k - ctx.lineWidth);
    const st = distStats[m] || {homes: 0, jobs: 0, pop: 0};
    ctx.fillStyle = 'rgba(10,14,30,.82)'; ctx.fillRect((x + 6) * k, (y + 6) * k, 176 * k, 42 * k);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `${20 * k}px VT323, monospace`; ctx.fillStyle = m === regionHover ? '#ffd75e' : '#e9ecf5';
    ctx.fillText(DISTRICTS[m], (x + 12) * k, (y + 8) * k);
    ctx.font = `${16 * k}px VT323, monospace`; ctx.fillStyle = '#9aa3bf';
    ctx.fillText(`Pop ${st.pop} · Jobs ${st.jobs}`, (x + 12) * k, (y + 28) * k);
  }
}
