// =====================================================================
// Art: thin bindings from game state to the .texture families.
//
// Every sprite that is not terrain lives in textures/*.texture and is
// compiled into js/textures.generated.js. This file only decides which
// texture to sample and what parameters to pass, so the art itself stays
// editable without touching code.
// =====================================================================

// The dash period of lane markings is 6 tiles; textures receive the
// tile's phase so dashes line up across tile borders.
const phase6 = v => ((v % 6) + 6) % 6;

// Actors are painted hundreds of times a frame, always with the same handful of
// colours. Their sprites are collected here by a pre-built key, so drawing one is
// a map read and a blit, with no cache-key string to assemble each time.
const spriteCache = new Map();
function sprite(file, name, params, key) {
  const k = file + '|' + name + '|' + key;
  let cv = spriteCache.get(k);
  if (!cv) {
    cv = TEX.render(file, name, params, key).canvas;
    spriteCache.set(k, cv);
    if (spriteCache.size > 512) spriteCache.delete(spriteCache.keys().next().value);
  }
  return cv;
}

// ---------------------------------------------------------------------
// Roads, paths, plazas
// ---------------------------------------------------------------------
// A street tile has so many combinations (mask, lanes, markings, phase, edges)
// that it stays in the general texture cache; it only hands over its key, so the
// engine never has to stringify the parameters to look it up.
function drawRoadTile(c, x0, y0, m, hw, br, ow, sw, ml, ed) {
  const hwv = hw ? 1 : 0, swv = sw ? 1 : 0, px = phase6(x0), py = phase6(y0);
  TEX.draw(c, 'roads', br ? 'bridge' : 'road', x0, y0,
    { m, hw: hwv, ow, sw: swv, ml, px, py, ed: ed || null },
    m + ',' + hwv + ',' + ow + ',' + swv + ',' + ml + ',' + px + ',' + py + ',' + (ed ? ed[0] + '.' + ed[1] : '-'));
}

function drawDeck(c, x0, y0, hw) {
  const hwv = hw ? 1 : 0, px = phase6(x0);
  c.drawImage(sprite('roads', 'deck', { hw: hwv, px }, hwv + ':' + px), x0, y0);
}

function drawPathTile(c, x0, y0, m, br) {
  const b = br ? 1 : 0;
  c.drawImage(sprite('roads', 'path', { m, br: b }, m + ':' + b), x0, y0);
}

function drawPlazaTile(c, x0, y0, i) {
  const par = ((x0 + y0) % 4 + 4) % 4, deco = hash(i, 3, 9) < 0.14 ? 1 : 0;
  c.drawImage(sprite('roads', 'plaza', { par, deco }, par + ':' + deco), x0, y0);
}

// ---------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------
// Species live in the texture's own conditions: v picks pine, oak, cedar, the
// desert cacti or a boulder, so a new plant is a texture edit, not a code change.
function drawTree(c, x0, y0, v) {
  c.drawImage(sprite('trees', 'tree', { v }, String(v)), x0, y0);
}
function drawPlatform(c, x0, y0, type) {
  const colors = type === 1 ? ['#8f9297', '#b9bcc0'] : type === 2 ? ['#535b65', '#aab2bc'] : ['#70583b', '#9a7b50'];
  c.fillStyle = colors[0]; c.fillRect(x0, y0, T, T);
  for (let k = 0; k < T; k += 3) { c.fillStyle = colors[(k / 3) & 1]; c.fillRect(x0 + k, y0 + k % 2, 2, 2); }
  c.fillStyle = type === 1 ? '#d6d9db' : type === 2 ? '#d4a849' : '#b09061';
  c.fillRect(x0, y0, T, 1); c.fillRect(x0, y0, 1, T);
}

// ---------------------------------------------------------------------
// Buildings
//
// The texture records parcel marks (window pixels, parking slots, the
// status light, dock berths, queue points) while it paints. They come
// back in local texture coordinates, so they are offset here.
// ---------------------------------------------------------------------
function wetMask(type, wet) {
  const d = BT[type];
  let k = '';
  for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) k += wet(tx, ty) ? '1' : '0';
  return k;
}

// Every building type has its own texture in buildings.texture; this table is
// only for any future kind that has to borrow art until its sprite is drawn.
const BUILDING_TEX = {billboard: 'school'};   // placeholder art until its own sprite is drawn
const buildingTex = type => BUILDING_TEX[type] || type;

function drawBuilding(c, type, ox, oy, seed, wet) {
  const t = TEX.render('buildings', buildingTex(type), { seed, wet: wet || null },
    seed + '|' + (wet ? wetMask(type, wet) : '-'));
  if (c !== NULLC) c.drawImage(t.canvas, ox, oy);
  const m = t.marks;
  const art = {
    win: m.win.map(p => [p[0] + ox, p[1] + oy]),
    park: m.park.map(p => [p[0] + ox, p[1] + oy, p[2]]),
    stat: m.stat ? [m.stat[0] + ox, m.stat[1] + oy] : null,
    berth: m.berth,
    order: []
  };
  if (m.spots.length) art.spots = m.spots.map(p => [p[0] + ox, p[1] + oy]);
  art.order = shuffle(art.win.map((_, k) => k), mulberry(seed ^ 0x55));
  return art;
}

