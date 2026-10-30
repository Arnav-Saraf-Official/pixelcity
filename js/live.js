'use strict';
// =====================================================================
// Live city state: people, jobs, vehicles and the systems they feed
// =====================================================================
// A world used to be only its map. Opening a save rebuilt the city from
// scratch: every resident, job, car and train was generated again, which took a
// noticeable moment and started the simulation from an empty morning.
//
// This module snapshots the running city alongside the map, so a save (local,
// file or share code) resumes almost exactly where it was paused: the same
// people with the same homes, jobs and moods, the same cars mid-route, the same
// buses, trains, ships, fires and weather.
//
// Everything here is treated as untrusted input when it comes back. Each entry
// is type- and range-checked, routes are decoded tile by tile, and anything that
// no longer fits the map is dropped and the people it belonged to are sent home.
// A damaged snapshot therefore degrades to "a few commuters lost" rather than a
// broken world.

const LIVE_ROUTE_MAX = 8192;      // tiles in one encoded route
const LIVE_PEOPLE_MAX = 30000;    // residents in one snapshot
const LIVE_ACTOR_MAX = 30000;     // cars, walkers, trains and ships

// A route is a walk over neighbouring tiles, so it is stored as the first tile
// plus one character per step. That is about six times smaller than an array of
// tile numbers, which matters because these live in localStorage.
function encodeRoute(path) {
  if (!Array.isArray(path) || !path.length) return '';
  let s = (path[0] >>> 0).toString(36) + ':';
  for (let k = 1; k < path.length; k++) {
    const d = path[k] - path[k - 1];
    s += d === -MW ? '1' : d === 1 ? '2' : d === MW ? '3' : d === -1 ? '4' : '0';
  }
  return s;
}
function decodeRoute(s) {
  if (typeof s !== 'string' || !s || s.length > LIVE_ROUTE_MAX + 12) return null;
  const c = s.indexOf(':');
  if (c < 1 || c > 9) return null;
  const start = parseInt(s.slice(0, c), 36);
  if (!Number.isInteger(start) || start < 0 || start >= N) return null;
  const out = [start];
  for (let k = c + 1; k < s.length; k++) {
    const ch = s.charCodeAt(k) - 49;
    const cur = out[out.length - 1];
    let next;
    if (ch === 0) next = cur - MW;
    else if (ch === 1) next = cur + 1;
    else if (ch === 2) next = cur + MW;
    else if (ch === 3) next = cur - 1;
    else return null;
    if ((ch === 1 && cur % MW === MW - 1) || (ch === 3 && cur % MW === 0)) return null;
    if (next < 0 || next >= N) return null;
    out.push(next);
  }
  return out;
}

// Small readers used while restoring. They never throw on a bad value: the
// caller gets a default and carries on with the rest of the snapshot.
const liveNum = (v, lo, hi, dflt = 0) => Number.isFinite(v) && v >= lo && v <= hi ? v : dflt;
const liveInt = (v, lo, hi, dflt = 0) => Number.isInteger(v) && v >= lo && v <= hi ? v : dflt;
const liveStr = (v, max, dflt = '') => typeof v === 'string' && v.length <= max ? v : dflt;
const liveBool = v => v === true || v === 1;
const liveId = v => Number.isInteger(v) && B(v) ? v : 0;
const liveArr = (v, max) => Array.isArray(v) && v.length <= max ? v : [];

