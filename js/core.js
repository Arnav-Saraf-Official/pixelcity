'use strict';
// =====================================================================
// World: one connected region of 3×3 districts, simulated all at once
// =====================================================================
const T = 9;                               // art pixels per tile
const DW = 200, DH = 150, RW = 3, RH = 3;  // district size and region grid
const MW = DW * RW, MH = DH * RH, N = MW * MH;
const FW = MW * T, FH = MH * T;
const MIN_PER_SEC = 2.5;                   // game minutes per sim second
const YEL = 2;                             // yellow light seconds
const SAVE_KEY = 'pixelCity.v5';
const LEGACY_SAVE_KEY = 'pixelTrafficCity.v5';
const DISTRICTS = ['North-West', 'North', 'North-East', 'West', 'Downtown', 'East', 'South-West', 'South', 'South-East'];

const tile = new Uint8Array(N);     // 0 grass, 1 street, 2 highway, 3 footpath, 4 plaza
const water = new Uint8Array(N);
const tree = new Uint8Array(N);     // 0 none, 1..4 variant
const biome = new Uint8Array(N);    // 0 water, 1 plains, 2 jungle, 3 desert, 4 snow, 5 rock
const oilField = new Float32Array(N);   // 0..1, x5-10 under rock
const gasField = new Float32Array(N);   // 0..1, x5-10 under rock
const resources = {oil: 0, gas: 0, timber: 0, stone: 0};
// Electricity scaffolding: plants, requirements and a grid that is measured but
// deliberately not wired up yet. Nothing in the simulation draws from it.
const power = {plants: [], capacity: 0, demand: 0, served: 0, enabled: false};
const POWER_REQ = {
  woodPlant:   {quarry: 0, mine: 0, labs: 0, gas: 0, out: 60},
  coalPlant:   {quarry: 0, mine: 1, labs: 1, gas: 0, out: 180},
  gasPlant:    {quarry: 0, mine: 0, labs: 1, gas: 1, out: 220},
  hydroPlant:  {quarry: 1, mine: 0, labs: 2, gas: 0, out: 300},
  solarPlant:  {quarry: 2, mine: 0, labs: 3, gas: 0, out: 240},
  nuclearPlant:{quarry: 2, mine: 2, labs: 5, gas: 0, out: 1200},
};
// Hand-drawn districts. The layer stores a district id per tile; the map holds
// the name and colour, and (later) whatever policies a district carries.
const districtLayer = new Int32Array(N);
const districts = new Map();
let nextDid = 1;
const DISTRICT_COLORS = ['#e05c5c', '#5c9ae0', '#5ce08a', '#e0c95c', '#a95ce0', '#5ce0d8', '#e08a5c', '#8ae05c', '#e05cb0', '#7f8ce0'];
const districtAt = i => (districtLayer[i] ? districts.get(districtLayer[i]) || null : null);
function newDistrict(name) {
  const id = nextDid++;
  const d = {id, name: name || 'District ' + (districts.size + 1), color: DISTRICT_COLORS[(id - 1) % DISTRICT_COLORS.length], policy: {}};
  districts.set(id, d);
  return d;
}
const oneway = new Uint8Array(N);   // 0 two-way, 1 N, 2 E, 3 S, 4 W
const walkway = new Uint8Array(N);  // street has sidewalks
const deg = new Uint8Array(N);
const cmask = new Uint8Array(N);    // which neighbors a road tile connects to
const autoOw = new Uint8Array(N);   // direction of a carriageway in a two-lane highway
const railOn = new Uint8Array(N);   // underground metro rails the player has drawn
const rail = new Uint8Array(N);     // their connection mask, derived from railOn on every edit
const overpass = new Uint8Array(N); // grade-separated 4-way crossing
const freeflow = new Uint8Array(N); // junction joining only highways (merges, splits, ramps): cars zipper through
const bldAt = new Int32Array(N);
const heat = new Float32Array(N), heatAcc = new Float32Array(N);
const resv = new Int32Array(N);
const areaHeat = new Float32Array(N), areaPres = new Float32Array(N);
const lights = new Map();           // tile -> {ns, ew, off}
let connections = [], overpassList = [];
let worldSeed = 12345;
let regionView = false, regionHover = -1, regionLayout = null;