const wetFor = b => (tx, ty) => water[(b.y + ty) * MW + b.x + tx] === 1;

// ---------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------
function drawCarSprite(c, x, y, horiz, col) {
  c.drawImage(sprite('vehicles', horiz ? 'car_h' : 'car_v', { color: col }, col), x, y);
}

function drawBus(c, x, y, horiz) {
  c.drawImage(sprite('vehicles', horiz ? 'bus_h' : 'bus_v', {}, ''), x, y);
}

const BOAT_AT = { 1: ['boat_n', 1, 2], 2: ['boat_e', 5, 1], 3: ['boat_s', 1, 5], 4: ['boat_w', 2, 1] };
function drawBoat(c, b) {
  if (isRoad(tileAt(b.x, b.y))) return; // passing under a bridge
  const [tex, ax, ay] = BOAT_AT[b.d];
  c.drawImage(sprite('vehicles', tex, { color: b.color }, b.color), Math.round(b.x) - ax, Math.round(b.y) - ay);
}

const SHIP_AT = {1: ['ship_n', 2, 6], 2: ['ship_e', 6, 2], 3: ['ship_s', 2, 6], 4: ['ship_w', 6, 2]};
function drawShip(c, s) {
  const [tex, ax, ay] = SHIP_AT[s.d] || SHIP_AT[2];
  c.drawImage(sprite('vehicles', tex, { color: s.color }, s.color), Math.round(s.x) - ax, Math.round(s.y) - ay);
}

function drawTruck(c, x, y, horiz, col) {
  c.drawImage(sprite('vehicles', horiz ? 'truck_h' : 'truck_v', { color: col }, col), x, y);
}

// Emergency units turn like the traffic: a truck heading north uses the upright
// sprite, so it never points the wrong way down a street. They also keep to the
// same right-hand lane as the cars, instead of straddling the centre line.
function drawEmergencyUnit(c, u) {
  const d = u.d || 2, hz = d === 2 || d === 4;
  const name = (u.kind === 'firetruck' ? 'firetruck' : 'ambulance') + (hz ? '_h' : '_v');
  c.drawImage(sprite('vehicles', name, {}, ''),
    Math.round(u.x * T + OX[d] - (hz ? 3.5 : 1.5)), Math.round(u.y * T + OY[d] - (hz ? 1.5 : 3.5)));
}

// A crossing gate: a post on the kerb and an arm that lies along the track when
// it is down. It is drawn live rather than baked into the chunk, because it
// moves with every train.
function drawCrossingGate(c, x0, y0, horiz, closed) {
  const blink = (performance.now() / 320 | 0) % 2;
  // A post on each kerb, and one barrier per approach so the arm lies across
  // the street beside the rails instead of painted over them.
  c.fillStyle = '#24282e'; c.fillRect(x0, y0, 2, 2); c.fillRect(x0 + 7, y0, 2, 2);
  if (closed) {
    for (const k of [1, 7]) {
      c.fillStyle = '#f4f5f7'; c.fillRect(x0 + (horiz ? 0 : k), y0 + (horiz ? k : 0), horiz ? 9 : 1, horiz ? 1 : 9);
      c.fillStyle = '#e5484d';
      for (let j = 0; j < 9; j += 2) c.fillRect(x0 + (horiz ? j : k), y0 + (horiz ? k : j), 1, 1);
    }
    c.fillStyle = blink ? '#ff4848' : '#8f2020'; c.fillRect(x0 + 7, y0 + 1, 2, 2);
  } else {
    c.fillStyle = '#f4f5f7';
    if (horiz) { c.fillRect(x0, y0 + 1, 1, 2); c.fillRect(x0 + 8, y0 + 1, 1, 2); }
    else { c.fillRect(x0 + 1, y0, 2, 1); c.fillRect(x0 + 1, y0 + 8, 2, 1); }
    c.fillStyle = '#43b95b'; c.fillRect(x0 + 7, y0 + 1, 1, 1);
  }
}

// A fire on a building: three painted frames flicker in turn.
function drawFire(c, x, y, frame) {
  const fr = frame % 3;
  c.drawImage(sprite('vehicles', 'fire', { f: fr }, fr), x - 4, y - 8);
}

// A street shut by a crash: a striped barrier across the carriageway, laid
// across the road's own axis so it blocks the lane instead of running along it.
function drawStreetClosure(c, x0, y0, acrossEastWest) {
  const v = acrossEastWest ? 0 : 1;
  c.drawImage(sprite('roads', 'closure', { v }, v), x0, y0);
}

