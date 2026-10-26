// =====================================================================
// Rendering
// =====================================================================
let dpr = Math.max(1, window.devicePixelRatio || 1);
const cam = {x: 0, y: 0, z: 3};
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
let flash = null; // {i, until} highlighted hotspot
let frameLod = 1; // buffer pixels per world pixel for the frame being drawn
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
// The congestion colours, quantized into shades that are prepared once: the heat
// overlay then never has to build a colour string inside its tile loop.
const HEAT_BUCKETS = Array.from({length: 32}, (_, k) => {
  const [r, g, b] = heatRGB((k + 0.5) / 32);
  return { col: `rgba(${r | 0},${g | 0},${b | 0},.9)`, n: 0, a: [] };
});
const moodFace = m => m >= 0.7 ? 'happy' : m >= 0.5 ? 'ok' : m >= 0.3 ? 'sad' : 'angry';
function render() {
  if (regionView) { renderRegion(); return; }
  const z = cam.z;
  // Level of detail: the world is drawn into a frame buffer at one buffer pixel
  // per world pixel, which is exactly right while the view is magnified. At the
  // far zoom on a 1× display a world pixel lands on half a screen pixel, so the
  // buffer is built at half size instead: a quarter of the fill, chunk and upload
  // work, and every buffer pixel still gets at least one whole screen pixel. It
  // only steps down when the buffer would otherwise be thrown away, so nothing
  // on screen loses sharpness.
  const lod = z * dpr <= 0.5 ? 0.5 : 1;
  frameLod = lod;
  const fw = Math.ceil(innerWidth / z * lod) + 2, fh = Math.ceil(innerHeight / z * lod) + 2;
  const fwx = fw / lod, fhy = fh / lod;             // the same buffer, measured in world pixels
  if (frameCv.width !== fw || frameCv.height !== fh) { frameCv.width = fw; frameCv.height = fh; }
  const fx0 = Math.floor(cam.x), fy0 = Math.floor(cam.y), f = fctx;
  f.setTransform(1, 0, 0, 1, 0, 0); f.imageSmoothingEnabled = false;
  f.fillStyle = '#0d1018'; f.fillRect(0, 0, fw, fh);
  f.setTransform(lod, 0, 0, lod, -fx0 * lod, -fy0 * lod);
  f.imageSmoothingEnabled = lod < 1;
  const sx0 = Math.max(0, fx0), sy0 = Math.max(0, fy0), sx1 = Math.min(FW, fx0 + fwx), sy1 = Math.min(FH, fy0 + fhy);
  if (sx1 > sx0 && sy1 > sy0) {
    if (overlays.underground) drawUnderground(f, sx0, sy0, sx1, sy1);
    else drawWorld(f, sx0, sy0, sx1, sy1);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const zz = z * dpr;
  const dx = Math.round((fx0 - cam.x) * zz), dy = Math.round((fy0 - cam.y) * zz);
  const dw = Math.round(fwx * zz), dh = Math.round(fhy * zz);
  // The frame covers the viewport exactly, so clearing the screen first would be
  // a wasted full-screen fill. Only do it when rounding leaves a gap.
  if (dx > 0 || dy > 0 || dx + dw < cv.width || dy + dh < cv.height) {
    ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, cv.width, cv.height);
  }
  ctx.imageSmoothingEnabled = zz / lod < 1;
  ctx.drawImage(frameCv, 0, 0, fw, fh, dx, dy, dw, dh);
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
// District paint: one blit per visible chunk of a layer that only changes when
// the player edits a district (see districtChunk in map.js).
function drawDistricts(f, vx0, vy0, vx1, vy1) {
  const cy1 = Math.floor(vy1 / CHH), cx1 = Math.floor(vx1 / CW);
  for (let cy = Math.floor(vy0 / CHH); cy <= cy1; cy++)
    for (let cx = Math.floor(vx0 / CW); cx <= cx1; cx++) {
      const c = districtChunk(cx, cy);
      if (c) f.drawImage(c, cx * CW * T, cy * CHH * T);
    }
}
function drawWorld(f, sx0, sy0, sx1, sy1) {
  const sw = sx1 - sx0, sh = sy1 - sy0;
  const vx0 = Math.floor(sx0 / T), vy0 = Math.floor(sy0 / T), vx1 = Math.min(MW - 1, Math.floor((sx1 - 1) / T)), vy1 = Math.min(MH - 1, Math.floor((sy1 - 1) / T));
  const inV = b => !(b.x > vx1 || b.x + b.w <= vx0 || b.y > vy1 || b.y + b.h <= vy0);
  const inP = (x, y) => x >= sx0 - 12 && y >= sy0 - 30 && x <= sx1 + 12 && y <= sy1 + 12;
  chunkBuilt = 0; chunkDeadline = performance.now() + CHUNK_MS;
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
    // Leisure plots show their visitors as dots, the same way a park does:
    // a promenade fills up along its boards, an attraction out front.
    if (isLeisure(b.type)) {
      const spots = a.spots || a.win;
      const n = Math.min(spots.length, b.people);
      for (let k = 0; k < n; k++) {
        const s = a.spots ? spots[k] : spots[a.order[k]];
        f.fillStyle = SHIRT[(k * 3 + b.id) % SHIRT.length]; f.fillRect(s[0], s[1], 1, 1);
      }
    }
  }

  // streets shut by a crash: a red and white barrier across the carriageway
  for (const [i, until] of streetClosures) {
    if (until <= simTime) continue;
    const tx = i % MW, ty = i / MW | 0;
    if (tx < vx0 || tx > vx1 || ty < vy0 || ty > vy1) continue;
    drawStreetClosure(f, tx * T, ty * T, (cmask[i] & 10) !== 0);
  }
  // crash sites: the scorch and hull outlive the incident, the smoke fades
  for (const w of wrecks) if (inP(w.x * T, w.y * T)) drawWreck(f, w, simTime);
  // emergency units and the incidents they are working. A unit sitting in its
  // station is parked inside the building, so only the ones on the road show.
  for (const u of units) {
    if (u.state === 'idle' || !inP(u.x * T, u.y * T)) continue;
    const px = Math.round(u.x * T), py = Math.round(u.y * T);
    drawEmergencyUnit(f, u);
    if (u.state === 'onscene') {
      f.fillStyle = (performance.now() / 300 | 0) % 2 ? '#ff5050' : '#6fb3ff';
      f.fillRect(px - 1, py - 8, 2, 2);
    }
  }
  for (const inc of incidents) {
    if (!inP(inc.x * T, inc.y * T)) continue;
    const px = Math.round(inc.x * T), py = Math.round(inc.y * T);
    if (inc.kind === 'fire') {
      drawFire(f, px, py, (performance.now() / 140 | 0) % 3);
      // a blinking alert over the burning building, in the same spirit as the
      // no-parking sign drivers raise
      if ((performance.now() / 420 | 0) % 2) {
        const ax = px - 2, ay = py - 19;
        f.fillStyle = '#ffffff'; f.fillRect(ax - 1, ay - 1, 9, 12);
        f.fillStyle = '#ff3b3b'; f.fillRect(ax, ay, 7, 10);
        f.fillStyle = '#ffffff'; f.fillRect(ax + 3, ay + 2, 1, 4); f.fillRect(ax + 3, ay + 7, 1, 1);
      }
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
  // rail signal lamps: red while a train holds the block beyond them. Drawn
  // live, so a lamp changes the moment a block is claimed.
  for (let k = 0; k < trackSignals.length; k += 3) {
    const i = trackSignals[k], tx = i % MW, ty = i / MW | 0;
    if (tx < vx0 || tx > vx1 || ty < vy0 || ty > vy1) continue;
    drawTrackSignal(f, tx * T, ty * T, trackSignals[k + 1], blockBusy(trackSignals[k + 2]));
  }
  // crossing gates: the arm comes down while a train is on its way
  for (const i of gates) {
    const x = i % MW, y = i / MW | 0;
    if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
    drawCrossingGate(f, x * T, y * T, (track[i] & 10) !== 0, railBusyAt(i) || railSoonAt(i));
  }
  // Freight trains: the engine moves continuously, and each wagon trails it
  // by a fixed distance along the same path, so the whole consist moves at
  // one speed. A wagon facing into a corner takes its orientation from the
  // segment its own centre is on, not from the engine at the front.
  const CAR_GAP = 1; // tiles between wagon centres
  for (const t of freight) {
    if (!t.path) continue;
    // A train in a yard still has its wagons on the way in; `ex` is how far
    // the locomotive has run past the buffers, so the tail follows it out of
    // The consist stays on its track while it works the yard, drawn over the
    // yard building instead of sinking into it wagon by wagon.
    for (let k = 0; k < t.consist.length; k++) {
      const odo = t.i + t.t - k * CAR_GAP;
      if (odo < 0 || odo > t.path.length - 1) continue;
      let idx = Math.floor(odo), frac = odo - idx;
      if (idx >= t.path.length - 1) { idx = t.path.length - 2; frac = 1; }
      if (idx < 0) continue;
      const a = t.path[idx], b = t.path[idx + 1];
      const ax = a % MW, ay = a / MW | 0, bx = b % MW, by = b / MW | 0;
      const d = dirOf(a, b) || 2;
      const hz = d === 2 || d === 4;
      const px = (ax + (bx - ax) * frac) * T + 4.5;
      const py = (ay + (by - ay) * frac) * T + 4.5;
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
  // lit windows (on top of darkness so they glow); sleepers turn their lights off.
  // Every window in the city goes into one path, so this is a single fill rather
  // than a few thousand one-pixel paint commands.
  f.fillStyle = dark > 0.2 ? '#ffe27a' : '#f5cf55';
  f.beginPath();
  for (const b of vis) {
    // A leisure plot's marks are people spots rather than glass, except the
    // aquarium, whose tank windows still glow after dark.
    const a = b.art; if (!a || !a.win.length || (isLeisure(b.type) && b.type !== 'aquarium')) continue;
    const d = BT[b.type];
    const capP = d.homes || (d.jobs + d.cap) || 1;
    const awake = d.homes ? Math.max(0, b.people - b.asleep) : b.people;
    const n = awake > 0 ? Math.min(a.win.length, Math.max(1, Math.round(awake / capP * a.win.length))) : 0;
    for (let k = 0; k < n; k++) { const w = a.win[a.order[k]]; f.rect(w[0], w[1], 1, 1); }
  }
  f.fill();
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
  // Signal lamps: one path per colour instead of a fill and a colour change per
  // lamp. Nothing about a four-lamp intersection changes but how it is recorded.
  if (lights.size) {
    const lamps = [[], [], []];
    for (const [i, L] of lights) {
      const tx = i % MW, ty = i / MW | 0; if (tx < vx0 || tx > vx1 || ty < vy0 || ty > vy1) continue;
      const x0 = tx * T, y0 = ty * T, a = lamps[lightState(L, 0)], b = lamps[lightState(L, 1)];
      a.push(x0, y0, x0 + 8, y0 + 8); b.push(x0 + 8, y0, x0, y0 + 8);
    }
    for (let k = 0; k < 3; k++) {
      const p = lamps[k]; if (!p.length) continue;
      f.fillStyle = LCOL[k]; f.beginPath();
      for (let j = 0; j < p.length; j += 2) f.rect(p[j], p[j + 1], 1, 1);
      f.fill();
    }
  }
  // the sky layer owns aircraft in flight; anything on a runway or parked stays visible
  for (const p of planes) {
    if (!inP(p.x, p.y) || !(overlays.sky || p.alt < 1)) continue;
    if (p.alt > 0.5) drawPlaneShadow(f, p, clamp(0.72 - p.alt * 0.02, 0.30, 0.72));
  }
  for (const p of planes) if (inP(p.x, p.y) && (overlays.sky || p.alt < 1)) drawPlane(f, p, dark > 0.2);
  // congestion map: dim the city, paint a smooth green-to-red field, then color each road tile
  if (overlays.heat) {
    f.fillStyle = 'rgba(10,12,24,.55)'; f.fillRect(sx0, sy0, sw, sh);
    f.imageSmoothingEnabled = true;
    f.drawImage(areaCv, sx0 / T, sy0 / T, sw / T, sh / T, sx0, sy0, sw, sh);
    f.imageSmoothingEnabled = frameLod < 1;   // back to the frame's own setting
    // Road heat, grouped by shade: one path and one fill per shade instead of a
    // fresh colour string and five fills for every road tile in view. The rect
    // lists are reused between frames, so drawing the overlay allocates nothing.
    for (const e of HEAT_BUCKETS) e.n = 0;
    for (let ty = vy0; ty <= vy1; ty++) for (let tx = vx0; tx <= vx1; tx++) {
      const i = ty * MW + tx; if (!isRoad(i)) continue;
      const e = HEAT_BUCKETS[Math.min(HEAT_BUCKETS.length - 1, heat[i] * 0.5 * HEAT_BUCKETS.length | 0)];
      const x0 = tx * T, y0 = ty * T, m = cmask[i], a = e.a;
      let n = e.n;
      a[n] = x0 + 1; a[n + 1] = y0 + 1; a[n + 2] = 7; a[n + 3] = 7; n += 4;
      if (m & 1) { a[n] = x0 + 1; a[n + 1] = y0; a[n + 2] = 7; a[n + 3] = 1; n += 4; }
      if (m & 4) { a[n] = x0 + 1; a[n + 1] = y0 + 8; a[n + 2] = 7; a[n + 3] = 1; n += 4; }
      if (m & 8) { a[n] = x0; a[n + 1] = y0 + 1; a[n + 2] = 1; a[n + 3] = 7; n += 4; }
      if (m & 2) { a[n] = x0 + 8; a[n + 1] = y0 + 1; a[n + 2] = 1; a[n + 3] = 7; n += 4; }
      e.n = n;
    }
    for (const e of HEAT_BUCKETS) {
      if (!e.n) continue;
      f.fillStyle = e.col; f.beginPath();
      for (let j = 0; j < e.n; j += 4) f.rect(e.a[j], e.a[j + 1], e.a[j + 2], e.a[j + 3]);
      f.fill();
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
    if (cell.kind === 'storm') drawLightning(f, cell, cx, cy, R, sx0, sy0, sx1, sy1);
  }
}

// A thunderstorm throws bolts: a jagged line from the cloud down to the ground,
// stroked three times (wide faint halo, mid glow, white core) with a flash where
// it lands. Everything is seeded off a time slot, so a bolt stays put while it is
// on screen and is gone 180ms later.
const BOLT_MS = 180;
function strokePath(f, pts, width, style) {
  f.strokeStyle = style; f.lineWidth = width;
  f.lineCap = 'round'; f.lineJoin = 'round';
  f.beginPath();
  f.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) f.lineTo(pts[k][0], pts[k][1]);
  f.stroke();
}
function drawLightning(f, cell, cx, cy, R, sx0, sy0, sx1, sy1) {
  const now = performance.now();
  const slot = Math.floor(now / BOLT_MS);
  if (hash(slot, 91, cell.id) > 0.06) return;          // a strike every few seconds
  const a = 1 - (now - slot * BOLT_MS) / BOLT_MS;      // fade out over the slot
  if (a <= 0.05) return;
  const px = cx + (hash(slot, 92, cell.id) - 0.5) * R * 1.5;
  const py = cy + (hash(slot, 93, cell.id) - 0.5) * R * 1.5;
  // The world is drawn in world pixels and then scaled by the zoom, so a fixed
  // bolt would be a hairline zoomed out and a thick bar zoomed in. Size it in
  // screen pixels instead: the same strike reads the same at every zoom.
  const zf = 1 / Math.max(0.4, cam.z);
  if (px < sx0 - 80 || px > sx1 + 80 || py < sy0 - 200 * zf || py > sy1 + 80) return;
  const top = py - (90 + hash(slot, 94, cell.id) * 130) * zf;
  // the main channel, jagged at every step
  const pts = [[px, top]];
  const steps = 7;
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const j = k === steps ? 0 : (hash(slot, 100 + k, cell.id) - 0.5) * 24 * zf;
    pts.push([px + j * (1 - t * 0.4), top + (py - top) * t]);
  }
  // a fork partway down
  const forkAt = 2 + (hash(slot, 130, cell.id) * 3 | 0);
  const f0 = pts[forkAt], side = hash(slot, 131, cell.id) < 0.5 ? -1 : 1;
  const fork = [[f0[0], f0[1]]];
  const flen = (30 + hash(slot, 132, cell.id) * 50) * zf;
  for (let k = 1; k <= 4; k++) {
    fork.push([f0[0] + side * (8 + hash(slot, 140 + k, cell.id) * 26) * zf * (k / 4),
      f0[1] + flen * (k / 4) * (0.4 + hash(slot, 150 + k, cell.id) * 0.5)]);
  }
  // the flash on the ground: a soft pool of light, brightest right under the bolt
  const gr = f.createRadialGradient(px, py, 0, px, py, 90 * zf);
  gr.addColorStop(0, `rgba(215,232,255,${(0.4 * a).toFixed(3)})`);
  gr.addColorStop(0.45, `rgba(180,205,255,${(0.16 * a).toFixed(3)})`);
  gr.addColorStop(1, 'rgba(160,190,255,0)');
  f.fillStyle = gr;
  f.beginPath(); f.arc(px, py, 90 * zf, 0, Math.PI * 2); f.fill();
  // the glow around the channel, then the channel itself
  strokePath(f, pts, 11 * zf, `rgba(150,185,255,${(0.10 * a).toFixed(3)})`);
  strokePath(f, pts, 6 * zf, `rgba(185,210,255,${(0.26 * a).toFixed(3)})`);
  strokePath(f, pts, 2.5 * zf, `rgba(235,244,255,${(0.85 * a).toFixed(3)})`);
  strokePath(f, fork, 5 * zf, `rgba(170,200,255,${(0.18 * a).toFixed(3)})`);
  strokePath(f, fork, 1.5 * zf, `rgba(230,240,255,${(0.6 * a).toFixed(3)})`);
  // the strike point itself
  f.fillStyle = `rgba(255,255,255,${(0.9 * a).toFixed(3)})`;
  f.beginPath(); f.arc(px, py, Math.max(1, 3 * zf), 0, Math.PI * 2); f.fill();
  f.fillRect(px - 16 * zf, py - Math.max(0.5, zf), 32 * zf * a, Math.max(1, zf));
}
function drawRain(f, cell, R, sx0, sy0, sx1, sy1) {
  const t = performance.now() / 1000;
  const cx = cell.x * T, cy = cell.y * T, heavy = cell.kind === 'storm';
  // A shower is a scatter of drops; a thunderstorm is a dense sheet driven
  // sideways, so the two never look like the same weather at two strengths.
  const n = heavy ? 1100 : 220, speed = heavy ? 560 : 330, slant = heavy ? 0.34 : 0.13;
  // Drops are sorted into the three things they can look like while they are
  // placed, so the whole shower is three path fills instead of a colour change
  // and a separate paint command for every single drop.
  const snow = [], splash = [], streak = [];
  for (let k = 0; k < n; k++) {
    const ang = hash(k, 11, cell.id) * Math.PI * 2, rr = Math.sqrt(hash(k, 12, cell.id)) * R;
    const fall = (t * speed + hash(k, 13, cell.id) * 900) % 210;
    const x = cx + Math.cos(ang) * rr + fall * slant, y = cy + Math.sin(ang) * rr + fall * 0.55;
    if (x < sx0 - 3 || x > sx1 + 3 || y < sy0 - 3 || y > sy1 + 3) continue;
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > R * R) continue;
    const px = Math.round(x), py = Math.round(y), phase = fall;
    const tx = Math.floor(x / T), ty = Math.floor(y / T), ti = inb(tx, ty) ? ty * MW + tx : -1;
    if (ti >= 0 && biome[ti] === 4) snow.push(px, py);
    else if (phase > 196 && ti >= 0 && !water[ti]) splash.push(px, py);
    else streak.push(px, py);
  }
  if (snow.length) {
    f.fillStyle = 'rgba(248,252,255,.85)'; f.beginPath();
    for (let j = 0; j < snow.length; j += 2) f.rect(snow[j], snow[j + 1], 1, 1);
    f.fill();
  }
  if (splash.length) {
    // A drop breaks into tiny droplets when it reaches the ground.
    f.fillStyle = 'rgba(205,230,255,.55)'; f.beginPath();
    for (let j = 0; j < splash.length; j += 2) {
      const px = splash[j], py = splash[j + 1];
      f.rect(px - 1, py, 1, 1); f.rect(px, py - 1, 1, 1); f.rect(px + 1, py, 1, 1);
      f.rect(px - 2, py + 1, 1, 1); f.rect(px + 2, py + 1, 1, 1);
    }
    f.fill();
  }
  if (streak.length) {
    const h = heavy ? 3 : 2;
    f.fillStyle = heavy ? 'rgba(178,205,255,.78)' : 'rgba(190,220,255,.5)';
    f.beginPath();
    for (let j = 0; j < streak.length; j += 2) f.rect(streak[j], streak[j + 1], 1, h);
    f.fill();
  }
}
function drawSnow(f, cell, R, sx0, sy0, sx1, sy1) {
  const t = performance.now() / 1000, cx = cell.x * T, cy = cell.y * T;
  const n = cell.kind === 'storm' ? 170 : 120;
  f.fillStyle = 'rgba(248,252,255,.85)';
  f.beginPath();
  for (let k = 0; k < n; k++) {
    const ang = hash(k, 31, cell.id) * Math.PI * 2, rr = Math.sqrt(hash(k, 32, cell.id)) * R;
    const fall = (t * 22 + hash(k, 33, cell.id) * 420) % 210;
    const x = cx + Math.cos(ang) * rr + Math.sin(t * 0.7 + k) * 2, y = cy + Math.sin(ang) * rr + fall * 0.35;
    const dx = x - cx, dy = y - cy;
    if (x >= sx0 && x <= sx1 && y >= sy0 && y <= sy1 && dx * dx + dy * dy <= R * R) f.rect(Math.round(x), Math.round(y), 1, 1);
  }
  f.fill();
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
