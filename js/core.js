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
const tree = new Uint8Array(N);     // 0 none, 1..8 canopy variants
const platform = new Uint8Array(N); // player-built island surface: 1 concrete, 2 steel, 3 dirt
const biome = new Uint8Array(N);    // 0 water, 1 plains, 2 jungle, 3 desert, 4 snow, 5 rock
const oilField = new Float32Array(N);   // 0..1, x5-10 under rock
const gasField = new Float32Array(N);   // 0..1, x5-10 under rock
const resources = {oil: 0, gas: 0, timber: 0, stone: 0, ore: 0, coal: 0, concrete: 0, steel: 0, produce: 0, fish: 0, goods: 0};
const DIFFICULTIES = ['ideal', 'easy', 'normal', 'hard', 'insane'];
const PLACEMENT_POLICIES = ['requireEverything', 'lenientRoads'];
let worldSettings = {difficulty: 'normal', placement: 'requireEverything', taxSales: 0, taxIncome: 0};
const RESOURCE_NAMES = {produce:'Food', fish:'Fish', stone:'Stone', ore:'Ore', timber:'Wood', oil:'Oil', gas:'Gas', coal:'Coal', concrete:'Concrete', steel:'Steel'};
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
const trackOn = new Uint8Array(N);  // surface freight tracks the player has drawn
const track = new Uint8Array(N);    // their connection mask, derived from trackOn on every edit
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
  warehouse:{name:'Warehouse',      cat:'work', w:3,h:2,  homes:0,  cap:8,  jobs:10, storage:3000, desc:'Stores up to 3,000 units of mixed cargo. Trucks, freight trains and ships move goods between warehouses.'},
  dock:     {name:'Dock',           cat:'work', w:3,h:2,  homes:0,  cap:6,  jobs:12, water:true, label:'Waterfront', desc:'Place it on a shore so part of it sits on water. Boats come and go.'},
  farm:     {name:'Crop Farm',      cat:'work', w:4,h:3,  homes:0,  cap:4,  jobs:6,  efficiencyBase:1, label:'Farm', desc:'Fields, a barn and a silo. Few jobs and very little traffic.'},
  orchard:  {name:'Orchard',        cat:'work', w:3,h:3,  homes:0,  cap:3,  jobs:4,  efficiencyBase:0.8, label:'Farm', desc:'Rows of fruit trees.'},
  school:   {name:'School',         cat:'civic',w:3,h:2,  homes:0,  cap:8,  jobs:14, desc:'Teachers drive in every morning.'},
  hospital: {name:'Hospital',       cat:'civic',w:3,h:3,  homes:0,  cap:16, jobs:30, desc:'Lots of staff and a helipad on the roof.'},
  airport:  {name:'Airport',        cat:'civic',w:10,h:5, homes:0,  cap:40, jobs:60, label:'Transport', desc:'Planes take off and land here and fly across the whole region.'},
  park:     {name:'Park',           cat:'ped',  w:2,h:2,  homes:0,  cap:0,  jobs:0,  desc:'Walkable leisure spot. No parking: people walk here.'},
  metro:    {name:'Metro Station',  cat:'ped',  w:1,h:1,  homes:0,  cap:0,  jobs:0,  desc:'Two trains belong to every station and shuttle riders through the tunnels. Each carries 30. People within about 10 tiles of two stations usually ride instead of driving.'},
  busstop:  {name:'Bus Stop',       cat:'ped',  w:1,h:1,  homes:0,  cap:0,  jobs:0,  desc:'Yellow buses pick up riders and carry them to other stops on the streets. One bus replaces up to 12 cars.'},
  parking:  {name:'Parking Lot',    cat:'lot',  w:2,h:2,  homes:0,  cap:12, jobs:0,  desc:'Overflow parking for anything within 8 tiles.'},
  garage:   {name:'Parking Garage', cat:'lot',  w:2,h:2,  homes:0,  cap:30, jobs:0,  desc:'Multi-level overflow parking.'},
  fishery:  {name:'Fishery',        cat:'work', w:2,h:2,  homes:0,  cap:3,  jobs:8,  shore:true, efficiencyBase:1, label:'Coastal', desc:'Boats land their catch here. Must sit on a shoreline.'},
  seafoodMarket:{name:'Seafood Market', cat:'com', w:2,h:2, homes:0, cap:9, jobs:5, shore:true, label:'Coastal', desc:'Sells the local catch. Must sit on a shoreline.'},
  seafoodPlant:{name:'Seafood Plant', cat:'work', w:3,h:2, homes:0, cap:4, jobs:14, shore:true, efficiencyBase:0.8, label:'Coastal', desc:'Processes and packs fish. Must sit on a shoreline.'},
  oilRig:   {name:'Oil Rig',        cat:'work', w:2,h:2,  homes:0,  cap:3,  jobs:10, res:'oil', rig:true, efficiencyBase:1, label:'Resource', desc:'Drills an oil field. Must be within 5 blocks of a train yard; rocky ground yields more.'},
  gasWell:  {name:'Gas Well',       cat:'work', w:2,h:2,  homes:0,  cap:3,  jobs:8,  res:'gas', rig:true, efficiencyBase:1, label:'Resource', desc:'Taps a gas field. Must be within 5 blocks of a train yard; rocky ground yields more.'},
  loggingCamp:{name:'Logging Camp', cat:'work', w:3,h:2,  homes:0,  cap:3,  jobs:9, logging:true, res:'timber', efficiencyBase:1, label:'Resource', desc:'Place in jungle, or near an orchard or greenhouse. Nearby jungle trees are exhaustible; jungle with both orchard and greenhouse sustains an infinite timber supply.'},
  greenhouse:{name:'Greenhouse',     cat:'rural',w:2,h:2,  homes:0,  cap:2,  jobs:5,  efficiencyBase:0.65, label:'Farm', desc:'Grows food and saplings. Slows forest loss caused by nearby logging camps.'},
  quarry:   {name:'Quarry',         cat:'work', w:3,h:2,  homes:0,  cap:3,  jobs:12, rock:true, efficiencyBase:1, label:'Industry', desc:'Cuts stone and ore out of rocky ground. Feeds the higher power plants.'},
  mine:     {name:'Mine',           cat:'work', w:3,h:2,  homes:0,  cap:3,  jobs:14, rock:true, efficiencyBase:1, label:'Industry', desc:'Deep mine for coal and uranium. Feeds the higher power plants.'},
  fireStation:{name:'Fire Station', cat:'civic',w:3,h:2,  homes:0,  cap:6,  jobs:10, station:'fire', label:'Emergency', desc:'Sends fire trucks to fires. Faster response when it is close to what burns.'},
  policeStation:{name:'Police Station',cat:'civic',w:2,h:2, homes:0, cap:6, jobs:12, station:'police', label:'Emergency', desc:'Patrols the streets and cuts down on crashes and arson nearby.'},
  researchLab:{name:'Research Lab', cat:'civic',w:2,h:2,  homes:0,  cap:6,  jobs:20, label:'Industry', desc:'Does the research that higher-tier power plants and industry need.'},
  woodPlant:{name:'Wood Plant',     cat:'work', w:3,h:2,  homes:0,  cap:4,  jobs:12, power:'wood', label:'Power', desc:'Burns wood for electricity. The cheapest plant, and the weakest.'},
  coalPlant:{name:'Coal Plant',     cat:'work', w:3,h:2,  homes:0,  cap:4,  jobs:16, power:'coal', label:'Power', desc:'Steam plant fed by coal. Needs a mine.'},
  gasPlant: {name:'Gas Plant',      cat:'work', w:3,h:2,  homes:0,  cap:4,  jobs:16, power:'gas', label:'Power', desc:'Steam plant fed by gas wells.'},
  hydroPlant:{name:'Hydro Dam',     cat:'work', w:3,h:3,  homes:0,  cap:4,  jobs:12, power:'hydro', shore:true, label:'Power', desc:'Turbines on a shoreline. Needs no fuel.'},
  solarPlant:{name:'Solar Farm',    cat:'work', w:3,h:2,  homes:0,  cap:4,  jobs:8,  power:'solar', label:'Power', desc:'Panels on open plains. Weak but clean.'},
  nuclearPlant:{name:'Nuclear Plant',cat:'civic',w:3,h:3, homes:0,  cap:6,  jobs:40, power:'nuclear', label:'Power', desc:'Enormous output. Needs a mine and several research labs.'},
  port:     {name:'Cargo Port',     cat:'work', w:4,h:3,  homes:0,  cap:6,  jobs:26, shore:true, label:'Logistics', desc:'A deep-water quay. Cargo ships carry goods to other ports and islands, while trucks bring cargo in from your industries.'},
  distribution:{name:'Distribution Terminal', cat:'work', w:3,h:3, homes:0, cap:8, jobs:18, hub:true, label:'Logistics', desc:'Sorts cargo from trucks onto trains and ships. Must be next to a port or freight track, with a street for the trucks.'},
  railyard: {name:'Train Yard',     cat:'work', w:4,h:3,  homes:0,  cap:8,  jobs:22, rail:true, label:'Logistics', desc:'Freight trains load and unload here. It needs a freight track alongside and a street for the trucks. Oil rigs and gas wells have to be within 5 blocks of a yard.'},
  platformConcrete:{name:'Concrete Platform', cat:'world', w:1,h:1, homes:0, cap:0, jobs:0, platform:1, desc:'Raises one water tile into a permanent concrete island tile. Costs 1 stone and 1 concrete.'},
  platformSteel:{name:'Steel Platform', cat:'world', w:1,h:1, homes:0, cap:0, jobs:0, platform:2, desc:'Raises one water tile into a strong steel island tile. Costs 2 stone and 2 steel.'},
  platformDirt:{name:'Dirt Platform', cat:'world', w:1,h:1, homes:0, cap:0, jobs:0, platform:3, desc:'Fills one water tile with earth. Costs 3 stone.'},
  platformConcrete2:{name:'Concrete Platform (2×2)', cat:'world', w:2,h:2, homes:0, cap:0, jobs:0, platform:1, platformCost:4, desc:'Build a compact concrete island patch on 4 water tiles. Costs 4 stone and 4 concrete.'},
  platformSteel2:{name:'Steel Platform (2×2)', cat:'world', w:2,h:2, homes:0, cap:0, jobs:0, platform:2, platformCost:8, desc:'Build a compact steel island patch on 4 water tiles. Costs 8 stone and 8 steel.'},
  platformDirt2:{name:'Dirt Platform (2×2)', cat:'world', w:2,h:2, homes:0, cap:0, jobs:0, platform:3, platformCost:12, desc:'Fill a compact 2×2 water patch with earth. Costs 12 stone.'},
  billboard:{name:'Billboard', cat:'civic', w:2,h:1, homes:0, cap:0, jobs:1, desc:'Advertise a policy. Nearby residents may agree or push back; set the message in its inspector.'},
};
const CATLABEL = {res: 'Residential', com: 'Commercial', work: 'Workplace', civic: 'Civic', lot: 'Parking', ped: 'Walk & transit', world: 'World'};
const hasType = t => typeof t === 'string' && Object.prototype.hasOwnProperty.call(BT, t);

