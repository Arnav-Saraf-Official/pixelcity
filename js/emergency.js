'use strict';
// =====================================================================
// Weather, accidents, fires and the services that answer them
// =====================================================================
const WEATHER = {
  kind: 'sunny',
  until: 8 * 60,
  lastRoll: -1,
};
const WEATHER_KINDS = {
  sunny:  {name: 'Sunny',       speed: 1,    crash: 1,    fire: 1,   wet: 0, tint: null},
  cloudy: {name: 'Cloudy',      speed: 1,    crash: 1.15, fire: 1,   wet: 0, tint: [125, 135, 150, 0.1]},
  rain:   {name: 'Rainy',       speed: 0.85, crash: 2.2,  fire: 0.6, wet: 1, tint: [60, 105, 165, 0.25]},
  storm:  {name: 'Thunderstorm',speed: 0.7,  crash: 3.2,  fire: 2.4, wet: 2, tint: [16, 26, 52, 0.32]},
  snow:   {name: 'Snow',        speed: 0.9,  crash: 1.25, fire: 0.5, wet: 0, tint: [185, 205, 225, 0.2]},
};
// The weather is a field of 90-tile circles. Each cell drifts slowly around its
// home so the edges are never static, and neighbouring circles overlap: the
// colours and rain fade through each cell's own radial gradient, so there is no
// hard border between one cell and the next.
const WX_R = 90;
const WX_COLS = 4, WX_ROWS = 3;
const weatherCells = [];
let weatherSeeded = false;
function newWeatherCell(bx, by, k) {
  return {id: k, bx, by, x: bx, y: by, tx: bx, ty: by, retarget: 0, kind: 'sunny', until: gameMin + 120};
}
function weatherKindRoll(r) {
  if (r > 0.94) return 'storm';
  if (r > 0.78) return 'rain';
  if (r > 0.7) return 'snow';
  return r > 0.35 ? 'cloudy' : 'sunny';
}
// Ideal is a sandbox: the sky never turns, so nothing outside the player's
// control slows traffic or starts fires.
const idealWeather = () => typeof worldSettings !== 'undefined' && worldSettings.difficulty === 'ideal';
function initWeather() {
  const rng = mulberry((worldSeed ^ 0x51A7) >>> 0);
  weatherCells.length = 0;
  let k = 0;
  for (let gy = 0; gy < WX_ROWS; gy++) for (let gx = 0; gx < WX_COLS; gx++) {
    const bx = (gx + 0.5) * MW / WX_COLS, by = (gy + 0.5) * MH / WX_ROWS;
    const c = newWeatherCell(bx, by, k++);
    c.kind = idealWeather() ? 'sunny' : weatherKindRoll(rng());
    c.until = gameMin + (idealWeather() ? 1e9 : 150 + rng() * 420);
    weatherCells.push(c);
  }
  weatherSeeded = true;
  syncWeatherLabel();
}
const weatherCellAt = (tx, ty) => {
  if (!weatherCells.length) initWeather();
  let best = weatherCells[0], bd = Infinity;
  for (const c of weatherCells) {
    const d = (c.x - tx) * (c.x - tx) + (c.y - ty) * (c.y - ty);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
};
const weatherAt = (tx, ty) => weatherCellAt(tx, ty).kind;
function weatherSnowAt(tx, ty) {
  const cell = weatherCellAt(tx, ty), x = Math.floor(tx), y = Math.floor(ty);
  return cell.kind === 'rain' || cell.kind === 'storm' ? (inb(x, y) && biome[y * MW + x] === 4) : false;
}
function cameraTile() {
  if (typeof cam === 'undefined' || typeof innerWidth === 'undefined') return {x: MW / 2, y: MH / 2};
  return {x: (cam.x + innerWidth / 2 / cam.z) / T, y: (cam.y + innerHeight / 2 / cam.z) / T};
}
const weatherNow = () => WEATHER_KINDS[weatherAt(cameraTile().x, cameraTile().y)] || WEATHER_KINDS.sunny;
const weatherSpeed = () => weatherNow().speed;
const weatherSpeedAt = (tx, ty) => (WEATHER_KINDS[weatherAt(tx, ty)] || WEATHER_KINDS.sunny).speed;
function syncWeatherLabel() {
  const p = cameraTile(), c = weatherCellAt(p.x, p.y);
  WEATHER.kind = c.kind;
  WEATHER.until = c.until;
}
function rollWeather(cell) {
  const c = cell || weatherCellAt(cameraTile().x, cameraTile().y);
  c.kind = idealWeather() ? 'sunny' : weatherKindRoll(Math.random());
  c.until = gameMin + (idealWeather() ? 1e9 : 180 + Math.random() * 360);   // 3-9 game hours
  syncWeatherLabel();
}
function weatherTick() {
  if (!weatherCells.length) initWeather();
  for (const c of weatherCells) if (gameMin >= c.until) {
    c.kind = idealWeather() ? 'sunny' : weatherKindRoll(Math.random());
    c.until = gameMin + (idealWeather() ? 1e9 : 180 + Math.random() * 360);
  }
  syncWeatherLabel();
}
// A very small wander: each cell picks a new nearby target every couple of game
// minutes and eases toward it, so a storm slowly drifts across a district.
function stepWeather(dt) {
  if (!weatherCells.length) initWeather();
  for (const c of weatherCells) {
    if (gameMin >= c.retarget) {
      c.retarget = gameMin + 90 + Math.random() * 150;
      c.tx = clamp(c.bx + (Math.random() - 0.5) * 34, 20, MW - 20);
      c.ty = clamp(c.by + (Math.random() - 0.5) * 34, 20, MH - 20);
    }
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    if (d > 0.05) { const m = Math.min(d, 0.16 * dt); c.x += dx / d * m; c.y += dy / d * m; }
  }
}

// ---------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------
const incidents = [];
let units = [];
let nextIncident = 1;

function unitKindFor(kind) { return kind === 'fire' ? 'firetruck' : 'ambulance'; }
function stationKindFor(kind) { return kind === 'fire' ? 'fireStation' : 'hospital'; }

// Each hospital parks four ambulances; each fire station two trucks.
function syncUnits() {
  const want = new Map();
  for (const b of buildings.values()) {
    if (b.type === 'hospital') want.set(b.id, {n: 4, kind: 'ambulance'});
    else if (b.type === 'fireStation') want.set(b.id, {n: 2, kind: 'firetruck'});
  }
  units = units.filter(u => want.has(u.home));
  for (const [home, spec] of want) {
    const have = units.filter(u => u.home === home).length;
    for (let k = have; k < spec.n; k++) {
      const b = B(home);
      if (!b) break;
      units.push({id: nextIncident++, kind: spec.kind, home, x: b.cx, y: b.cy,
        state: 'idle', path: null, i: 0, target: 0, timer: 0});
    }
  }
}

function unitTile(u) {
  const b = B(u.home);
  if (!b) return -1;
  if (b.road >= 0) return b.road;
  const per = perimeter(b.x, b.y, b.w, b.h);
  return per.find(i => isRoad(i)) ?? -1;
}
function nearestRoadTile(x, y) {
  const tx = Math.round(x), ty = Math.round(y);
  let best = -1, bd = Infinity;
  for (let r = 0; r <= 12 && best < 0; r++) {
    for (let yy = ty - r; yy <= ty + r; yy++) for (let xx = tx - r; xx <= tx + r; xx++) {
      if (!inb(xx, yy)) continue;
      const i = yy * MW + xx;
      if (!isRoad(i)) continue;
      const d = Math.abs(xx - tx) + Math.abs(yy - ty);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}
function dispatch(inc) {
  const kind = unitKindFor(inc.kind);
  let best = null, bd = Infinity;
  for (const u of units) {
    if (u.state !== 'idle' || u.kind !== kind) continue;
    const d = Math.hypot(u.x - inc.x, u.y - inc.y);
    if (d < bd) { bd = d; best = u; }
  }
  if (!best) return false;
  const from = unitTile(best), to = nearestRoadTile(inc.x, inc.y);
  if (from < 0 || to < 0) return false;
  const path = from === to ? [from] : findPath(from, to, 'car');
  if (!path) return false;
  best.state = 'enroute';
  best.path = path; best.i = 0;
  best.target = inc.id;
  best.from = from;
  inc.unit = best.id;
  inc.state = 'dispatched';
  return true;
}

function raiseIncident(kind, x, y, buildingId) {
  const inc = {id: nextIncident++, kind, x, y, b: buildingId || 0, age: 0, state: 'open', unit: 0, progress: 0};
  incidents.push(inc);
  dispatch(inc);
  return inc;
}

// A crash between moving cars: money for the tow, a trip to hospital for the hurt.
function policeCount() {
  let n = 0;
  for (const b of buildings.values()) if (b.type === 'policeStation') n++;
  return n;
}
let crashProgress = 0, crashDay = -1, crashesToday = 0;
function crashChance() {
  // Patrols take the edge off bad weather; difficulty sets a daily target baseline.
  const daily = {ideal: 0, easy: 0.2, normal: 0.65, hard: 1.4, insane: 3}[worldSettings.difficulty] ?? 0.65;
  return daily * weatherNow().crash * Math.max(0.35, 1 - policeCount() * 0.06) / 1440;
}
function maybeCrash() {
  if (worldSettings.difficulty === 'ideal') { crashProgress = 0; crashesToday = 0; return; }
  const day = Math.floor(gameMin / 1440);
  if (day !== crashDay) { crashDay = day; crashesToday = 0; }
  if (cars.length < 4) return;
  // Accumulate the baseline; Insane also enforces three daily incidents whenever there is traffic.
  crashProgress += crashChance() * Math.min(1, cars.length / 8);
  const elapsed = gameMin - day * 1440;
  if (worldSettings.difficulty === 'insane' && crashesToday < 3 && elapsed >= (crashesToday + 1) * 480) crashProgress = Math.max(crashProgress, 1);
  if (crashProgress < 1) return;
  const eligible = cars.filter(c => {
    if (!c || c.dead) return false;
    const i = tileAt(c.x, c.y);
    return i >= 0 && isRoad(i);
  });
  if (!eligible.length) return;
  crashProgress -= 1; crashesToday++;
  const c = eligible[(Math.random() * eligible.length) | 0];
  c.dead = true;
  raiseIncident('crash', c.x / T, c.y / T);   // incidents live in tile space
  stats.crashes = (stats.crashes || 0) + 1;
}

function maybeFire(hourly) {
  const risk = 0.00004 * weatherNow().fire;
  for (const b of buildings.values()) {
    if (water[b.y * MW + b.x]) continue;
    if (BT[b.type].cat === 'lot') continue;
    if (Math.random() < risk * hourly) { raiseIncident('fire', b.cx, b.cy, b.id); break; }
  }
}

function stepIncidents(dt) {
  // units drive, work, then go home
  for (const u of units) {
    if (u.state === 'idle') continue;
    if (u.state === 'enroute' || u.state === 'returning') {
      const p = u.path;
      if (!p || p.length < 2) { u.state = u.state === 'enroute' ? 'onscene' : 'idle'; u.timer = 0; continue; }
      const speed = (u.kind === 'firetruck' ? 30 : 34);
      u.i += speed * dt / T;
      const k = Math.min(p.length - 1, Math.floor(u.i));
      const a = p[k], b = p[Math.min(p.length - 1, k + 1)];
      const ax = a % MW, ay = a / MW | 0, bx = b % MW, by = b / MW | 0;
      const t = Math.min(1, u.i - k);
      u.x = ax + (bx - ax) * t + 0.5;
      u.y = ay + (by - ay) * t + 0.5;
      if (u.i >= p.length - 1) {
        if (u.state === 'enroute') { u.state = 'onscene'; u.timer = 0; }
        else { u.state = 'idle'; u.path = null; }
      }
      continue;
    }
    if (u.state === 'onscene') {
      const inc = incidents.find(i => i.id === u.target && i.state !== 'done');
      if (!inc) { u.state = 'returning'; u.path = u.from != null ? findPath(nearestRoadTile(u.x, u.y), u.from, 'car') : null; u.i = 0; continue; }
      inc.progress += dt;
      const need = inc.kind === 'fire' ? 6 : 5;
      if (inc.progress >= need) resolveIncident(inc, u);
    }
  }
  for (const inc of incidents) {
    if (inc.state === 'done') continue;
    inc.age += dt;
    if (inc.state === 'open' && !inc.unit) dispatch(inc);
    // nobody could come: a tow truck clears the wreck after a while
    if (inc.state === 'open' && inc.age > 300) { inc.state = 'done'; stats.crashesCleared = (stats.crashesCleared || 0) + 1; }
    if (inc.kind === 'fire' && inc.age > 240) burnDown(inc);
  }
  for (let k = incidents.length - 1; k >= 0; k--) {
    if (incidents[k].state === 'done') incidents.splice(k, 1);
  }
}
function resolveIncident(inc, u) {
  inc.state = 'done';
  u.state = 'returning';
  u.path = u.from != null ? findPath(nearestRoadTile(u.x, u.y), u.from, 'car') : null;
  u.i = 0;
  if (inc.kind === 'fire') stats.firesOut = (stats.firesOut || 0) + 1;
  else stats.crashesCleared = (stats.crashesCleared || 0) + 1;
}
function burnDown(inc) {
  inc.state = 'done';
  const b = B(inc.b);
  if (b) {
    for (const a of agents) if (a.home === b.id) a.mood = Math.max(0, a.mood - 0.3);
    removeBuilding(b);
    markDirty(inc.x - 6, inc.y - 6, inc.x + 6, inc.y + 6);
    stats.burned = (stats.burned || 0) + 1;
    toast('A building burned down.');
  }
}