const DX = [0, 0, 1, 0, -1], DY = [0, -1, 0, 1, 0], OPP = [0, 3, 4, 1, 2];
const OX = [0, 1.5, 0, -1.5, 0], OY = [0, 0, 1.5, 0, -1.5]; // right-hand lane offsets
const DIRNAME = ['', 'North', 'East', 'South', 'West'];
const bit = d => 1 << (d - 1);

const BT = {
  house:    {name:'House',          cat:'res',  w:1,h:1,  homes:2,  cap:2,  jobs:0,  desc:'A cozy home with a driveway.'},
  apartment:{name:'Apartments',     cat:'res',  w:2,h:2,  homes:10, cap:10, jobs:0,  desc:'Mid-rise block with its own lot.'},
  tower:    {name:'High-Rise',      cat:'res',  w:3,h:3,  homes:28, cap:28, jobs:0,  desc:'Dense housing. Lots of cars at rush hour.'},
  farmhouse:{name:'Farmhouse',      cat:'res',  w:1,h:1,  homes:3,  cap:3,  jobs:0,  label:'Rural home', desc:'A country home with a vegetable patch.'},
  shop:     {name:'Corner Shop',    cat:'com',  w:1,h:1,  homes:0,  cap:3,  jobs:2,  desc:'Small shop. Great walking destination.'},
  market:   {name:'Supermarket',    cat:'com',  w:2,h:2,  homes:0,  cap:10, jobs:8,  desc:'Draws shoppers from the neighborhood.'},
  mall:     {name:'Mall',           cat:'com',  w:3,h:3,  homes:0,  cap:22, jobs:24, desc:'Huge traffic magnet. Plan roads around it.'},
  office:   {name:'Office',         cat:'work', w:2,h:2,  homes:0,  cap:12, jobs:16, desc:'More workers than parking spaces.'},
  hq:       {name:'Skyscraper',     cat:'work', w:3,h:3,  homes:0,  cap:24, jobs:48, desc:'Tons of jobs, very little parking. Needs transit.'},
  factory:  {name:'Factory',        cat:'work', w:3,h:2,  homes:0,  cap:14, jobs:20, desc:'Industrial jobs with a loading yard.'},
  warehouse:{name:'Warehouse',      cat:'work', w:3,h:2,  homes:0,  cap:8,  jobs:10, desc:'Logistics jobs with loading bays.'},
  dock:     {name:'Dock',           cat:'work', w:3,h:2,  homes:0,  cap:6,  jobs:12, water:true, label:'Waterfront', desc:'Place it on a shore so part of it sits on water. Boats come and go.'},
  farm:     {name:'Crop Farm',      cat:'work', w:4,h:3,  homes:0,  cap:4,  jobs:6,  label:'Farm', desc:'Fields, a barn and a silo. Few jobs and very little traffic.'},
  orchard:  {name:'Orchard',        cat:'work', w:3,h:3,  homes:0,  cap:3,  jobs:4,  label:'Farm', desc:'Rows of fruit trees.'},
  school:   {name:'School',         cat:'civic',w:3,h:2,  homes:0,  cap:8,  jobs:14, desc:'Teachers drive in every morning.'},
  hospital: {name:'Hospital',       cat:'civic',w:3,h:3,  homes:0,  cap:16, jobs:30, desc:'Lots of staff and a helipad on the roof.'},
  airport:  {name:'Airport',        cat:'civic',w:10,h:5, homes:0,  cap:40, jobs:60, label:'Transport', desc:'Planes take off and land here and fly across the whole region.'},
  park:     {name:'Park',           cat:'ped',  w:2,h:2,  homes:0,  cap:0,  jobs:0,  desc:'Walkable leisure spot. No parking: people walk here.'},
  metro:    {name:'Metro Station',  cat:'ped',  w:1,h:1,  homes:0,  cap:0,  jobs:0,  desc:'Two trains belong to every station and shuttle riders through the tunnels. Each carries 30. People within about 10 tiles of two stations usually ride instead of driving.'},
  busstop:  {name:'Bus Stop',       cat:'ped',  w:1,h:1,  homes:0,  cap:0,  jobs:0,  desc:'Yellow buses pick up riders and carry them to other stops on the streets. One bus replaces up to 12 cars.'},
  parking:  {name:'Parking Lot',    cat:'lot',  w:2,h:2,  homes:0,  cap:12, jobs:0,  desc:'Overflow parking for anything within 8 tiles.'},
  garage:   {name:'Parking Garage', cat:'lot',  w:2,h:2,  homes:0,  cap:30, jobs:0,  desc:'Multi-level overflow parking.'},
  fishery:  {name:'Fishery',        cat:'work', w:2,h:2,  homes:0,  cap:3,  jobs:8,  shore:true, label:'Coastal', desc:'Boats land their catch here. Must sit on a shoreline.'},
  seafoodMarket:{name:'Seafood Market', cat:'com', w:2,h:2, homes:0, cap:9, jobs:5, shore:true, label:'Coastal', desc:'Sells the local catch. Must sit on a shoreline.'},
  seafoodPlant:{name:'Seafood Plant', cat:'work', w:3,h:2, homes:0, cap:4, jobs:14, shore:true, label:'Coastal', desc:'Processes and packs fish. Must sit on a shoreline.'},
  oilRig:   {name:'Oil Rig',        cat:'work', w:2,h:2,  homes:0,  cap:3,  jobs:10, res:'oil', label:'Resource', desc:'Drills an oil field. Goes anywhere, but rocky ground holds 5-10x more oil.'},
  gasWell:  {name:'Gas Well',       cat:'work', w:2,h:2,  homes:0,  cap:3,  jobs:8,  res:'gas', label:'Resource', desc:'Taps a gas field. Goes anywhere, but rocky ground holds 5-10x more gas.'},
  loggingCamp:{name:'Logging Camp', cat:'work', w:3,h:2,  homes:0,  cap:3,  jobs:9,  jungle:true, res:'timber', label:'Resource', desc:'Fells trees in the jungle. Its cut slowly thins the forest unless a greenhouse is near.'},
  greenhouse:{name:'Greenhouse',     cat:'rural',w:2,h:2,  homes:0,  cap:2,  jobs:5,  label:'Farm', desc:'Grows saplings. Slows the forest loss caused by logging camps nearby.'},
  quarry:   {name:'Quarry',         cat:'work', w:3,h:2,  homes:0,  cap:3,  jobs:12, rock:true, label:'Industry', desc:'Cuts stone and ore out of rocky ground. Feeds the higher power plants.'},
  mine:     {name:'Mine',           cat:'work', w:3,h:2,  homes:0,  cap:3,  jobs:14, rock:true, label:'Industry', desc:'Deep mine for coal and uranium. Feeds the higher power plants.'},
  fireStation:{name:'Fire Station', cat:'civic',w:3,h:2,  homes:0,  cap:6,  jobs:10, station:'fire', label:'Emergency', desc:'Sends fire trucks to fires. Faster response when it is close to what burns.'},
  policeStation:{name:'Police Station',cat:'civic',w:2,h:2, homes:0, cap:6, jobs:12, station:'police', label:'Emergency', desc:'Patrols the streets and cuts down on crashes and arson nearby.'},
  researchLab:{name:'Research Lab', cat:'civic',w:2,h:2,  homes:0,  cap:6,  jobs:20, label:'Industry', desc:'Does the research that higher-tier power plants and industry need.'},
  woodPlant:{name:'Wood Plant',     cat:'work', w:3,h:2,  homes:0,  cap:4,  jobs:12, power:'wood', label:'Power', desc:'Burns wood for electricity. The cheapest plant, and the weakest.'},
  coalPlant:{name:'Coal Plant',     cat:'work', w:3,h:2,  homes:0,  cap:4,  jobs:16, power:'coal', label:'Power', desc:'Steam plant fed by coal. Needs a mine.'},
  gasPlant: {name:'Gas Plant',      cat:'work', w:3,h:2,  homes:0,  cap:4,  jobs:16, power:'gas', label:'Power', desc:'Steam plant fed by gas wells.'},
  hydroPlant:{name:'Hydro Dam',     cat:'work', w:3,h:3,  homes:0,  cap:4,  jobs:12, power:'hydro', shore:true, label:'Power', desc:'Turbines on a shoreline. Needs no fuel.'},
  solarPlant:{name:'Solar Farm',    cat:'work', w:3,h:2,  homes:0,  cap:4,  jobs:8,  power:'solar', label:'Power', desc:'Panels on open plains. Weak but clean.'},
  nuclearPlant:{name:'Nuclear Plant',cat:'civic',w:3,h:3, homes:0,  cap:6,  jobs:40, power:'nuclear', label:'Power', desc:'Enormous output. Needs a mine and several research labs.'},
};
const CATLABEL = {res: 'Residential', com: 'Commercial', work: 'Workplace', civic: 'Civic', lot: 'Parking', ped: 'Walk & transit'};
const hasType = t => typeof t === 'string' && Object.prototype.hasOwnProperty.call(BT, t);

