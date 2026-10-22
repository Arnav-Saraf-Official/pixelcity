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
const oneway = new Uint8Array(N);   // 0 two-way, 1 N, 2 E, 3 S, 4 W
const walkway = new Uint8Array(N);  // street has sidewalks
const deg = new Uint8Array(N);
const cmask = new Uint8Array(N);    // which neighbors a road tile connects to
const autoOw = new Uint8Array(N);   // direction of a carriageway in a two-lane highway
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
  metro:    {name:'Metro Station',  cat:'ped',  w:1,h:1,  homes:0,  cap:0,  jobs:0,  desc:'Fast trains underground. People within about 10 tiles of two stations usually ride instead of driving.'},
  busstop:  {name:'Bus Stop',       cat:'ped',  w:1,h:1,  homes:0,  cap:0,  jobs:0,  desc:'Yellow buses pick up riders and carry them to other stops on the streets. One bus replaces up to 12 cars.'},
  parking:  {name:'Parking Lot',    cat:'lot',  w:2,h:2,  homes:0,  cap:12, jobs:0,  desc:'Overflow parking for anything within 8 tiles.'},
  garage:   {name:'Parking Garage', cat:'lot',  w:2,h:2,  homes:0,  cap:30, jobs:0,  desc:'Multi-level overflow parking.'},
};
const CATLABEL = {res: 'Residential', com: 'Commercial', work: 'Workplace', civic: 'Civic', lot: 'Parking', ped: 'Walk & transit'};
const hasType = t => typeof t === 'string' && Object.prototype.hasOwnProperty.call(BT, t);

const buildings = new Map();
let nextBid = 1, nextAid = 1, nextCid = 1;
let agents = [], cars = [], peds = [], planes = [], boats = [], agentsDirty = false;
const carById = new Map();
let simTime = 0, gameMin = 6.5 * 60, speed = 1;
let destCom = [], destPark = [], destWork = [], stations = [], docks = [], airports = [], busStops = [];
let stats = {trips: [], modes: [], frustrated: 0, stranded: 0, ti: 0, tiAcc: 0, tiN: 0, waitN: 0, hist: [], lastFrustToast: -1e9};
const overlays = {heat: false, mood: true, occ: false, grid: false};

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
function genTerrainInto(seed, wArr, tArr) {
  wArr.fill(0); tArr.fill(0);
  const ph = (seed % 100) / 10;
  // a river winds north to south through the middle column of districts
  for (let y = 0; y < MH; y++) {
    const cx = DW * 1.605 + 10 * Math.sin(y / 19 + ph) + 3 * Math.sin(y / 4.7 + ph * 2), half = 1.7 + 0.8 * Math.sin(y / 7 + ph);
    for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(MW - 1, Math.ceil(cx + half)); x++) if (Math.abs(x - cx) <= half) wArr[y * MW + x] = 1;
  }
  // a lake in the south
  const lx = DW * 1.43, ly = DH * 2.5, lr = 15;
  for (let y = Math.floor(ly - lr * 1.6); y <= ly + lr * 1.6; y++) for (let x = Math.floor(lx - lr * 2.2); x <= lx + lr * 2.2; x++) {
    if (!inb(x, y)) continue;
    if (Math.hypot((x - lx) / 1.35, y - ly) < lr * (0.75 + 0.5 * vnoise(x / 6, y / 6, seed + 9))) wArr[y * MW + x] = 1;
  }
  for (let i = 0; i < N; i++) {
    if (wArr[i]) continue;
    const x = i % MW, y = i / MW | 0;
    const v = vnoise(x / 7, y / 7, seed);
    if ((v > 0.66 && hash(x, y, seed + 1) < 0.75) || hash(x, y, seed + 2) < 0.02) tArr[i] = 1 + Math.floor(hash(x, y, seed + 3) * 4);
  }
}
