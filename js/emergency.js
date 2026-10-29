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
  storm:  {name: 'Thunderstorm',speed: 0.68, crash: 3.4,  fire: 2.6, wet: 2, tint: [10, 16, 38, 0.34]},
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
// The sky mostly drifts one step at a time along this chain, so a clear spell
// clouds over before it rains and a shower can build into a thunderstorm. The
// rest of the roll jumps anywhere, so nothing settles into a pattern.
const WX_CHAIN = ['sunny', 'cloudy', 'rain', 'storm'];
function weatherKindRoll(r, prev) {
  if (r < 0.05) return 'snow';
  const i = prev ? WX_CHAIN.indexOf(prev) : -1;
  if (i >= 0 && r < 0.45) {
    // a spell mostly drifts one step, and builds up far more often than it
    // breaks, so rain can turn into a thunderstorm but rarely the reverse
    if (r < 0.24) return WX_CHAIN[Math.max(0, i - 1)];
    return WX_CHAIN[i + (r < 0.282 ? 1 : 0)] || WX_CHAIN[i];
  }
  const t = (r - 0.45) / 0.5;
  return t > 0.95 ? 'storm' : t > 0.72 ? 'rain' : t > 0.30 ? 'cloudy' : 'sunny';
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
    c.until = gameMin + (idealWeather() ? 1e9 : 75 + rng() * 300);
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
// The storm a player can see is the disc painted around a cell's centre, so a
// flight is only inside one when it is inside that disc.
function stormAt(tx, ty) {
  if (!weatherCells.length) initWeather();
  for (const c of weatherCells) {
    if (c.kind !== 'storm') continue;
    if (Math.hypot(c.x - tx, c.y - ty) < WX_R * 0.92) return true;
  }
  return false;
}
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
  c.kind = idealWeather() ? 'sunny' : weatherKindRoll(Math.random(), c.kind);
  c.until = gameMin + (idealWeather() ? 1e9 : 75 + Math.random() * 300);   // 1-6 game hours
  syncWeatherLabel();
}
function weatherTick() {
  if (!weatherCells.length) initWeather();
  for (const c of weatherCells) {
    if (gameMin >= c.until) {
      c.kind = idealWeather() ? 'sunny' : weatherKindRoll(Math.random(), c.kind);
      c.until = gameMin + (idealWeather() ? 1e9 : 75 + Math.random() * 300);
    } else if (!idealWeather() && Math.random() < 0.003) {
      // the sky can also just turn, so a long spell never feels scripted
      rollWeather(c);
    }
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
// Wreck sites that outlive the incident: the scorched patch and the hull stay
// on the ground long after the smoke has stopped, until the city clears them.
const wrecks = [];
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
      units.push({id: nextIncident++, kind: spec.kind, home, x: b.cx, y: b.cy, d: 2,
        state: 'idle', path: null, i: 0, target: 0, timer: 0, blocked: 0});
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
function nearestRoadTile(x, y, within = 12) {
  const tx = Math.round(x), ty = Math.round(y);
  let best = -1, bd = Infinity;
  for (let r = 0; r <= within && best < 0; r++) {
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
  const from = unitTile(best), to = nearestRoadTile(inc.x, inc.y, inc.roadMax || 12);
  if (from < 0 || to < 0) return false;
  const path = from === to ? [from] : findPath(from, to, 'car', Infinity, true);
  if (!path) return false;
  best.state = 'enroute';
  best.path = path; best.i = 0;
  best.target = inc.id;
  best.from = from;
  inc.unit = best.id;
  inc.state = 'dispatched';
  return true;
}

function raiseIncident(kind, x, y, buildingId, extra) {
  const inc = {id: nextIncident++, kind, x, y, b: buildingId || 0, age: 0, started: gameMin, state: 'open', unit: 0, progress: 0};
  if (extra) Object.assign(inc, extra);
  incidents.push(inc);
  stats.lastSite = {x: Math.round(x), y: Math.round(y)};
  if (kind === 'fire') {
    evacuate(B(buildingId));
    notifyFireAlert();
  } else if (kind === 'crash') {
    toastAction('Traffic crash reported.', 'Show location', () => showSite(Math.round(x), Math.round(y)), 'alert');
  }
  dispatch(inc);   // after `extra`, so a wreck's short reach is already known
  return inc;
}

// ---------------------------------------------------------------------
// Street closures
// ---------------------------------------------------------------------
const CLOSE_SECONDS = 240;
// Shut the street tiles around a crash so traffic has to go around it. Cars
// already routed through them are re-planned at once; crews answering the call
// are not blocked (their paths ignore closures).
function closeStreetAround(x, y, seconds = CLOSE_SECONDS) {
  const tx = Math.round(x), ty = Math.round(y), near = [];
  for (let yy = ty - 3; yy <= ty + 3; yy++) for (let xx = tx - 3; xx <= tx + 3; xx++) {
    if (!inb(xx, yy)) continue;
    const i = yy * MW + xx;
    if (!isRoad(i) || overpass[i]) continue;
    near.push({i, d: Math.abs(xx - tx) + Math.abs(yy - ty)});
  }
  near.sort((a, b) => a.d - b.d);
  const until = simTime + seconds;
  let n = 0;
  for (const f of near.slice(0, 4)) {
    roadClosed[f.i] = until;
    streetClosures.set(f.i, until);
    n++;
  }
  if (n) { validateMovers(); markDirty(tx - 3, ty - 3, tx + 3, ty + 3); }
  return n;
}
function pruneClosures() {
  for (const [i, until] of streetClosures) {
    if (until > simTime) continue;
    streetClosures.delete(i);
    roadClosed[i] = 0;
  }
}

// ---------------------------------------------------------------------
// Aircraft lost in a storm
//
// A flight that flies into a thunderstorm can be brought down. The odds are
// per storm entered and climb with the difficulty, so a sandbox never loses an
// aircraft: a slight risk on Easy, a real one on Insane.
// ---------------------------------------------------------------------
const PLANE_CRASH = {ideal: 0, easy: 0.004, normal: 0.015, hard: 0.035, insane: 0.07};
const planeCrashChance = () => PLANE_CRASH[worldSettings.difficulty] ?? 0.015;
// A wreck is only attended if a street runs close enough for the crews to get to it.
const CRASH_ROAD_RANGE = 8;

const WRECK_VARIANTS = 4;
// Anyone at the impact site is lost. Pedestrians standing in the blast radius
// and people inside a building under the wreck are counted, so the city record
// can show real casualties instead of a decorative zero.
function planeCasualties(tx, ty) {
  const R = 3;
  let dead = 0;
  for (const p of peds) {
    if (p.dead) continue;
    if (Math.abs(Math.round(p.x / T) - tx) <= R && Math.abs(Math.round(p.y / T) - ty) <= R) { p.dead = true; dead++; }
  }
  for (const a of agents) {
    if (a.dead || a.state !== 'idle' || !a.loc) continue;
    const b = B(a.loc);
    if (!b || Math.abs(b.cx - tx) > R || Math.abs(b.cy - ty) > R) continue;
    killAgent(a); dead++;
  }
  if (dead) {
    agents = agents.filter(a => !a.dead);
    peds = peds.filter(p => !p.dead);
    recount();
  }
  stats.planeDeaths = (stats.planeDeaths || 0) + dead;
  return dead;
}
function planeCrash(x, y) {
  stats.planeCrashes = (stats.planeCrashes || 0) + 1;
  const tx = Math.round(x), ty = Math.round(y);
  stats.lastSite = {x: tx, y: ty};
  if (!inb(tx, ty) || water[ty * MW + tx]) {   // down in the water: nothing to fight
    toast('A flight went down in the water.', 'alert');
    return;
  }
  wrecks.push({x: tx, y: ty, v: (Math.random() * WRECK_VARIANTS) | 0, t: simTime, until: gameMin + 720});
  const lost = planeCasualties(tx, ty);
  const shut = closeStreetAround(tx, ty);
  toastAction(`A flight went down in the storm in ${DISTRICTS[districtOf(tx, ty)]}.` +
    (lost ? ` ${lost} ${lost === 1 ? 'person was' : 'people were'} lost.` : '') +
    (shut ? ' The street around the wreck is closed.' : ''), 'Take me there', () => showSite(tx, ty));
  // the wreck burns and there are casualties, so a truck and an ambulance come
  const site = {roadMax: CRASH_ROAD_RANGE, wreck: true};
  raiseIncident('fire', tx, ty, 0, site);
  raiseIncident('crash', tx, ty, 0, site);
  markDirty(tx - 8, ty - 8, tx + 8, ty + 8);
}

// The nearest tile a pedestrian can actually stand on, outside a footprint.
function nearestWalkTile(x, y) {
  const tx = Math.round(x), ty = Math.round(y);
  let best = -1, bd = Infinity;
  for (let r = 0; r <= 14 && best < 0; r++) {
    for (let yy = ty - r; yy <= ty + r; yy++) for (let xx = tx - r; xx <= tx + r; xx++) {
      if (!inb(xx, yy)) continue;
      const i = yy * MW + xx;
      if (!isWalk(i)) continue;
      const d = Math.abs(xx - tx) + Math.abs(yy - ty);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}

// Anywhere to run to when the place they were standing is the one on fire.
function nearestShelter(b) {
  let best = null, bd = Infinity;
  for (const o of buildings.values()) {
    if (o.id === b.id || o.walk < 0) continue;
    const d = distB(o, b);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// A walkable tile roughly `want` tiles from `from`, so somebody leaving a
// burning building has room to run instead of standing in the doorway.
function fleeTile(from, want) {
  const fx = from % MW, fy = from / MW | 0;
  const near = [];
  for (let r = 3; r <= want + 6; r++) {
    for (let y = fy - r; y <= fy + r; y++) for (let x = fx - r; x <= fx + r; x++) {
      if (!inb(x, y)) continue;
      const d = Math.abs(x - fx) + Math.abs(y - fy);
      if (d < 3 || d > want + 6) continue;
      const i = y * MW + x;
      if (!isWalk(i)) continue;
      near.push({i, cost: Math.abs(d - want)});
    }
  }
  near.sort((a, b) => a.cost - b.cost);
  for (const c of near.slice(0, 24)) {
    const p = findPath(from, c.i, 'walk', 24);
    if (p && p.length > 1) return {tile: c.i, path: p};
  }
  return null;
}

// Everybody inside a burning building gets out on foot: through the door, a few
// tiles clear of the smoke, then on to wherever they sleep tonight. The car
// stays parked where it was, so the street fills with abandoned cars while they
// run.
function evacuate(b) {
  if (!b) return;
  const inside = agents.filter(a => !a.dead && a.state === 'idle' && a.loc === b.id);
  if (!inside.length) return;
  const from = nearestWalkTile(b.cx, b.cy);
  if (from < 0) return;
  stats.evacuated = (stats.evacuated || 0) + inside.length;
  const shelter = nearestShelter(b);
  for (const a of inside) {
    if (a.car) { a.car.dead = true; releaseAll(a.car); carById.delete(a.car.id); a.car = null; }
    if (a.ped) { a.ped.dead = true; a.ped = null; }
    const H = B(a.home);
    const dest = H && H.id !== b.id && H.walk >= 0 ? H : shelter;
    const legs = [];
    const run = fleeTile(from, 7);
    if (run) legs.push({path: run.path});
    const start = run ? run.tile : from;
    if (dest && dest.walk >= 0) {
      const p = findPath(start, dest.walk, 'walk', 90);
      if (p && p.length > 1) legs.push({path: p});
    }
    if (!legs.length) {
      const p = findPath(from, dest && dest.walk >= 0 ? dest.walk : from, 'walk', 90);
      if (p && p.length > 1) legs.push({path: p});
    }
    depart(a, b, 'walk');
    if (!legs.length) { a.state = 'idle'; a.loc = 0; continue; }   // out, but nowhere to go
    spawnPed(a, legs, dest ? dest.id : 0, 'walk');
  }
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

// Is there something in the road just ahead of a unit? Crews queue in traffic
// rather than driving through it, though after a few seconds they edge forward
// so a jam can never trap an ambulance for good. The lateral test is tight
// enough to ignore the opposite lane: a unit and a car in separate lanes are
// only a few pixels apart at this scale.
function unitBlocked(u) {
  const hx = DX[u.d || 2], hy = DY[u.d || 2];
  const fx = u.x * T + hx * 5, fy = u.y * T + hy * 5;
  const arr = bucket.get(tileAt(fx, fy));
  if (!arr) return false;
  for (const o of arr) {
    if (o.unit) continue;
    const vx = o.x - fx, vy = o.y - fy;
    if (vx * hx + vy * hy > -1 && Math.abs(vx * hy - vy * hx) < 2.6 &&
        Math.abs(o.x - u.x * T) + Math.abs(o.y - u.y * T) < 6) return true;
  }
  return false;
}

// Back at the station the crew parks inside the building, out of sight.
function parkUnit(u) {
  u.state = 'idle'; u.path = null; u.blocked = 0; u.from = null; u.target = 0; u.timer = 0;
  const h = B(u.home);
  if (h) { u.x = h.cx; u.y = h.cy; }
}

function stepIncidents(dt) {
  // units drive, work, then go home
  for (const u of units) {
    if (u.state === 'idle') continue;
    if (u.state === 'enroute' || u.state === 'returning') {
      const p = u.path;
      if (!p || p.length < 2) {
        if (u.state === 'enroute') { u.state = 'onscene'; u.timer = 0; }
        else parkUnit(u);
        continue;
      }
      const speed = (u.kind === 'firetruck' ? 30 : 34);
      // the segment the unit is on also gives it a facing for the sprite
      const k0 = Math.min(p.length - 1, Math.floor(u.i));
      const facing = dirOf(p[k0], p[Math.min(p.length - 1, k0 + 1)]);
      if (facing) u.d = facing;
      if (unitBlocked(u)) u.blocked = (u.blocked || 0) + dt; else u.blocked = 0;
      if (!u.blocked || u.blocked > 4) u.i += speed * dt / T;
      // Keep the engine in the same right-hand lane as ordinary traffic, so it
      // queues behind cars instead of straddling the centre line between both
      // lanes. laneGeom works in pixels; units store tile coordinates.
      const k = Math.min(p.length - 2, Math.floor(u.i));
      const t = clamp(u.i - k, 0, 1);
      const g = {x: 0, y: 0, d: facing || u.d || 2};
      laneGeom(g, p, k, t, 1, 0);
      u.x = (g.x - 4.5) / T;
      u.y = (g.y - 4.5) / T;
      u.d = g.d || facing || u.d || 2;
      if (u.i >= p.length - 1) {
        if (u.state === 'enroute') { u.state = 'onscene'; u.timer = 0; }
        else parkUnit(u);   // home again, out of sight inside the station
      }
      continue;
    }
    if (u.state === 'onscene') {
      const inc = incidents.find(i => i.id === u.target && i.state !== 'done');
      if (!inc) { u.state = 'returning'; u.path = u.from != null ? findPath(nearestRoadTile(u.x, u.y), u.from, 'car', Infinity, true) : null; u.i = 0; continue; }
      inc.progress += dt;
      const need = inc.kind === 'fire' ? 6 : 5;
      if (inc.progress >= need) resolveIncident(inc, u);
    }
  }
  for (const inc of incidents) {
    if (inc.state === 'done') continue;
    inc.age += dt;
    if (inc.state === 'open' && !inc.unit) dispatch(inc);
    // nobody could come: a tow truck clears the wreck after a while, and a fire
    // with no station burns itself out once it has had its time to do damage
    if (inc.state === 'open' && inc.age > (inc.kind === 'fire' ? FIRE_GIVEUP_SEC : 300)) {
      inc.state = 'done';
      if (inc.kind === 'crash') stats.crashesCleared = (stats.crashesCleared || 0) + 1;
    }
    if (inc.kind === 'fire' && inc.state !== 'done') {
      const minute = Math.floor(gameMin);
      if (inc.lastRainCheck !== minute) {
        inc.lastRainCheck = minute;
        const weather = weatherAt(inc.x, inc.y);
        if ((weather === 'rain' || weather === 'storm') && Math.random() < 0.04) {
          resolveFire(inc);
          continue;
        }
      }
      // Fire timing is world time, not clock time: crews drive on the same
      // ticks, so a fire must not spread faster than an engine can reach it.
      const age = inc.age;
      while (inc.b && age < FIRE_CHAR_SEC && age >= ((inc.spreadCount || 0) + 1) * FIRE_SPREAD_SEC) {
        inc.spreadCount = (inc.spreadCount || 0) + 1;
        spreadFire(inc);
      }
      if (inc.b && age >= FIRE_CHAR_SEC) charBuilding(inc);
    }
  }
  for (let k = incidents.length - 1; k >= 0; k--) {
    if (incidents[k].state === 'done') incidents.splice(k, 1);
  }
  for (let k = wrecks.length - 1; k >= 0; k--) {
    if (gameMin > wrecks[k].until) wrecks.splice(k, 1);
  }
  pruneClosures();
}
function resolveIncident(inc, u) {
  inc.state = 'done';
  u.state = 'returning';
  u.path = u.from != null ? findPath(nearestRoadTile(u.x, u.y), u.from, 'car', Infinity, true) : null;
  u.i = 0;
  if (inc.kind === 'fire') stats.firesOut = (stats.firesOut || 0) + 1;
  else stats.crashesCleared = (stats.crashesCleared || 0) + 1;
  if (inc.kind === 'fire') notifyFireAlert();
}
// How far a fire reaches: from the edge of the burning footprint, not from its
// centre, so a large building does not magically protect the row beside it.
const FIRE_SPREAD_SEC = 300;      // world seconds between spread attempts
const FIRE_SPREAD_CHANCE = 0.25;
const FIRE_CHAR_SEC = 900;        // world seconds before the shell is lost
const FIRE_GIVEUP_SEC = 1500;     // an unfought fire is out after this long
const FIRE_SPREAD_REACH = 4;

function nearbyBuildings(b, reach) {
  const out = [];
  for (const o of buildings.values()) {
    if (o.id === b.id) continue;
    const dx = Math.max(0, Math.abs(o.x - b.x) - (o.w + b.w) / 2);
    const dy = Math.max(0, Math.abs(o.y - b.y) - (o.h + b.h) / 2);
    if (Math.max(dx, dy) <= reach) out.push(o);
  }
  out.sort((a, c) => distB(a, b) - distB(c, b));
  return out;
}

function spreadFire(inc) {
  const b = B(inc.b);
  if (!b) return;
  const near = nearbyBuildings(b, FIRE_SPREAD_REACH);
  if (!near.length) return;
  const burning = new Set();
  for (const other of incidents) if (other.kind === 'fire' && other.state !== 'done' && other.b) burning.add(other.b);
  for (const o of near) {
    if (!burning.has(o.id) && Math.random() < FIRE_SPREAD_CHANCE)
      raiseIncident('fire', o.cx, o.cy, o.id);
  }
}

function resolveFire(inc) {
  inc.state = 'done';
  stats.firesOut = (stats.firesOut || 0) + 1;
  notifyFireAlert();
}

function charBuilding(inc) {
  inc.state = 'done';
  const b = B(inc.b);
  if (!b || b.charred) return;
  const footprint = {x: b.x, y: b.y, w: b.w, h: b.h, seed: b.seed, type: b.type, id: b.id};
  for (const a of agents) if (a.home === b.id) a.mood = Math.max(0, a.mood - 0.3);
  removeBuilding(b);
  b.charred = true;
  b.queue = [];
  charredBuildings.set(b.id, b);
  for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) bldAt[yy * MW + xx] = b.id;
  wrecks.push({ruin: true, charredBuilding: true, ...footprint, t: simTime, until: Infinity});
  mapChanged();
  markDirty(footprint.x - 1, footprint.y - 1, footprint.x + footprint.w, footprint.y + footprint.h);
  stats.burned = (stats.burned || 0) + 1;
  notifyFireAlert();
}

// Bulldozing a ruin removes the charred overlay as well as the ground tiles.
function clearRuinsRect(x0, y0, x1, y1) {
  for (let k = wrecks.length - 1; k >= 0; k--) {
    const r = wrecks[k];
    if (!r.ruin) continue;
    if (r.x > x1 || r.x + r.w - 1 < x0 || r.y > y1 || r.y + r.h - 1 < y0) continue;
    wrecks.splice(k, 1);
  }
}