// A crash site: scorched ground, the burnt hull lying on it, and a plume of
// smoke that keeps climbing for the first minute or so after the fall.
function drawWreck(c, w, t) {
  const px = Math.round(w.x * T) - 6, py = Math.round(w.y * T) - 6;
  c.drawImage(sprite('vehicles', 'scorch', {}, ''), px, py);
  c.drawImage(sprite('vehicles', 'wreck', { v: w.v }, w.v), px, py);
  const age = t - w.t;
  if (age > 75) return;             // the fire is out, the hull just sits there
  for (let k = 0; k < 4; k++) {
    const rise = (age / 2.4 + k / 4) % 1;
    const a = 0.7 * (1 - rise) * (1 - rise);
    if (a < 0.04) continue;
    const prev = c.globalAlpha;
    c.globalAlpha = prev * a;
    // the puffs drift as they climb, so the plume bends instead of stacking
    const sx = Math.round(w.x * T - 4 + Math.sin(rise * 3.4 + k * 1.7 + w.x) * 6);
    const sy = Math.round(w.y * T - 5 - rise * 20 + k);
    const fr = Math.min(2, Math.floor(rise * 3));
    c.drawImage(sprite('vehicles', 'wreck_smoke', { f: fr }, fr), sx, sy);
    c.globalAlpha = prev;
  }
}

// The plane art is painted nose-west and turned in 45 degree steps, while the
// simulation measures heading from east, so the design index is offset by half
// a turn. Without it every aircraft flies backwards.
const planeHeading = p => (((Math.round(p.ang / (Math.PI / 4)) + 4) % 8) + 8) % 8;

// The shadow a plane throws on the ground, offset from the aircraft and fainter
// the higher it climbs. It takes the same heading as the aircraft, so it reads
// as the same silhouette and not a second, differently-pointed plane.
function drawPlaneShadow(c, p, alpha) {
  const prev = c.globalAlpha, h = planeHeading(p);
  c.globalAlpha = prev * alpha;
  c.drawImage(sprite('vehicles', 'plane_shadow', { h }, String(h)), Math.round(p.x) - 4, Math.round(p.y) - 4);
  c.globalAlpha = prev;
}

function drawFreightCar(c, x, y, horiz, kind) {
  const col = kind === 'passenger' ? '#4d96ff' : kind === 'liquid' ? '#b8c4cc' : kind === 'gas' ? '#e8a23a' : '#9a6b45';
  c.drawImage(sprite('vehicles', horiz ? 'wagon_h' : 'wagon_v', { kind, color: col }, kind + col), x, y);
}

function drawPlane(c, p, night) {
  const h = planeHeading(p);
  const blink = (performance.now() / 500 | 0) % 2;
  const nv = night ? 1 : 0;
  c.drawImage(sprite('vehicles', 'plane', { h, night: nv, blink }, h + ':' + nv + ':' + blink),
    Math.round(p.x - p.alt * 0.5) - 4, Math.round(p.y - p.alt) - 4);
}

// ---------------------------------------------------------------------
// Underground
//
// Nothing down here is scenery: rails, junction pads and reversing blocks
// are schematic traces, and the station pad is the only thing that reads as
// a place rather than a wire.
// ---------------------------------------------------------------------
function drawRailTile(c, x0, y0, m, kind) {
  c.drawImage(sprite('underground', kind, { m }, m), x0, y0);
}

// Surface freight track. Over water it gets a timber bridge deck first; over
// a street the ballast sits on the asphalt as a level crossing.
function drawTrackTile(c, x0, y0, m, wet) {
  if (wet) {
    c.fillStyle = '#8b6a43'; c.fillRect(x0, y0, T, T);
    c.fillStyle = '#6e5233'; c.fillRect(x0, y0, T, 1); c.fillRect(x0, y0 + T - 1, T, 1);
  }
  c.drawImage(sprite('rails', 'track', { m }, m), x0, y0);
}

// Block signal at the edge a train crosses into the next block: a small post
// with a lamp that is red while another train holds the leg.
function drawTrackSignal(c, x0, y0, dir, red) {
  const px = dir === 2 ? x0 + T - 2 : x0 + 2;
  const py = dir === 2 ? y0 + 2 : y0 + T - 3;
  c.fillStyle = '#24282e'; c.fillRect(px, py, 2, 3);
  c.fillStyle = red ? '#e5484d' : '#43b95b'; c.fillRect(px, py, 2, 2);
  c.fillStyle = red ? '#ffc0c0' : '#d8ffe0'; c.fillRect(px, py, 1, 1);
}

function drawStationPad(c, x0, y0) {
  c.drawImage(sprite('underground', 'station', {}, ''), x0, y0);
}

function drawMetro(c, x, y, horiz) {
  c.drawImage(sprite('underground', horiz ? 'train_h' : 'train_v', {}, ''), x, y);
}

// A pedestrian is a head over a tinted body, drawn one pixel up from the feet.
function drawPed(c, x, y, color) {
  c.drawImage(sprite('people', 'ped', { color }, color), x, y - 1);
}

function drawFace(c, x, y, kind) {
  c.drawImage(sprite('people', 'face', { kind }, kind), x, y);
}