function captureLiveState() {
  const agentIndex = new Map(), pedIndex = new Map();
  const living = [];
  for (const a of agents) {
    if (a.dead) continue;
    agentIndex.set(a, living.length);
    living.push(a);
  }
  const walking = [];
  for (const p of peds) {
    if (p.dead) continue;
    pedIndex.set(p, walking.length);
    walking.push(p);
  }
  const ai = a => { const i = agentIndex.get(a); return i === undefined ? -1 : i; };
  const pi = p => { const i = pedIndex.get(p); return i === undefined ? -1 : i; };
  const pedList = list => (list || []).map(pi).filter(i => i >= 0);

  // Cars still in a building's queue have not joined the traffic fleet yet, but
  // their drivers are already on the way, so they belong in the snapshot too.
  const carRows = [];
  const carRow = (c, queueOf) => [
    liveInt(c.id, 1, 1e9), ai(c.agent), encodeRoute(c.path), liveInt(c.i, 0, LIVE_ROUTE_MAX),
    liveNum(c.t, 0, 4, 0), liveNum(c.speed, 0, 200, 0), liveNum(c.max, 0, 200, 22),
    liveStr(c.color, 16, '#ffffff'), liveInt(c.dest, 0, 1e9), liveInt(c.intent, 0, 1e9),
    liveStr(c.mode, 16, 'dest'), liveNum(c.wait, 0, 1e9, 0), liveNum(c.ghost, 0, 1e9, 0),
    (c.res || []).slice(0, 64).map(r => [liveInt(r.tile, 0, N - 1), liveNum(r.s, 0, 1e9, 0)]),
    liveNum(c.x, -1e6, 1e6, 0), liveNum(c.y, -1e6, 1e6, 0), liveInt(c.d, 0, 4, 2),
    liveNum(c.lastRR, -1e9, 1e12, 0), liveNum(c.lastLane, -1e9, 1e12, 0), liveInt(c.lane, 0, 1, 0),
    liveBool(c.bus) ? 1 : 0, pedList(c.riders), liveBool(c.truck) ? 1 : 0,
    c.cargo ? [liveStr(c.cargo.good, 12, 'goods'), liveNum(c.cargo.amount, 0, 1e9, 0), liveInt(c.cargo.from, 0, 1e9)] : null,
    liveBool(c.through) ? 1 : 0, liveInt(c.destTile, 0, N - 1, 0), liveInt(c.startB, 0, 1e9),
    liveInt(queueOf, 0, 1e9),
  ];
  for (const c of cars) if (!c.dead) carRows.push(carRow(c, 0));
  for (const b of buildings.values()) for (const c of b.queue) if (!c.dead) carRows.push(carRow(c, b.id));

  const buildingRows = [];
  for (const b of buildings.values()) {
    buildingRows.push([
      b.id, Number.isFinite(b.stock) ? b.stock : null,
      b.inventory ? {...b.inventory} : null,
      b.byproducts ? {...b.byproducts} : null,
      b.policy ? {message: b.policy.message, tone: b.policy.tone} : null,
      Number.isFinite(b.efficiency) ? b.efficiency : null,
      Number.isFinite(b.truckCd) ? b.truckCd : null,
      Number.isFinite(b.spawnCd) ? b.spawnCd : null,
      Number.isFinite(b.waiting) ? b.waiting : null,
      Number.isFinite(b.asleep) ? b.asleep : null,
      Number.isFinite(b.sick) ? b.sick : null,
      Number.isFinite(b.stress) ? b.stress : null,
      Number.isFinite(b.health) ? b.health : null,
      Number.isFinite(b.mood) ? b.mood : null,
      Number.isFinite(b.moodJob) ? b.moodJob : null,
      Number.isFinite(b.moodTransport) ? b.moodTransport : null,
      Number.isFinite(b.moodOverall) ? b.moodOverall : null,
      Number.isFinite(b.moodRepro) ? b.moodRepro : null,
      Number.isFinite(b.moodLocal) ? b.moodLocal : null,
      Number.isFinite(b.parkFail) ? b.parkFail : null,
    ]);
  }

  return {
    v: 1,
    time: [simTime, gameMin, lastHourTick, truckTimer, shipTimer, heatTimer, sampleTimer, histTimer, crashProgress, crashDay, crashesToday],
    next: [nextAid, nextCid, nextBid, nextIncident, nextMid, nextLineId, nextPlaneId],
    // People: id, home, job, loc, carAt, lotFor, state, stayUntil, worked, worker, mood,
    // ideal, work/home/health/safety/leisure/taxes/weather/local moods, stress, health,
    // immunity, sick, illness, illnessKey, sickSince, bed, wake, color, shirt, tripStart.
    people: living.map(a => [
      a.id, a.home, a.job, a.loc, a.carAt, a.lotFor, liveStr(a.state, 16, 'idle'), a.stayUntil,
      a.worked, a.worker ? 1 : 0, a.mood, a.ideal, a.moodWork, a.moodHome, a.moodHealth,
      a.moodSafety, a.moodLeisure, a.moodTaxes, a.moodWeather, a.moodLocal, a.stress,
      a.health, a.immunity, a.sick ? 1 : 0, a.illness, liveStr(a.illnessKey, 16, ''),
      a.sickSince, a.bed, a.wake, liveStr(a.color, 16, '#e74c3c'), liveStr(a.shirt, 16, '#ff6b6b'),
      a.tripStart,
    ]),
    walkers: walking.map(p => [
      ai(p.agent), (p.legs || []).slice(0, 16).map(leg => {
        if (Array.isArray(leg.metro)) return ['m', liveInt(leg.metro[0], 0, 1e9), liveInt(leg.metro[1], 0, 1e9)];
        if (Array.isArray(leg.bus)) return ['b', liveInt(leg.bus[0], 0, 1e9), liveInt(leg.bus[1], 0, 1e9)];
        return ['p', encodeRoute(leg.path)];
      }),
      p.leg, p.i, p.t, p.ride, p.dest, liveStr(p.mode, 16, 'walk'), p.x, p.y, p.d, liveStr(p.color, 16, '#fff'),
      p.hidden ? 1 : 0, p.riding ? 1 : 0, p.metroFrom, p.metroTo, p.waitSince,
    ]),
    cars: carRows,
    buildings: buildingRows,
    metros: metros.map(m => [
      m.id, m.home, m.at, m.target, m.x, m.y, m.d, encodeRoute(m.path), m.i, m.t,
      liveStr(m.state, 12, 'dwell'), m.wait, pedList(m.riders),
    ]),
    planes: planes.map(p => [
      p.id, p.x, p.y, p.ang, p.speed, p.alt, liveStr(p.phase, 12, 'cruise'), p.ap, p.from, p.dest,
      p.cross ? 1 : 0, p.wp ? [p.wp.x, p.wp.y] : null, p.legs, p.queued ? 1 : 0, p.finalT, p.tour,
      p.air, p.arrived, p.t0, p.tx, p.ty, p.orbitAngle, p.orbitTurn, p.inStorm ? 1 : 0, p.fallT,
    ]),
    boats: boats.map(b => [encodeRoute(b.path), b.i, b.t, b.x, b.y, b.d, b.speed, liveStr(b.color, 16, '#fff')]),
    ships: ships.map(s => [
      encodeRoute(s.path), s.i, s.t, s.x, s.y, s.d, s.speed,
      s.cargo ? [liveStr(s.cargo.good, 12, 'goods'), liveNum(s.cargo.amount, 0, 1e9, 0)] : null,
      s.origin, s.destPort, liveStr(s.color, 16, '#fff'),
    ]),
    freight: freight.map(t => [
      t.id, t.home, t.line, (t.consist || []).slice(0, 40).map(k => liveStr(k, 12, 'material')),
      encodeRoute(t.path), t.i, t.t, t.ex, t.x, t.y, t.d, liveStr(t.state, 12, 'dwell'), t.wait,
      t.at, t.target, (t.plan || []).slice(0, 64), t.leg,
      [liveNum(t.cargo?.material, 0, 1e9, 0), liveNum(t.cargo?.liquid, 0, 1e9, 0), liveNum(t.cargo?.gas, 0, 1e9, 0)],
      t.goods ? {...t.goods} : null, pedList(t.riders), t.lastStop,
      t.stops ? t.stops.slice(0, 64).map(s => [s.k, s.id]) : null, t.year || 0,
      encodeRoute(t.reserved), t.recent ? [...t.recent] : null,
    ]),
    units: units.map(u => [
      u.id, liveStr(u.kind, 16, 'ambulance'), u.home, u.x, u.y, u.d, liveStr(u.state, 12, 'idle'),
      encodeRoute(u.path), u.i, u.target, u.timer, u.blocked, u.from,
    ]),
    incidents: incidents.map(i => [
      i.id, liveStr(i.kind, 12, 'crash'), i.x, i.y, i.b, i.age, i.started,
      liveStr(i.state, 12, 'open'), i.unit, i.progress, i.roadMax, i.wreck ? 1 : 0,
      i.lastRainCheck, i.spreadCount,
    ]),
    wrecks: wrecks.map(r => [
      r.x, r.y, r.v, r.t, r.until === Infinity ? null : r.until, r.ruin ? 1 : 0,
      r.charredBuilding ? 1 : 0, r.id, liveStr(r.type, 24, ''), r.w, r.h, r.seed,
    ]),
    weather: weatherCells.map(c => [c.id, c.bx, c.by, c.x, c.y, c.tx, c.ty, c.retarget, liveStr(c.kind, 12, 'sunny'), c.until]),
    mood: {...cityMood},
    stats: {...stats, trips: stats.trips.slice(-150), modes: stats.modes.slice(-300), hist: stats.hist.slice(-115)},
    sickness: {...SICKNESS},
    cargo: {...cargoStats},
    busWait: [...busWait].map(([key, w]) => [liveInt(w.a, 0, 1e9), liveInt(w.b, 0, 1e9), liveNum(w.t, 0, 1e9, 0), pedList(w.riders)])
      .filter(row => row[0] && row[1]),
    metroWait: [...metroWait].map(([id, list]) => [liveInt(id, 0, 1e9), pedList(list)]).filter(row => row[0]),
    closures: [...streetClosures].map(([i, until]) => [liveInt(i, 0, N - 1), liveNum(until, 0, 1e12, 0)]),
  };
}

