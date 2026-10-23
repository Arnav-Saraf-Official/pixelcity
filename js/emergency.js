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
  sunny:  {name: 'Sunny',       speed: 1,    crash: 1,    fire: 1,   wet: 0},
  cloudy: {name: 'Cloudy',      speed: 1,    crash: 1.15, fire: 1,   wet: 0},
  rain:   {name: 'Rainy',       speed: 0.85, crash: 2.2,  fire: 0.6, wet: 1},
  storm:  {name: 'Thunderstorm',speed: 0.7,  crash: 3.2,  fire: 2.4, wet: 2},
};
const weatherNow = () => WEATHER_KINDS[WEATHER.kind] || WEATHER_KINDS.sunny;
const weatherSpeed = () => weatherNow().speed;

function rollWeather() {
  const r = Math.random();
  let kind = 'sunny';
  if (r > 0.92) kind = 'storm';
  else if (r > 0.62) kind = 'rain';
  else if (r > 0.28) kind = 'cloudy';
  WEATHER.kind = kind;
  WEATHER.until = gameMin + (180 + Math.random() * 360);   // 3-9 game hours
  if (typeof weatherChip === 'function') weatherChip();
}
function weatherTick() {
  if (gameMin >= WEATHER.until) rollWeather();
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
function crashChance() {
  // patrols take the edge off bad weather
  return 0.00035 * weatherNow().crash * Math.max(0.35, 1 - policeCount() * 0.06);
}
function maybeCrash() {
  if (cars.length < 4) return;
  if (Math.random() > crashChance() * Math.min(40, cars.length)) return;
  const c = cars[(Math.random() * cars.length) | 0];
  if (!c || c.dead) return;
  const t = tileAt(c.x, c.y);
  if (t < 0 || !isRoad(t)) return;
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