const buildings = new Map();
let nextBid = 1, nextAid = 1, nextCid = 1;
let agents = [], cars = [], peds = [], planes = [], boats = [], metros = [], agentsDirty = false;
const metroWait = new Map();        // station id -> pedestrians waiting on the platform
const carById = new Map();
let simTime = 0, gameMin = 6.5 * 60, speed = 1;
let destCom = [], destPark = [], destWork = [], stations = [], docks = [], airports = [], busStops = [];
let stats = {trips: [], modes: [], frustrated: 0, stranded: 0, ti: 0, tiAcc: 0, tiN: 0, waitN: 0, hist: [], lastFrustToast: -1e9};
const overlays = {heat: false, mood: true, occ: false, grid: false, sky: true, underground: false,
  districts: true, weather: true, power: false};   // weather and power are reserved: their layers are not built yet

const B = id => buildings.get(id);
const inb = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
const isRoad = i => tile[i] === 1 || tile[i] === 2;
const bits = m => (m & 1) + (m >> 1 & 1) + (m >> 2 & 1) + (m >> 3 & 1);
function nb(i, d) { const x = i % MW + DX[d], y = (i / MW | 0) + DY[d]; return inb(x, y) ? y * MW + x : -1; }
function dirOf(a, b) { const d = b - a; return d === -MW ? 1 : d === 1 ? 2 : d === MW ? 3 : d === -1 ? 4 : 0; }
const roadMask = i => cmask[i];
const eow = i => oneway[i] || autoOw[i];
function isWalk(i) {
  const t = tile[i]; if (t === 3 || t === 4 || (t === 1 && walkway[i])) return true;
  const b = bldAt[i]; if (b) { const ty = B(b).type; return ty === 'park' || ty === 'metro'; }
  return false;
}
function walkMask(i) { let m = 0; for (let d = 1; d <= 4; d++) { const j = nb(i, d); if (j >= 0 && isWalk(j)) m |= bit(d); } return m; }
const tileAt = (x, y) => ((y / T) | 0) * MW + ((x / T) | 0);
const districtOf = (tx, ty) => clamp(Math.floor(ty / DH), 0, RH - 1) * RW + clamp(Math.floor(tx / DW), 0, RW - 1);

