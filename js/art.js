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

// ---------------------------------------------------------------------
// Roads, paths, plazas
// ---------------------------------------------------------------------
function drawRoadTile(c, x0, y0, m, hw, br, ow, sw, ml, ed) {
  TEX.draw(c, 'roads', br ? 'bridge' : 'road', x0, y0, {
    m,
    hw: hw ? 1 : 0,
    ow,
    sw: sw ? 1 : 0,
    ml,
    px: phase6(x0),
    py: phase6(y0),
    ed: ed || null
  });
}

function drawDeck(c, x0, y0, hw) {
  TEX.draw(c, 'roads', 'deck', x0, y0, { hw: hw ? 1 : 0, px: phase6(x0) });
}

function drawPathTile(c, x0, y0, m, br) {
  TEX.draw(c, 'roads', 'path', x0, y0, { m, br: br ? 1 : 0 });
}

function drawPlazaTile(c, x0, y0, i) {
  TEX.draw(c, 'roads', 'plaza', x0, y0, {
    par: ((x0 + y0) % 4 + 4) % 4,
    deco: hash(i, 3, 9) < 0.14 ? 1 : 0
  });
}

// ---------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------
function drawTree(c, x0, y0, v) {
  TEX.draw(c, 'trees', 'tree', x0, y0, { v });
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

// New building kinds borrow the nearest existing texture of the same footprint
// until they get their own art. Seeds still give each one its own palette.
const BUILDING_TEX = {
  fishery: 'office', seafoodMarket: 'market', seafoodPlant: 'warehouse',
  oilRig: 'office', gasWell: 'garage', loggingCamp: 'factory', greenhouse: 'orchard',
  fireStation: 'school', policeStation: 'market', researchLab: 'office',
  powerPlant: 'factory', woodPlant: 'factory', coalPlant: 'factory', gasPlant: 'factory',
  hydroPlant: 'warehouse', solarPlant: 'garage', nuclearPlant: 'hq', quarry: 'warehouse', mine: 'factory',
};
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
  TEX.draw(c, 'vehicles', horiz ? 'car_h' : 'car_v', x, y, { color: col });
}

function drawBus(c, x, y, horiz) {
  TEX.draw(c, 'vehicles', horiz ? 'bus_h' : 'bus_v', x, y, {});
}

const BOAT_AT = { 1: ['boat_n', 1, 2], 2: ['boat_e', 5, 1], 3: ['boat_s', 1, 5], 4: ['boat_w', 2, 1] };
function drawBoat(c, b) {
  if (isRoad(tileAt(b.x, b.y))) return; // passing under a bridge
  const [tex, ax, ay] = BOAT_AT[b.d];
  TEX.draw(c, 'vehicles', tex, Math.round(b.x) - ax, Math.round(b.y) - ay, { color: b.color });
}

function drawPlane(c, p, night) {
  const h = ((Math.round(p.ang / (Math.PI / 4)) % 8) + 8) % 8;
  const gx = Math.round(p.x), gy = Math.round(p.y);
  if (p.alt > 0.5) TEX.draw(c, 'vehicles', 'plane_shadow', gx - 4, gy - 4, { h });
  const blink = (performance.now() / 500 | 0) % 2;
  TEX.draw(c, 'vehicles', 'plane',
    Math.round(p.x - p.alt * 0.5) - 4, Math.round(p.y - p.alt) - 4,
    { h, night: night ? 1 : 0, blink });
}

// ---------------------------------------------------------------------
// Underground
//
// Nothing down here is scenery: rails, junction pads and reversing blocks
// are schematic traces, and the station pad is the only thing that reads as
// a place rather than a wire.
// ---------------------------------------------------------------------
function drawRailTile(c, x0, y0, m, kind) {
  TEX.draw(c, 'underground', kind, x0, y0, { m });
}

function drawStationPad(c, x0, y0) {
  TEX.draw(c, 'underground', 'station', x0, y0, {});
}

function drawMetro(c, x, y, horiz) {
  TEX.draw(c, 'underground', horiz ? 'train_h' : 'train_v', x, y, {});
}

// A pedestrian is a head over a tinted body, drawn one pixel up from the feet.
function drawPed(c, x, y, color) {
  TEX.draw(c, 'people', 'ped', x, y - 1, { color });
}

function drawFace(c, x, y, kind) {
  TEX.draw(c, 'people', 'face', x, y, { kind });
}