function restoreLiveState(live) {
  if (!live || typeof live !== 'object' || live.v !== 1) return false;
  if (!Array.isArray(live.people) || live.people.length > LIVE_PEOPLE_MAX) return false;
  if (!Array.isArray(live.cars) || live.cars.length > LIVE_ACTOR_MAX) return false;
  if (!Array.isArray(live.walkers) || live.walkers.length > LIVE_ACTOR_MAX) return false;

  // ---- clocks and counters ------------------------------------------------
  const t = Array.isArray(live.time) ? live.time : [];
  simTime = liveNum(t[0], 0, 1e12, simTime);
  gameMin = liveNum(t[1], 0, 1e12, gameMin);
  lastHourTick = Number.isFinite(t[2]) ? t[2] : lastHourTick;
  truckTimer = liveNum(t[3], 0, 1e6, 0);
  shipTimer = liveNum(t[4], 0, 1e6, 0);
  heatTimer = liveInt(t[5], 0, 1e6, 0);
  sampleTimer = liveInt(t[6], 0, 1e6, 0);
  histTimer = liveInt(t[7], 0, 1e6, 0);
  crashProgress = liveNum(t[8], 0, 1e6, 0);
  crashDay = Number.isInteger(t[9]) ? t[9] : crashDay;
  crashesToday = liveInt(t[10], 0, 1e6, 0);
  const next = Array.isArray(live.next) ? live.next : [];
  nextAid = Math.max(nextAid, liveInt(next[0], 1, 1e9, nextAid));
  nextCid = Math.max(nextCid, liveInt(next[1], 1, 1e9, nextCid));
  nextBid = Math.max(nextBid, liveInt(next[2], 1, 1e9, nextBid));
  nextIncident = Math.max(nextIncident, liveInt(next[3], 1, 1e9, nextIncident));
  nextMid = Math.max(nextMid, liveInt(next[4], 1, 1e9, nextMid));
  nextLineId = Math.max(nextLineId, liveInt(next[5], 1, 1e9, nextLineId));
  nextPlaneId = Math.max(nextPlaneId, liveInt(next[6], 1, 1e9, nextPlaneId));

  // ---- people -------------------------------------------------------------
  const people = [];
  for (const row of live.people) {
    if (!Array.isArray(row)) continue;
    const home = liveId(row[1]);
    if (!home) continue;
    const a = {
      id: liveInt(row[0], 1, 1e9, 0) || nextAid++,
      home, job: liveId(row[2]), loc: liveId(row[3]), carAt: liveId(row[4]), lotFor: liveId(row[5]),
      state: liveStr(row[6], 16, 'idle'), stayUntil: liveNum(row[7], -1e9, 1e12, 0),
      worked: Number.isFinite(row[8]) ? row[8] : -1, worker: !!liveBool(row[9]),
      mood: liveNum(row[10], 0, 1, 0.75), ideal: liveNum(row[11], 0, 1e6, 0),
      moodWork: liveNum(row[12], 0, 1, 0.75), moodHome: liveNum(row[13], 0, 1, 0.75),
      moodHealth: liveNum(row[14], 0, 1, 0.85), moodSafety: liveNum(row[15], 0, 1, 0.8),
      moodLeisure: liveNum(row[16], 0, 1, 0.7), moodTaxes: liveNum(row[17], 0, 1, 0.7),
      moodWeather: liveNum(row[18], 0, 1, 0.8), moodLocal: liveNum(row[19], 0, 1, 0.7),
      stress: liveNum(row[20], 0, 1, 0.12), health: liveNum(row[21], 0, 1, 0.9),
      immunity: liveNum(row[22], 0, 1, 0.4), sick: !!liveBool(row[23]),
      illness: liveNum(row[24], 0, 1, 0), illnessKey: liveStr(row[25], 16, ''),
      sickSince: liveNum(row[26], 0, 1e12, 0), bed: liveNum(row[27], 0, 48, 22.5),
      wake: liveNum(row[28], 0, 48, 6.5), color: liveStr(row[29], 16, '#e74c3c'),
      shirt: liveStr(row[30], 16, '#ff6b6b'), car: null, ped: null,
      tripStart: liveNum(row[31], -1e9, 1e12, 0), dead: false,
    };
    people.push(a);
  }
  if (!people.length && Array.isArray(live.people) && live.people.length) return false;
  agents = people;
  agentsDirty = false;

  // ---- walkers ------------------------------------------------------------
  const walkers = [];
  for (const row of live.walkers) {
    if (!Array.isArray(row)) continue;
    const owner = people[liveInt(row[0], 0, people.length - 1, -1)];
    if (!owner) continue;
    const legs = [];
    for (const tag of liveArr(row[1], 16)) {
      if (!Array.isArray(tag) || !tag.length) continue;
      if (tag[0] === 'm' || tag[0] === 'b') {
        const a = liveInt(tag[1], 1, 1e9, 0), b = liveInt(tag[2], 1, 1e9, 0);
        if (a && b) legs.push(tag[0] === 'm' ? {metro: [a, b]} : {bus: [a, b]});
      } else if (tag[0] === 'p') {
        const path = decodeRoute(tag[1]);
        if (path && path.length >= 2) legs.push({path});
      }
    }
    const leg = liveInt(row[2], -1, Math.max(-1, legs.length - 1), -1);
    const here = leg >= 0 ? legs[leg] : null;
    const p = {
      agent: owner, legs, leg, path: here && here.path ? here.path : null,
      i: liveInt(row[3], 0, LIVE_ROUTE_MAX, 0), t: liveNum(row[4], 0, 4, 0),
      ride: liveNum(row[5], 0, 1e9, 0), dest: liveInt(row[6], 0, 1e9, 0),
      mode: liveStr(row[7], 16, 'walk'), x: liveNum(row[8], -1e6, 1e6, 0),
      y: liveNum(row[9], -1e6, 1e6, 0), d: liveInt(row[10], 0, 4, 2),
      color: liveStr(row[11], 16, '#ffffff'), hidden: !!liveBool(row[12]),
      riding: !!liveBool(row[13]), metroFrom: liveId(row[14]), metroTo: liveId(row[15]),
      waitSince: liveNum(row[16], 0, 1e12, 0), dead: false,
    };
    walkers.push(p);
    if (!owner.ped) owner.ped = p;
  }
  peds = walkers;

  // ---- cars (and the ones still queued in a drive) ------------------------
  const cars2 = [], queues = new Map(), byId = new Map();
  for (const row of live.cars) {
    if (!Array.isArray(row)) continue;
    const path = decodeRoute(row[2]);
    if (!path || path.length < 1) continue;
    const agent = people[liveInt(row[1], 0, people.length - 1, -1)] || null;
    const mode = liveStr(row[10], 16, 'dest');
    const c = {
      id: liveInt(row[0], 1, 1e9, 0) || nextCid++,
      agent, path, i: liveInt(row[3], 0, path.length - 1, 0),
      t: liveNum(row[4], 0, 4, 0), speed: liveNum(row[5], 0, 200, 0),
      max: liveNum(row[6], 0, 200, 22), color: liveStr(row[7], 16, '#ffffff'),
      dest: liveInt(row[8], 0, 1e9, 0), intent: liveInt(row[9], 0, 1e9, 0), mode,
      wait: liveNum(row[11], 0, 1e9, 0), ghost: liveNum(row[12], 0, 1e9, 0),
      res: [], x: liveNum(row[14], -1e6, 1e6, 0), y: liveNum(row[15], -1e6, 1e6, 0),
      d: liveInt(row[16], 0, 4, 2), lastRR: liveNum(row[17], -1e9, 1e12, 0),
      lastLane: liveNum(row[18], -1e9, 1e12, 0), lane: liveInt(row[19], 0, 1, 0),
      dead: false,
    };
    for (const r of liveArr(row[13], 64)) {
      if (!Array.isArray(r)) continue;
      const tile = liveInt(r[0], 0, N - 1), s = liveNum(r[1], 0, 1e9, 0);
      c.res.push({tile, s});
    }
    if (liveBool(row[20])) c.bus = true;
    c.riders = liveArr(row[21], 128).map(i => walkers[liveInt(i, 0, walkers.length - 1, -1)]).filter(Boolean);
    if (liveBool(row[22])) c.truck = true;
    if (Array.isArray(row[23])) {
      const good = liveStr(row[23][0], 12, 'goods');
      c.cargo = {good, amount: liveNum(row[23][1], 0, 1e9, 0), from: liveInt(row[23][2], 0, 1e9, 0)};
    }
    if (liveBool(row[24])) c.through = true;
    if (c.through) c.destTile = liveInt(row[25], 0, N - 1, 0);
    if (row[26] !== null && Number.isInteger(row[26])) c.startB = row[26];
    if (agent && !agent.car) agent.car = c;
    const queueOf = liveId(row[27]);
    if (queueOf) {
      if (!queues.has(queueOf)) queues.set(queueOf, []);
      queues.get(queueOf).push(c);
    } else {
      cars2.push(c);
      byId.set(c.id, c);
    }
  }
  cars = cars2;
  carById.clear();
  for (const [id, c] of byId) carById.set(id, c);
  for (const b of buildings.values()) {
    const list = queues.get(b.id);
    b.queue = list ? list.filter(c => !c.dead) : [];
  }
  // Traffic reservations are rebuilt from the restored cars instead of trusted
  // from the file, so no car can be handed another car's right of way.
  resv.fill(0);
  for (const c of cars) for (const r of c.res) if (r.tile >= 0 && r.tile < N) resv[r.tile] = c.id;

  // ---- buildings ----------------------------------------------------------
  for (const row of Array.isArray(live.buildings) ? live.buildings : []) {
    if (!Array.isArray(row)) continue;
    const b = B(row[0]);
    if (!b) continue;
    const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
    if (num(row[1], 0, 1e9) !== undefined) b.stock = row[1];
    if (row[2] && typeof row[2] === 'object' && !Array.isArray(row[2]) && b.type === 'warehouse') {
      b.inventory ||= Object.create(null);
      for (const [good, amount] of Object.entries(row[2])) {
        if (GOOD_KEYS.includes(good) && Number.isFinite(amount) && amount >= 0 && amount <= WAREHOUSE_CAP) b.inventory[good] = amount;
      }
    }
    if (row[3] && typeof row[3] === 'object' && !Array.isArray(row[3]) && producerOf(b)) {
      b.byproducts ||= Object.create(null);
      for (const [good, amount] of Object.entries(row[3])) {
        if (Number.isFinite(amount) && amount >= 0 && amount <= 100) b.byproducts[good] = amount;
      }
    }
    if (row[4] && typeof row[4] === 'object' && b.type === 'billboard') {
      const message = liveStr(row[4].message, 16, ''), tone = liveStr(row[4].tone, 12, '');
      if (['driving', 'tax', 'environment', 'birth', 'health'].includes(message) && ['positive', 'negative'].includes(tone)) b.policy = {message, tone};
    }
    if (num(row[5], 0, 10) !== undefined) b.efficiency = row[5];
    for (const [k, lo, hi, key] of [[6, 0, 1e9, 'truckCd'], [7, 0, 1e9, 'spawnCd'], [8, 0, 1e9, 'waiting'],
      [9, 0, 1e9, 'asleep'], [10, 0, 1e9, 'sick'], [11, 0, 1, 'stress'], [12, 0, 1, 'health'],
      [13, 0, 1, 'mood'], [14, 0, 1, 'moodJob'], [15, 0, 1, 'moodTransport'], [16, 0, 1, 'moodOverall'],
      [17, 0, 1, 'moodRepro'], [18, 0, 1, 'moodLocal']]) {
      if (num(row[k], lo, hi) !== undefined) b[key] = row[k];
    }
    if (num(row[19], 0, 1e12) !== undefined) b.parkFail = row[19];
  }

  // ---- trains, aircraft, boats and ships ---------------------------------
  metros = [];
  for (const row of Array.isArray(live.metros) ? live.metros : []) {
    if (!Array.isArray(row)) continue;
    const home = liveId(row[1]);
    if (!home) continue;
    const path = decodeRoute(row[7]);
    const riders = liveArr(row[12], 64).map(i => walkers[liveInt(i, 0, walkers.length - 1, -1)]).filter(Boolean);
    metros.push({
      id: liveInt(row[0], 1, 1e9, 0) || nextMid++, home, at: liveId(row[2]), target: liveId(row[3]),
      x: liveNum(row[4], -1e6, 1e7, 0), y: liveNum(row[5], -1e6, 1e7, 0), d: liveInt(row[6], 0, 4, 2),
      path, i: liveInt(row[8], 0, path ? path.length - 1 : 0, 0), t: liveNum(row[9], 0, 4, 0),
      state: liveStr(row[10], 12, 'dwell'), wait: liveNum(row[11], 0, 1e9, 0), riders, dead: false,
    });
  }
  planes = [];
  for (const row of Array.isArray(live.planes) ? live.planes : []) {
    if (!Array.isArray(row)) continue;
    const ap = liveId(row[7]);
    if (!ap || B(ap).type !== 'airport') continue;
    const p = {
      id: liveInt(row[0], 1, 1e9, 0) || nextPlaneId++, x: liveNum(row[1], -1e6, 1e6, 0),
      y: liveNum(row[2], -1e6, 1e6, 0), ang: liveNum(row[3], -10, 10, 0),
      speed: liveNum(row[4], 0, 200, 0), alt: liveNum(row[5], 0, 60, 0),
      phase: liveStr(row[6], 12, 'cruise'), ap, from: liveId(row[8]), dest: liveId(row[9]),
      cross: !!liveBool(row[10]), wp: null, legs: liveInt(row[12], 0, 1e6, 0),
      queued: !!liveBool(row[13]), finalT: liveNum(row[14], 0, 1e6, 0), tour: liveInt(row[15], 1, 20, 1),
      air: liveNum(row[16], 0, 1e9, 0), arrived: liveNum(row[17], 0, 1e12, 0),
      t0: liveNum(row[18], 0, 1e12, 0), tx: liveNum(row[19], -1e6, 1e6, 0),
      ty: liveNum(row[20], -1e6, 1e6, 0), orbitAngle: liveNum(row[21], -10, 10, 0),
      orbitTurn: liveNum(row[22], 0, 100, 0), inStorm: !!liveBool(row[23]),
      fallT: liveNum(row[24], 0, 1e6, 0), dead: false,
    };
    if (Array.isArray(row[11]) && row[11].length === 2 && row[11].every(Number.isFinite)) p.wp = {x: row[11][0], y: row[11][1]};
    planes.push(p);
  }
  boats = [];
  for (const row of Array.isArray(live.boats) ? live.boats : []) {
    if (!Array.isArray(row)) continue;
    const path = decodeRoute(row[0]);
    if (!path || path.length < 2) continue;
    boats.push({
      path, i: liveInt(row[1], 0, path.length - 1, 0), t: liveNum(row[2], 0, 4, 0),
      x: liveNum(row[3], -1e6, 1e6, 0), y: liveNum(row[4], -1e6, 1e6, 0),
      d: liveInt(row[5], 0, 4, 2), speed: liveNum(row[6], 0, 60, 6),
      color: liveStr(row[7], 16, '#ffffff'), dead: false,
    });
  }
  ships = [];
  for (const row of Array.isArray(live.ships) ? live.ships : []) {
    if (!Array.isArray(row)) continue;
    const path = decodeRoute(row[0]);
    if (!path || path.length < 2) continue;
    const s = {
      path, i: liveInt(row[1], 0, path.length - 1, 0), t: liveNum(row[2], 0, 4, 0),
      x: liveNum(row[3], -1e6, 1e6, 0), y: liveNum(row[4], -1e6, 1e6, 0),
      d: liveInt(row[5], 0, 4, 2), speed: liveNum(row[6], 0, 60, 6),
      cargo: null, origin: liveId(row[8]), destPort: liveId(row[9]),
      color: liveStr(row[10], 16, '#ffffff'), dead: false,
    };
    if (Array.isArray(row[7])) s.cargo = {good: liveStr(row[7][0], 12, 'goods'), amount: liveNum(row[7][1], 0, 1e9, 0)};
    if (!s.cargo) continue;
    ships.push(s);
  }

  // ---- freight trains -----------------------------------------------------
  const FREIGHT_KINDS = new Set(['passenger', 'material', 'liquid', 'gas']);
  freight = [];
  railRes.fill(0);
  blockHold.fill(0);
  for (const row of Array.isArray(live.freight) ? live.freight : []) {
    if (!Array.isArray(row)) continue;
    const home = liveId(row[1]);
    if (!home) continue;
    const path = decodeRoute(row[4]);
    const consist = liveArr(row[3], 40).filter(k => FREIGHT_KINDS.has(k));
    const t2 = {
      id: liveInt(row[0], 1, 1e9, 0) || nextIncident++, home,
      line: liveInt(row[2], 0, 1e9, 0),
      consist: consist.length ? consist : ['passenger', 'material', 'liquid', 'gas'],
      path, i: liveInt(row[5], 0, path ? path.length - 1 : 0, 0), t: liveNum(row[6], 0, 4, 0),
      ex: liveNum(row[7], 0, 1e6, 0), x: liveNum(row[8], -1e6, 1e7, 0),
      y: liveNum(row[9], -1e6, 1e7, 0), d: liveInt(row[10], 0, 4, 2),
      state: liveStr(row[11], 12, 'dwell'), wait: liveNum(row[12], 0, 1e9, 0),
      at: liveId(row[13]), target: liveId(row[14]),
      plan: liveArr(row[15], 64).filter(v => Number.isInteger(v) && v > 0), leg: liveInt(row[16], 0, 64, 0),
      cargo: {material: liveNum(row[17]?.[0], 0, 1e9, 0), liquid: liveNum(row[17]?.[1], 0, 1e9, 0), gas: liveNum(row[17]?.[2], 0, 1e9, 0)},
      riders: liveArr(row[19], 128).map(i => walkers[liveInt(i, 0, walkers.length - 1, -1)]).filter(Boolean),
      lastStop: liveInt(row[20], -1, 64, -1), stops: null, year: liveInt(row[21], 0, 1e6, 0),
      reserved: [], recent: null, dead: false,
    };
    if (row[18] && typeof row[18] === 'object' && !Array.isArray(row[18])) {
      t2.goods = Object.create(null);
      for (const [good, amount] of Object.entries(row[18])) {
        if (GOOD_KEYS.includes(good) && Number.isFinite(amount) && amount >= 0) t2.goods[good] = amount;
      }
    }
    for (const stop of liveArr(row[22], 64)) {
      if (!Array.isArray(stop)) continue;
      const k = liveInt(stop[0], 0, 1e6, -1), id = liveId(stop[1]);
      if (k >= 0 && id) (t2.stops ||= []).push({k, id});
    }
    if (Array.isArray(row[23])) t2.recent = new Set(row[23].filter(g => GOOD_KEYS.includes(g)));
    const reserved = decodeRoute(row[24]);
    if (reserved) {
      t2.reserved = reserved;
      for (const i of reserved) { railRes[i] = t2.id; if (blockOf[i]) blockHold[blockOf[i]]++; }
    }
    freight.push(t2);
  }

  // ---- emergency crews and their incidents --------------------------------
  units = [];
  for (const row of Array.isArray(live.units) ? live.units : []) {
    if (!Array.isArray(row)) continue;
    const home = liveId(row[2]);
    if (!home) continue;
    units.push({
      id: liveInt(row[0], 1, 1e9, 0) || nextIncident++, kind: liveStr(row[1], 16, 'ambulance'), home,
      x: liveNum(row[3], -1e6, 1e6, 0), y: liveNum(row[4], -1e6, 1e6, 0), d: liveInt(row[5], 0, 4, 2),
      state: liveStr(row[6], 12, 'idle'), path: decodeRoute(row[7]), i: liveNum(row[8], 0, 1e6, 0),
      target: liveInt(row[9], 0, 1e9, 0), timer: liveNum(row[10], 0, 1e9, 0),
      blocked: liveNum(row[11], 0, 1e9, 0), from: row[12] === null ? null : liveInt(row[12], 0, N - 1, 0),
    });
  }
  incidents.length = 0;
  for (const row of Array.isArray(live.incidents) ? live.incidents : []) {
    if (!Array.isArray(row)) continue;
    const inc = {
      id: liveInt(row[0], 1, 1e9, 0) || nextIncident++, kind: liveStr(row[1], 12, 'crash'),
      x: liveNum(row[2], -1e6, 1e6, 0), y: liveNum(row[3], -1e6, 1e6, 0), b: liveId(row[4]),
      age: liveNum(row[5], 0, 1e9, 0), started: liveNum(row[6], 0, 1e12, gameMin),
      state: liveStr(row[7], 12, 'open'), unit: liveInt(row[8], 0, 1e9, 0),
      progress: liveNum(row[9], 0, 1e9, 0),
    };
    if (Number.isFinite(row[10])) inc.roadMax = row[10];
    if (liveBool(row[11])) inc.wreck = true;
    if (Number.isFinite(row[12])) inc.lastRainCheck = row[12];
    if (Number.isFinite(row[13])) inc.spreadCount = row[13];
    incidents.push(inc);
  }
  wrecks.length = 0;
  for (const row of Array.isArray(live.wrecks) ? live.wrecks : []) {
    if (!Array.isArray(row)) continue;
    const w = {
      x: liveInt(row[0], 0, MW - 1, 0), y: liveInt(row[1], 0, MH - 1, 0), v: liveInt(row[2], 0, 8, 0),
      t: liveNum(row[3], 0, 1e12, simTime), until: row[4] === null ? Infinity : liveNum(row[4], 0, 1e12, gameMin + 720),
    };
    if (liveBool(row[5])) { w.ruin = true; w.charredBuilding = true; }
    if (liveBool(row[6])) w.charredBuilding = true;
    if (Number.isInteger(row[7])) w.id = row[7];
    if (typeof row[8] === 'string' && row[8]) w.type = row[8];
    if (Number.isInteger(row[9])) w.w = row[9];
    if (Number.isInteger(row[10])) w.h = row[10];
    if (Number.isInteger(row[11])) w.seed = row[11];
    wrecks.push(w);
  }

  // ---- weather, moods, records -------------------------------------------
  if (Array.isArray(live.weather) && live.weather.length && live.weather.length <= WX_COLS * WX_ROWS) {
    weatherCells.length = 0;
    for (const row of live.weather) {
      if (!Array.isArray(row)) continue;
      const kind = liveStr(row[8], 12, 'sunny');
      weatherCells.push({
        id: liveInt(row[0], 0, 64, weatherCells.length), bx: liveNum(row[1], 0, MW, 0),
        by: liveNum(row[2], 0, MH, 0), x: liveNum(row[3], 0, MW, 0), y: liveNum(row[4], 0, MH, 0),
        tx: liveNum(row[5], 0, MW, 0), ty: liveNum(row[6], 0, MH, 0),
        retarget: liveNum(row[7], 0, 1e12, 0), kind: WEATHER_KINDS[kind] ? kind : 'sunny',
        until: liveNum(row[9], 0, 1e12, gameMin + 120),
      });
    }
    if (weatherCells.length) weatherSeeded = true;
  }
  if (live.mood && typeof live.mood === 'object') for (const k of Object.keys(cityMood)) {
    if (Number.isFinite(live.mood[k])) cityMood[k] = clamp(live.mood[k], 0, 1);
  }
  if (live.stats && typeof live.stats === 'object') {
    const s = live.stats;
    for (const k of ['totalTrips', 'frustrated', 'stranded', 'ti', 'tiAcc', 'tiN', 'waitN', 'planeCrashes', 'planeDeaths',
      'crashes', 'crashesCleared', 'firesOut', 'burned', 'evacuated', 'wait']) {
      if (Number.isFinite(s[k])) stats[k] = s[k];
    }
    if (s.lastFrustToast !== undefined) stats.lastFrustToast = Number.isFinite(s.lastFrustToast) ? s.lastFrustToast : stats.lastFrustToast;
    if (s.lastSite && Number.isFinite(s.lastSite.x) && Number.isFinite(s.lastSite.y)) stats.lastSite = {x: s.lastSite.x, y: s.lastSite.y};
    if (Number.isInteger(s.lastFail)) stats.lastFail = s.lastFail;
    if (Array.isArray(s.trips)) stats.trips = s.trips.filter(Number.isFinite).slice(-150);
    if (Array.isArray(s.modes)) stats.modes = s.modes.filter(m => typeof m === 'string').slice(-300);
    if (Array.isArray(s.hist)) stats.hist = s.hist.filter(h => h && Number.isFinite(h.ti) && Number.isFinite(h.cars)).slice(-115);
  }
  if (live.sickness && typeof live.sickness === 'object') for (const k of ['total', 'recovered', 'deaths', 'days', 'outbreaks', 'patients', 'lastOutbreak']) {
    if (Number.isFinite(live.sickness[k])) SICKNESS[k] = live.sickness[k];
  }
  if (live.cargo && typeof live.cargo === 'object') for (const k of ['deliveries', 'shipped', 'moved', 'trainRuns']) {
    if (Number.isFinite(live.cargo[k])) cargoStats[k] = live.cargo[k];
  }

  // ---- bus and metro waiting lists ---------------------------------------
  busWait.clear();
  metroWait.clear();
  for (const b of buildings.values()) b.waiting = 0;
  for (const row of Array.isArray(live.busWait) ? live.busWait : []) {
    if (!Array.isArray(row)) continue;
    const a = liveId(row[0]), b = liveId(row[1]);
    if (!a || !b) continue;
    const riders = liveArr(row[3], 64).map(i => walkers[liveInt(i, 0, walkers.length - 1, -1)]).filter(Boolean);
    if (!riders.length) continue;
    busWait.set(a + '-' + b, {a, b, riders, t: liveNum(row[2], 0, 1e9, 5)});
  }
  for (const row of Array.isArray(live.metroWait) ? live.metroWait : []) {
    if (!Array.isArray(row)) continue;
    const id = liveId(row[0]);
    if (!id) continue;
    const list = liveArr(row[1], 128).map(i => walkers[liveInt(i, 0, walkers.length - 1, -1)]).filter(Boolean);
    if (!list.length) continue;
    metroWait.set(id, list);
    const s = B(id);
    if (s) s.waiting = (s.waiting || 0) + list.length;
  }

  // ---- street closures ----------------------------------------------------
  streetClosures.clear();
  roadClosed.fill(0);
  for (const row of Array.isArray(live.closures) ? live.closures : []) {
    if (!Array.isArray(row)) continue;
    const i = liveInt(row[0], 0, N - 1), until = liveNum(row[1], 0, 1e12, 0);
    if (until <= simTime) continue;
    streetClosures.set(i, until);
    roadClosed[i] = until;
  }

  // ---- repairs ------------------------------------------------------------
  // A snapshot can lose an actor (a corrupted route, a demolished station). Any
  // resident whose trip no longer has a vehicle walks home instead of being
  // stranded in an impossible state.
  for (const a of agents) {
    if (a.dead) continue;
    if (!a.job || !B(a.job)) a.job = 0;
    if (a.loc && !B(a.loc)) a.loc = 0;
    if (a.carAt && !B(a.carAt)) a.carAt = 0;
    if (a.lotFor && !B(a.lotFor)) a.lotFor = 0;
    if (a.state === 'drive' && !a.car) { a.state = 'idle'; a.loc = 0; teleportHome(a); }
    else if (a.state === 'walk' && !a.ped) { a.state = 'idle'; a.loc = 0; teleportHome(a); }
    else if (!a.carAt) a.carAt = a.home;
  }
  for (const p of peds) if (p.agent.dead) p.dead = true;
  if (peds.some(p => p.dead)) peds = peds.filter(p => !p.dead);
  agents = agents.filter(a => !a.dead);
  recount();
  logisticsReady = true;
  markRailBusy();
  syncWeatherLabel();
  return true;
}