// =====================================================================
// Random helpers
// =====================================================================
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function pick(arr, r) { return arr[Math.floor(r * arr.length) % arr.length]; }
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function shade(hex, a) { const n = parseInt(hex.slice(1), 16); const cl = v => Math.max(0, Math.min(255, v)); const r = cl((n >> 16) + a), g = cl((n >> 8 & 255) + a), b = cl((n & 255) + a); return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1); }
function gauss() { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
const CARC = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#ff7eb6', '#c0392b', '#95a5a6', '#2d2d2d'];
const SHIRT = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#f3f3f3', '#c77dff', '#ff9f45'];

// =====================================================================
// Canvases
// =====================================================================
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const cv = document.getElementById('view'), ctx = cv.getContext('2d');
const frameCv = mk(16, 16), fctx = frameCv.getContext('2d');
const NULLC = {fillStyle: '', fillRect() {}};  // lets building art be measured without drawing it

// =====================================================================
// Terrain generation (deterministic from the seed, in region coordinates)
// =====================================================================
// Land is a mainland plus 2-4 islands, with a noisy coastline. Biomes come from
// latitude (snow grows toward the north), moisture and a rock field.
function genTerrainInto(seed, wArr, tArr) {
  wArr.fill(0); tArr.fill(0); biome.fill(0);
  const islandCount = 2 + (seed % 3);
  const cxM = MW * 0.5, cyM = MH * 0.5, rxM = MW * 0.33, ryM = MH * 0.36;
  // the mainland alone first, so islands can be placed in open water
  const mainOnly = new Uint8Array(N);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const coast = (vnoise(x / 18, y / 18, seed + 8) - 0.5) * 0.7;
    mainOnly[y * MW + x] = Math.hypot((x - cxM) / rxM, (y - cyM) / ryM) + coast < 1 ? 0 : 1;
  }
  const allWater = (cx, cy, r) => {
    if (cx - r < 0 || cy - r < 0 || cx + r > MW - 1 || cy + r > MH - 1) return false;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if (!mainOnly[y * MW + x]) return false;
    return true;
  };
  const isles = [];
  for (let k = 0; k < islandCount; k++) {
    const r = 28 + 12 * hash(k, 3, seed), base = (k / islandCount) * Math.PI * 2 + 0.6 * hash(k, 1, seed);
    let spot = null;
    for (let d = 0; d <= 0.8 && !spot; d += 0.05) {
      for (const a of [0, 0.35, -0.35, 0.7, -0.7]) {
        const ang = base + a, reach = (1 + d) * (rxM + r + 14);
        const cx = Math.round(cxM + Math.cos(ang) * reach), cy = Math.round(cyM + Math.sin(ang) * reach);
        if (allWater(cx, cy, r + 4)) { spot = {x: cx, y: cy, r}; break; }
      }
    }
    if (spot) isles.push(spot);
  }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    const coast = (vnoise(x / 18, y / 18, seed + 8) - 0.5) * 0.7;
    const dm = Math.hypot((x - cxM) / rxM, (y - cyM) / ryM) + coast;
    let land = dm < 1;
    for (const s of isles) {
      if (land) break;
      const d = Math.hypot(x - s.x, y - s.y) / s.r;
      if (d < 0.62 || d + coast * 0.45 < 1) land = true;   // solid core: an island never splits
    }
    if (!land) { wArr[i] = 1; continue; }
    const t = y / MH, moist = vnoise(x / 25, y / 25, seed + 5), rock = vnoise(x / 12, y / 12, seed + 6);
    const cold = (1 - t) * 0.95 + (vnoise(x / 30, y / 30, seed + 9) - 0.5) * 0.18;
    let b = 1;
    if (cold > 0.66) b = 4;
    else if (rock > 0.64) b = 5;
    else if (moist > 0.58) b = 2;
    else if (moist < 0.3) b = 3;
    biome[i] = b;
    const dens = b === 2 ? 0.55 : b === 1 ? 0.16 : b === 5 ? 0.06 : 0;
    if (dens && hash(x, y, seed + 3) < dens) tArr[i] = 1 + Math.floor(hash(x, y, seed + 4) * 4);
  }
  // Resource fields: perlin-ish noise, far richer under rock.
  for (let i = 0; i < N; i++) {
    if (wArr[i]) continue;
    const x = i % MW, y = i / MW | 0;
    const rock = biome[i] === 5 ? 5 + 5 * hash(x, y, seed + 31) : 1;
    oilField[i] = Math.min(10, vnoise(x / 22, y / 22, seed + 21) * rock);
    gasField[i] = Math.min(10, vnoise(x / 26, y / 26, seed + 22) * rock);
  }
  // Coastal noise can leave specks offshore. Keep the mainland and the planned
  // islands, and sink anything else, so the count is always 1 + 2..4 landmasses.
  const label = new Uint8Array(N), st = new Int32Array(N), comps = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (wArr[s0] || label[s0]) continue;
    let qh = 0, qt = 0, sx = 0, sy = 0; st[qt++] = s0; label[s0] = 1;
    while (qh < qt) {
      const u = st[qh++], ux = u % MW, uy = u / MW | 0; sx += ux; sy += uy;
      for (let d = 1; d <= 4; d++) { const v = nb(u, d); if (v >= 0 && !wArr[v] && !label[v]) { label[v] = 1; st[qt++] = v; } }
    }
    comps.push({tile: s0, size: qt, cx: sx / qt, cy: sy / qt, keep: false});
  }
  let biggest = comps[0];
  for (const c of comps) if (c.size > biggest.size) biggest = c;
  biggest.keep = true;
  // one component per planned island: the nearest one to its centre
  for (const s of isles) {
    let best = null, bd = Infinity;
    for (const c of comps) {
      if (c.keep) continue;
      const d = Math.hypot(c.cx - s.x, c.cy - s.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && bd < s.r * 2.5) best.keep = true;
  }
  for (const c of comps) {
    if (c.keep) continue;
    let qh = 0, qt = 0; st[qt++] = c.tile; wArr[c.tile] = 1; biome[c.tile] = 0; tArr[c.tile] = 0;
    while (qh < qt) {
      const u = st[qh++];
      for (let d = 1; d <= 4; d++) {
        const v = nb(u, d);
        if (v >= 0 && !wArr[v]) { wArr[v] = 1; biome[v] = 0; tArr[v] = 0; st[qt++] = v; }
      }
    }
  }
}