const buildings = new Map();
let nextBid = 1, nextAid = 1, nextCid = 1;
let agents = [], cars = [], peds = [], planes = [], boats = [], metros = [], ships = [], freight = [], agentsDirty = false;
let ports = [], yards = [], hubs = [];
const metroWait = new Map();        // station id -> pedestrians waiting on the platform
const carById = new Map();
let simTime = 0, gameMin = 6.5 * 60, speed = 1;
let destCom = [], destPark = [], destWork = [], stations = [], docks = [], airports = [], busStops = [];
let stats = {trips: [], modes: [], frustrated: 0, stranded: 0, ti: 0, tiAcc: 0, tiN: 0, waitN: 0, hist: [], lastFrustToast: -1e9};
const overlays = {heat: false, mood: true, occ: false, grid: false, sky: true, underground: false,
  districts: true, weather: true, power: false};

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
  wArr.fill(0); tArr.fill(0); biome.fill(0); oilField.fill(0); gasField.fill(0);
  const islandCount = 3 + (seed % 2);              // 3 or 4 islands: a little more land than before
  const cxM = MW * 0.5, cyM = MH * 0.5, rxM = MW * 0.33, ryM = MH * 0.36;
  // the mainland alone first, so islands can be placed in open water
  const mainOnly = new Uint8Array(N);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const coast = (vnoise(x / 18, y / 18, seed + 8) - 0.5) * 0.7;
    mainOnly[y * MW + x] = Math.hypot((x - cxM) / rxM, (y - cyM) / ryM) + coast < 1 ? 0 : 1;
  }
  const isles = [];
  const allWater = (cx, cy, r) => {
    if (cx - r < 0 || cy - r < 0 || cx + r > MW - 1 || cy + r > MH - 1) return false;
    for (const s of isles) if (Math.hypot(cx - s.x, cy - s.y) < r + s.r + 4) return false;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if (!mainOnly[y * MW + x]) return false;
    return true;
  };
  // Search a band of water for a free disc. Deterministic from the seed.
  const placeIsland = (yLo, yHi, k) => {
    for (let r = 32; r >= 20; r -= 2) {
      for (let cy = yLo + r + 4; cy <= yHi - r - 4; cy += 4) {
        for (let cx = r + 4 + ((k * 29) % 11); cx <= MW - r - 4; cx += 6) {
          if (allWater(cx, cy, r + 3)) { isles.push({x: cx, y: cy, r}); return true; }
        }
      }
    }
    return false;
  };
  // Every region gets one island in the north half and one in the south half.
  placeIsland(0, Math.floor(MH * 0.5), 0);
  placeIsland(Math.ceil(MH * 0.5), MH, 1);
  // The rest go wherever open water allows, so the count is always 3 or 4.
  for (let k = 2; k < islandCount; k++) {
    const r = 20 + Math.round(14 * hash(k, 7, seed));
    let spot = null;
    for (let tries = 0; tries < 600 && !spot; tries++) {
      const cx = r + 4 + Math.round(hash(tries, k, seed + 11) * (MW - 2 * r - 8));
      const cy = r + 4 + Math.round(hash(tries, k + 5, seed + 12) * (MH - 2 * r - 8));
      if (allWater(cx, cy, r + 3)) spot = {x: cx, y: cy, r};
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
    // Wide, slow fields: biomes come in large regions and switch far less often.
    const t = y / MH, moist = vnoise(x / 64, y / 64, seed + 5), rock = vnoise(x / 38, y / 38, seed + 6);
    const cold = (1 - t) * 0.95 + (vnoise(x / 74, y / 74, seed + 9) - 0.5) * 0.18;
    let b = 1;
    if (cold > 0.68) b = 4;
    else if (rock > 0.63) b = 5;
    else if (moist > 0.6) b = 2;
    else if (moist < 0.33) b = 3;
    biome[i] = b;
    const dens = b === 2 ? 0.55 : b === 1 ? 0.16 : b === 5 ? 0.06 : 0;
    if (dens && hash(x, y, seed + 3) < dens) tArr[i] = 1 + Math.floor(hash(x, y, seed + 4) * 8);
  }
  // Add deterministic inland ponds and short stream reaches. They only cut a
  // small channel into land, leaving each landmass connected around the water.
  const lakeCount = 4 + (seed % 3);
  for (let lake = 0; lake < lakeCount; lake++) {
    let cx = -1, cy = -1;
    for (let attempt = 0; attempt < 300; attempt++) {
      const x = 50 + Math.floor(hash(attempt, lake, seed + 71) * (MW - 100));
      const y = 50 + Math.floor(hash(attempt, lake + 13, seed + 72) * (MH - 100));
      if (!wArr[y * MW + x]) { cx = x; cy = y; break; }
    }
    if (cx < 0) continue;
    const radius = 4 + Math.floor(hash(cx, cy, seed + 73) * 3);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx, y = cy + dy;
      if (inb(x, y) && dx * dx + dy * dy <= radius * radius) { const i = y * MW + x; wArr[i] = 1; biome[i] = 0; tArr[i] = 0; }
    }
    let sy = cy - 36, sx = cx - 20;
    for (let step = 0; step < 40; step++) {
      const x = sx + step, y = sy + Math.round(Math.sin(step * 0.25 + lake) * 4);
      if (!inb(x, y) || wArr[y * MW + x]) continue;
      const i = y * MW + x; wArr[i] = 1; biome[i] = 0; tArr[i] = 0;
    }
  }
  // Two majority passes remove single-tile specks, so each biome is one broad
  // patch instead of a checkerboard.
  for (let pass = 0; pass < 2; pass++) {
    const src = biome.slice();
    for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x;
      if (wArr[i]) continue;
      const cnt = [0, 0, 0, 0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cnt[src[i + dy * MW + dx]]++;
      let best = 1;
      for (let b = 2; b <= 5; b++) if (cnt[b] > cnt[best]) best = b;
      if (cnt[best] >= 6) biome[i] = best;
    }
  }
  // Trees follow the smoothed map, so jungle trees only grow in the jungle.
  tArr.fill(0);
  for (let i = 0; i < N; i++) {
    if (wArr[i]) continue;
    const b = biome[i], dens = b === 2 ? 0.55 : b === 1 ? 0.16 : b === 5 ? 0.06 : 0;
    if (dens && hash(i % MW, i / MW | 0, seed + 3) < dens) tArr[i] = 1 + Math.floor(hash(i % MW, i / MW | 0, seed + 4) * 8);
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

