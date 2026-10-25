// =====================================================================
// Agents, trips, cars, pedestrians
// =====================================================================
function newPerson(home) {
  return {id: nextAid++, home, job: 0, loc: home, carAt: home, lotFor: 0, state: 'idle',
    stayUntil: 0, worked: -1, worker: Math.random() < 0.7,    mood: worldSettings.difficulty === 'ideal' ? 1 : 0.75, ideal: 0,
    // bed and wake times follow a bell curve, so the city drifts off and wakes up gradually
    bed: clamp(22.4 + gauss() * 1.0, 20.2, 25.6), wake: clamp(6.5 + gauss() * 0.9, 4.4, 9.6),
    color: CARC[Math.floor(Math.random() * CARC.length)], shirt: SHIRT[Math.floor(Math.random() * SHIRT.length)],
    car: null, ped: null, tripStart: 0, dead: false};
}
function addAgent(home) {
  const a = newPerson(home.id);
  home.people++; home.cars++; home.residents++;
  agents.push(a);
  return a;
}
function killAgent(a) {
  a.dead = true;
  if (a.car) { a.car.dead = true; releaseAll(a.car); carById.delete(a.car.id); a.car = null; }
  if (a.ped) { a.ped.dead = true; a.ped = null; }
}
function distB(a, b) { return Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy); }
function teleportHome(a) {
  const H = B(a.home); if (!H) return;
  if (a.state === 'idle') { if (a.loc === H.id) return; const L = B(a.loc); if (L) L.people--; }
  if (a.carAt !== H.id) { const C = B(a.carAt); if (C) C.cars--; a.carAt = H.id; H.cars++; }
  a.lotFor = 0; a.loc = H.id; a.state = 'idle'; a.car = null; a.ped = null; H.people++;
  const sensitivity = {ideal: 0, easy: 0.35, normal: 0.7, hard: 1, insane: 1.5}[worldSettings.difficulty] ?? 0.7;
  a.mood = worldSettings.difficulty === 'ideal' ? 1 : a.mood * (1 - 0.3 * sensitivity);
}
function arriveAgent(a, b, mode) {
  a.state = 'idle'; a.loc = b.id; a.car = null; a.ped = null; b.people++;
  const dur = Math.max(1, gameMin - a.tripStart);
  stats.trips.push(dur); if (stats.trips.length > 150) stats.trips.shift();
  stats.modes.push(mode); if (stats.modes.length > 300) stats.modes.shift();
  // How people feel about traffic: a drive close to the free-flow time is a good drive.
  const score = mode === 'car' ? clamp(((a.ideal + 3) / dur - 0.5) / 0.4, 0, 1) : mode === 'walk' ? 0.88 : 0.82;
  const sensitivity = {ideal: 0, easy: 0.35, normal: 0.7, hard: 1, insane: 1.5}[worldSettings.difficulty] ?? 0.7;
  a.mood = a.mood * (1 - 0.3 * sensitivity) + score * (0.3 * sensitivity);
  if (b.id === a.home) a.stayUntil = 0;
  else if (b.id === a.job) a.stayUntil = gameMin + 450 + Math.random() * 90;
  else if (b.type === 'park') a.stayUntil = gameMin + 50 + Math.random() * 110;
  else a.stayUntil = gameMin + 30 + Math.random() * 90;
  // everyone heads home in time for bed
  if (b.id !== a.home) a.stayUntil = Math.min(a.stayUntil, Math.floor(gameMin / 1440) * 1440 + (a.bed - 0.6) * 60);
}
// Wake time also shifts a little from day to day.
function wakeToday(a) { return a.wake + (hash(a.id, Math.floor(gameMin / 1440), 5) - 0.5) * 0.8; }
function asleepAt(a, h) {
  const w = wakeToday(a);
  return a.bed >= 24 ? (h >= a.bed - 24 && h < w) : (h >= a.bed || h < w);
}
function carAvail(a, from) {
  if (a.carAt === from.id) return true;
  const L = B(a.carAt);
  return !!L && BT[L.type].cat === 'lot' && a.lotFor === from.id;
}
function nearestOf(list, b, rad) {
  let best = null, bd = rad;
  for (const s of list) { if (s.walk < 0) continue; const d = distB(s, b); if (d < bd) { bd = d; best = s; } }
  return best;
}
const nearestStation = b => nearestOf(stations, b, 11);
const nearestStop = b => nearestOf(busStops, b, 9);
// Bus stops: riders wait at the stop, and a bus leaves when it is full or after a short wait,
// then drives on the streets with everyone heading to the same stop.
const busWait = new Map();
function boardBus(p, a, b) {
  const k = a + '-' + b; let w = busWait.get(k);
  if (!w) busWait.set(k, w = {a, b, riders: [], t: 5});
  w.riders.push(p);
  const s = B(a); if (s) s.waiting = (s.waiting || 0) + 1;
}
function stepBusStops(dt) {
  for (const [k, w] of busWait) {
    w.t -= dt;
    if (w.t > 0 && w.riders.length < 12) continue;
    const A = B(w.a), D = B(w.b), live = w.riders.filter(p => !p.dead);
    const path = A && D && A.road >= 0 && D.road >= 0 && live.length ? findPath(A.road, D.road, 'car') : null;
    if (path && path.length >= 2) {
      const c = newCar({bus: true, riders: live, path, color: '#f5c518', mode: 'bus', dest: D.id, intent: D.id});
      if (!spawnCarAt(c)) { w.t = 1; continue; }   // the stop is blocked by traffic: try again shortly
    } else for (const p of live) nextLeg(p);       // no bus can get there: they walk on
    busWait.delete(k);
    if (A) A.waiting = Math.max(0, (A.waiting || 0) - w.riders.length);
  }
}
function busArrive(c) { endCar(c); for (const p of c.riders) if (!p.dead) nextLeg(p); }
function planModes(a, from, to) {
  const dist = distB(from, to);
  const carHere = carAvail(a, from);
  const carOK = carHere && to.road >= 0 && B(a.carAt).road >= 0 && compR[B(a.carAt).road] === compR[to.road] &&
    (capOf(to) > 0 || to.id === a.home || [...buildings.values()].some(b => BT[b.type].cat === 'lot' && distB(b, to) < 8.5));
  // anyone who drove somewhere drives their car back
  if (carOK && from.id !== a.home) return ['car', 'walk'];
  // short trips are walked; footpaths, plazas and parks nearby make longer walks attractive
  const full = capOf(to) > 0 && to.cars >= capOf(to) && to.id !== a.home;
  let pWalk = 0;
  if (dist <= 22) pWalk = clamp(0.74 - dist * 0.043 + (from.ws + to.ws) * 0.035 + (to.type === 'park' ? 0.3 : 0) + (full ? 0.3 : 0), 0, 0.95);
  if (!carOK) pWalk = dist <= 30 ? 1 : 0;
  // the metro is fast and skips traffic, so most people near two stations take it
  const sa = nearestStation(from), sb = nearestStation(to);
  const pMetro = (sa && sb && sa !== sb && dist > 6) ? (carOK ? 0.85 : 1) : 0;
  const ba = nearestStop(from), bb = nearestStop(to);
  const pBus = (ba && bb && ba !== bb && dist > 6 && ba.road >= 0 && bb.road >= 0 && compR[ba.road] === compR[bb.road]) ? (carOK ? 0.5 : 1) : 0;
  const order = [];
  if (pWalk && Math.random() < pWalk) order.push('walk');
  if (pMetro && Math.random() < pMetro) order.push('metro');
  if (pBus && Math.random() < pBus) order.push('bus');
  if (carOK) order.push('car');
  if (!order.includes('walk') && dist <= 30) order.push('walk');
  if (pMetro && !order.includes('metro')) order.push('metro');
  if (pBus && !order.includes('bus')) order.push('bus');
  return order;
}
function go(a, toId, purpose) {
  const from = B(a.loc), to = B(toId);
  if (!from || !to || from === to) return false;
  for (const m of planModes(a, from, to)) if (tryMode(a, from, to, m, purpose)) return true;
  if (purpose === 'home') { teleportHome(a); stats.stranded++; }
  else a.stayUntil = gameMin + 60;
  return false;
}
function depart(a, from, mode) { from.people--; a.state = mode; a.tripStart = gameMin; }
function newCar(props) {
  return Object.assign({id: nextCid++, agent: null, path: null, i: 0, t: 0, speed: 0, max: 22, color: '#ffffff', dest: 0, intent: 0, mode: 'dest',
    wait: 0, ghost: 0, res: [], x: 0, y: 0, d: 2, lastRR: simTime, lastLane: 0, lane: Math.random() < 0.5 ? 1 : 0, dead: false}, props);
}
function tryMode(a, from, to, mode) {
  if (mode === 'walk') {
    if (from.walk < 0 || to.walk < 0) return false;
    const p = findPath(from.walk, to.walk, 'walk', 36);
    if (!p) return false;
    depart(a, from, 'walk');
    spawnPed(a, [{path: p}], to.id, 'walk');
    return true;
  }
  if (mode === 'metro') {
    const sa = nearestStation(from), sb = nearestStation(to);
    if (!sa || !sb || sa === sb || from.walk < 0 || to.walk < 0) return false;
    const p1 = findPath(from.walk, sa.walk, 'walk', 16); if (!p1) return false;
    const p2 = findPath(sb.walk, to.walk, 'walk', 16); if (!p2) return false;
    depart(a, from, 'walk');
    spawnPed(a, [{path: p1}, {metro: [sa.id, sb.id]}, {path: p2}], to.id, 'metro');
    return true;
  }
  if (mode === 'bus') {
    const sa = nearestStop(from), sb = nearestStop(to);
    if (!sa || !sb || sa === sb || from.walk < 0 || to.walk < 0) return false;
    const p1 = findPath(from.walk, sa.walk, 'walk', 18); if (!p1) return false;
    const p2 = findPath(sb.walk, to.walk, 'walk', 18); if (!p2) return false;
    depart(a, from, 'walk');
    spawnPed(a, [{path: p1}, {bus: [sa.id, sb.id]}, {path: p2}], to.id, 'bus');
    return true;
  }
  if (mode === 'car') {
    const startB = B(a.carAt);
    if (!startB || startB.road < 0 || to.road < 0) return false;
    const p = findPath(startB.road, to.road, 'car');
    if (!p) return false;
    depart(a, from, 'drive');
    startB.cars--; a.carAt = 0; a.lotFor = 0; a.ideal = p.length;
    const c = newCar({agent: a, path: p, color: a.color, dest: to.id, intent: to.id, startB: startB.id});
    a.car = c;
    if (p.length < 2) { arriveCar(c); return true; }
    carGeom(c);
    startB.queue.push(c);
    return true;
  }
  return false;
}
function spawnPed(a, legs, destId, mode) {
  const p = {agent: a, legs, leg: -1, path: null, i: 0, t: 0, ride: 0, dest: destId, mode, x: 0, y: 0, d: 2, color: a.shirt, dead: false, hidden: false};
  a.ped = p; peds.push(p);
  nextLeg(p);
}
function nextLeg(p) {
  for (;;) {
    p.leg++;
    if (p.leg >= p.legs.length) {
      p.dead = true;
      const D = B(p.dest), a = p.agent;
      if (D) arriveAgent(a, D, p.mode); else { a.state = 'idle'; a.loc = 0; teleportHome(a); }
      return;
    }
    const L = p.legs[p.leg];
    if (L.metro) { p.ride = 1e9; p.hidden = true; p.riding = false; queueMetroRider(p, L.metro[0], L.metro[1]); return; }
    if (L.bus) { p.ride = 1e9; p.hidden = true; boardBus(p, L.bus[0], L.bus[1]); return; }
    p.hidden = false;
    if (L.path.length >= 2) { p.path = L.path; p.i = 0; p.t = 0; pedGeom(p); return; }
  }
}
function stepPed(p, dt) {
  if (p.hidden) {
    if (p.riding) return;          // on a train: the train does the moving
    p.ride -= dt;
    if (p.ride <= 0) nextLeg(p);
    return;
  }
  p.t += 6.5 * dt / T;
  while (p.t >= 1) { p.t -= 1; p.i++; if (p.i >= p.path.length - 1) { nextLeg(p); return; } }
  pedGeom(p);
}
// Lane sign for a segment: on a two-lane carriageway the left lane sits on the other side of center.
function laneK(u, v, lane) { return lane && autoOw[u] && autoOw[u] === autoOw[v] ? -1 : 1; }
function laneGeom(o, path, i, t, mag, lane) {
  const a = path[i], b = path[i + 1];
  const ax = a % MW, ay = a / MW | 0, bx = b % MW, by = b / MW | 0;
  const d = dirOf(a, b), pa = i > 0 ? path[i - 1] : a, nx = i + 2 < path.length ? path[i + 2] : b;
  const pd = i > 0 ? dirOf(pa, a) : d, nd = i + 2 < path.length ? dirOf(b, nx) : d;
  const kp = laneK(pa, a, lane), kd = laneK(a, b, lane), kn = laneK(b, nx, lane);
  let ox, oy;
  if (t < 0.5) { const k = t * 2; ox = (OX[pd] * kp + OX[d] * kd) / 2 * (1 - k) + OX[d] * kd * k; oy = (OY[pd] * kp + OY[d] * kd) / 2 * (1 - k) + OY[d] * kd * k; }
  else { const k = (t - 0.5) * 2; ox = OX[d] * kd * (1 - k) + (OX[d] * kd + OX[nd] * kn) / 2 * k; oy = OY[d] * kd * (1 - k) + (OY[d] * kd + OY[nd] * kn) / 2 * k; }
  o.x = (ax + (bx - ax) * t) * T + 4.5 + ox * mag;
  o.y = (ay + (by - ay) * t) * T + 4.5 + oy * mag;
  o.d = d;
}
function carGeom(c) { laneGeom(c, c.path, c.i, c.t, 1, c.lane); }
// Pedestrians walk on the sidewalk edge of streets and along the railing of bridges.
function pedGeom(p) { const cur = p.path[p.t < 0.5 ? p.i : p.i + 1]; laneGeom(p, p.path, p.i, p.t, tile[cur] === 1 ? (water[cur] ? 2 : 2.67) : 0.7, 0); }

function lightState(L, axis) {
  const cyc = L.ns + L.ew + 2 * YEL; let tt = ((simTime + L.off) % cyc + cyc) % cyc;
  if (tt < L.ns) return axis === 0 ? 0 : 2;
  if (tt < L.ns + YEL) return axis === 0 ? 1 : 2;
  tt -= L.ns + YEL;
  if (tt < L.ew) return axis === 1 ? 0 : 2;
  return axis === 1 ? 1 : 2;
}
function holdsRes(c, tileI) { for (const r of c.res) if (r.tile === tileI) return true; return false; }
function tryReserve(c, tileI, idx) {
  const h = resv[tileI];
  if (h && h !== c.id) { const o = carById.get(h); if (o && !o.dead && holdsRes(o, tileI)) return false; }
  resv[tileI] = c.id; c.res.push({tile: tileI, s: idx}); return true;
}
function releaseAll(c) { for (const r of c.res) if (resv[r.tile] === c.id) resv[r.tile] = 0; c.res.length = 0; }

const bucket = new Map();
function buildBuckets() {
  bucket.clear();
  for (const c of cars) { if (c.dead) continue; const k = tileAt(c.x, c.y); const arr = bucket.get(k); if (arr) arr.push(c); else bucket.set(k, [c]); }
  // A fire engine or ambulance standing in the road is an obstacle like any
  // other vehicle, so traffic queues behind it instead of driving through.
  if (typeof units !== 'undefined') for (const u of units) {
    if (u.state === 'idle') continue;
    const k = tileAt(u.x * T, u.y * T);
    const e = {x: u.x * T, y: u.y * T, d: u.d || 2, speed: 0, unit: true};
    const arr = bucket.get(k);
    if (arr) arr.push(e); else bucket.set(k, [e]);
  }
}
let aheadDist = 0;
// Inside an intersection a car only queues behind cars heading the same way,
// so left-turners and crossing traffic don't lock each other up.
function scanBucket(c, k, hx, hy, sameOnly) {
  const arr = bucket.get(k); if (!arr) return null;
  let best = null;
  for (const o of arr) {
    if (o === c || (sameOnly && o.d !== c.d)) continue;
    const vx = o.x - c.x, vy = o.y - c.y, ah = vx * hx + vy * hy;
    if (ah <= 0.05 || ah > (c.bus || o.bus ? 5.6 : 4.6)) continue;   // buses are longer
    if (Math.abs(vx * hy - vy * hx) < 1.6 && (!best || ah < aheadDist)) { best = o; aheadDist = ah; }
  }
  return best;
}
function carAhead(c) {
  const hx = DX[c.d], hy = DY[c.d];
  const k1 = tileAt(c.x, c.y), k2 = tileAt(c.x + hx * 5, c.y + hy * 5);
  const inX = deg[k1] >= 3;
  let o = scanBucket(c, k1, hx, hy, inX); const d1 = aheadDist;
  if (k2 !== k1) { const o2 = scanBucket(c, k2, hx, hy, inX && deg[k2] >= 3); if (o2 && (!o || aheadDist < d1)) return o2; }
  aheadDist = d1; return o;
}
// On a two-lane carriageway a blocked car moves over if the other lane is clear.
function tryLaneChange(c) {
  c.lastLane = simTime;
  c.lane ^= 1; carGeom(c);
  let clear = true;
  const arr = bucket.get(tileAt(c.x, c.y));
  if (arr) for (const o of arr) if (o !== c && Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 4.2) { clear = false; break; }
  if (clear) { const o = carAhead(c); if (o && aheadDist < 4.6) clear = false; }
  if (!clear) { c.lane ^= 1; carGeom(c); }
  return clear;
}
function stepCar(c, dt) {
  if (c.ghost > 0) c.ghost -= dt;
  const p = c.path, a0 = p[c.i], b = p[c.i + 1];
  const maxSp = ((tile[b] === 2 && tile[a0] === 2) ? 38 : 22) * weatherSpeedAt(c.x / T, c.y / T);
  c.max = maxSp;
  let target = maxSp;
  if (c.ghost <= 0) {
    const o = carAhead(c);
    if (o) {
      target = aheadDist < (c.bus || o.bus ? 4.7 : 3.7) ? 0 : Math.min(target, o.speed);
      if (target < maxSp * 0.6 && autoOw[a0] && autoOw[a0] === autoOw[b] && simTime - c.lastLane > 1.2 && tryLaneChange(c)) target = maxSp;
    }
  }
  if (target < c.speed) c.speed = target; else c.speed = Math.min(target, c.speed + 45 * dt);
  let ds = c.speed * dt / T;
  if (c.t < 0.5 && deg[b] >= 3 && !overpass[b] && !freeflow[b]) {
    let cap = 2;
    const L = lights.get(b);
    if (L) { const st = lightState(L, (c.d === 1 || c.d === 3) ? 0 : 1); if (st === 2 || (st === 1 && c.t < 0.3)) cap = 0.4; }
    else if (c.ghost <= 0 && !holdsRes(c, b) && c.t + ds >= 0.33) { if (!tryReserve(c, b, c.i + 1)) cap = 0.4; }
    if (c.t + ds > cap) { ds = Math.max(0, cap - c.t); if (ds < 0.002) c.speed = 0; }
  }
  c.t += ds;
  if (c.speed < 2) c.wait += dt; else c.wait = 0;
  if (c.wait > 8) { c.ghost = 1.5; c.wait = 0; }
  while (c.t >= 1) { c.t -= 1; c.i++; if (c.i >= p.length - 1) { c.t = 0; c.i = p.length - 1; arriveCar(c); return; } }
  if (c.res.length) {
    const s = c.i + c.t;
    for (let k = c.res.length - 1; k >= 0; k--) { const r = c.res[k]; if (s > r.s + 0.55) { if (resv[r.tile] === c.id) resv[r.tile] = 0; c.res.splice(k, 1); } }
  }
  // re-plan around a jam once in a while
  if (c.wait > 5 && simTime - c.lastRR > 12 && c.i + 2 < p.length && !overpass[p[c.i + 1]]) {
    c.lastRR = simTime;
    const goal = destTileOf(c);
    if (goal >= 0) {
      const np = findPath(p[c.i + 1], goal, 'car');
      if (np && np.length > 1) { releaseAll(c); c.path = [p[c.i], ...np]; c.i = 0; }
    }
  }
  carGeom(c);
  const k = tileAt(c.x, c.y);
  if (c.speed < maxSp * 0.3) { heatAcc[k] += dt; stats.waitN++; }
  stats.tiAcc += 1 - c.speed / maxSp; stats.tiN++;
}
function endCar(c) { c.dead = true; releaseAll(c); carById.delete(c.id); if (c.agent && c.agent.car === c) c.agent.car = null; }
function capOf(b) { return BT[b.type].cap; }
function destTileOf(c) { if (c.through) return c.destTile; const D = B(c.dest); return D ? D.road : -1; }
function arriveCar(c) {
  if (c.truck) { deliverTruck(c); return; }
  if (c.through) { endCar(c); return; }
  if (c.bus) { busArrive(c); return; }
  const a = c.agent, here = c.path[c.path.length - 1];
  releaseAll(c);
  const D = B(c.dest);
  if (!D) { goHomeCar(c, here); return; }
  if (c.mode === 'lot') {
    if (D.cars < capOf(D)) {
      endCar(c); D.cars++; a.carAt = D.id; a.lotFor = c.intent;
      const I = B(c.intent); if (I) arriveAgent(a, I, 'car'); else { a.state = 'idle'; a.loc = 0; teleportHome(a); }
      return;
    }
    const I = B(c.intent); if (I) seekLot(c, here, I); else goHomeCar(c, here);
    return;
  }
  if (D.id === a.home || D.cars < capOf(D)) { endCar(c); D.cars++; a.carAt = D.id; arriveAgent(a, D, 'car'); return; }
  seekLot(c, here, D);
}
function restartCar(c, path) { c.path = path; c.i = 0; c.t = 0; c.speed = Math.min(c.speed, 10); carGeom(c); }
function seekLot(c, here, I) {
  const a = c.agent;
  let best = null, bd = 8.5;
  for (const b of buildings.values()) {
    if (BT[b.type].cat !== 'lot' || b.cars >= capOf(b) || b.road < 0) continue;
    const d = distB(b, I); if (d < bd) { bd = d; best = b; }
  }
  if (best) {
    const p = findPath(here, best.road, 'car');
    if (p) {
      c.mode = 'lot'; c.dest = best.id; c.intent = I.id;
      if (p.length < 2) { endCar(c); best.cars++; a.carAt = best.id; a.lotFor = I.id; arriveAgent(a, I, 'car'); return; }
      restartCar(c, p); return;
    }
  }
  stats.frustrated++;
  a.mood *= 0.8;
  I.parkFail = simTime; stats.lastFail = I.id;   // shows a no-parking sign over the building for a while
  const now = performance.now();
  if (now - stats.lastFrustToast > 20000) {
    stats.lastFrustToast = now;
    const id = I.id;
    toastAction(`Drivers can't park at ${BT[I.type].name} in ${DISTRICTS[districtOf(I.cx, I.cy)]}. Try a Parking Lot, Garage or Metro nearby.`, 'Show me', () => showBuilding(id));
  }
  goHomeCar(c, here);
}
function goHomeCar(c, here) {
  const a = c.agent, H = B(a.home);
  if (!H) { endCar(c); return; }
  const p = H.road >= 0 && isRoad(here) ? findPath(here, H.road, 'car') : null;
  c.mode = 'home'; c.dest = H.id; c.intent = H.id;
  if (p && p.length >= 2) { restartCar(c, p); return; }
  endCar(c); H.cars++; a.carAt = H.id;
  if (p) arriveAgent(a, H, 'car'); else { a.state = 'idle'; a.loc = 0; H.cars--; a.carAt = 0; teleportHome(a); stats.stranded++; }
}
function pathOK(c) {
  const p = c.path;
  if (!isRoad(p[c.i])) return false;
  for (let k = c.i; k < p.length - 1; k++) {
    const d = dirOf(p[k], p[k + 1]);
    if (carCost(p[k], p[k + 1], d) < 0) return false;
    if (k > c.i && overpass[p[k]] && dirOf(p[k - 1], p[k]) !== d) return false;
  }
  return destTileOf(c) === p[p.length - 1];
}
function rerouteCar(c) {
  const cur = c.path[c.i], a = c.agent;
  if (c.through || c.bus || c.truck) {
    const goal = destTileOf(c);
    const np = isRoad(cur) && goal >= 0 && isRoad(goal) ? findPath(cur, goal, 'car') : null;
    releaseAll(c);
    if (!np || np.length < 2) { if (c.bus) busArrive(c); else if (c.truck) deliverTruck(c); else endCar(c); return; }
    const oldD = c.d; c.path = np; c.i = 0; if (dirOf(np[0], np[1]) !== oldD) c.t = 0; carGeom(c);
    return;
  }
  if (!isRoad(cur)) { endCar(c); a.state = 'idle'; a.loc = 0; teleportHome(a); stats.stranded++; return; }
  const D = B(c.dest);
  if (!D || D.road < 0) { releaseAll(c); goHomeCar(c, cur); return; }
  const np = findPath(cur, D.road, 'car');
  releaseAll(c);
  if (!np) { goHomeCar(c, cur); return; }
  if (np.length < 2) { c.path = [cur]; c.i = 0; arriveCar(c); return; }
  const oldD = c.d; c.path = np; c.i = 0; if (dirOf(np[0], np[1]) !== oldD) c.t = 0; carGeom(c);
}
function validateMovers() {
  for (const c of cars) if (!c.dead && !pathOK(c)) rerouteCar(c);
  for (const b of buildings.values()) for (const c of b.queue) {
    if (c.dead || pathOK(c)) continue;
    const goal = destTileOf(c), np = (b.road >= 0 && goal >= 0) ? findPath(b.road, goal, 'car') : null;
    if (np && np.length >= 2) { c.path = np; c.i = 0; c.t = 0; carGeom(c); }
    else { c.dead = true; c.agent.car = null; b.cars++; c.agent.carAt = b.id; const a = c.agent; a.state = 'idle'; a.loc = 0; teleportHome(a); }
  }
  for (const p of peds) {
    if (p.dead || p.hidden) continue;
    let ok = true; for (let k = p.i; k < p.path.length; k++) if (!isWalk(p.path[k])) { ok = false; break; }
    if (!ok) { p.legs.length = p.leg + 1; p.dead = true; const D = B(p.dest); if (D) arriveAgent(p.agent, D, p.mode); else { p.agent.state = 'idle'; p.agent.loc = 0; teleportHome(p.agent); } }
  }
}
function trySpawn(b) {
  while (b.queue.length && b.queue[0].dead) b.queue.shift();
  if (!b.queue.length) return;
  const c = b.queue[0];
  for (const k of [tileAt(c.x, c.y), tileAt(c.x + DX[c.d] * 5, c.y + DY[c.d] * 5), tileAt(c.x - DX[c.d] * 5, c.y - DY[c.d] * 5)]) {
    const arr = bucket.get(k); if (!arr) continue;
    for (const o of arr) if (Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 4.2) return;
  }
  b.queue.shift();
  cars.push(c); carById.set(c.id, c);
  b.spawnCd = 0.45;
}

// =====================================================================
// Daily schedule
// =====================================================================
// Pick one of the k nearest places that pass `ok`, strongly favoring the closest.
function nearestPick(list, from, ok, k = 4, pw = 2) {
  const best = [];
  for (const b of list) {
    if (b === from || !ok(b)) continue;
    const d = distB(from, b);
    if (best.length < k) { best.push([d, b]); best.sort((x, y) => x[0] - y[0]); }
    else if (d < best[k - 1][0]) { best[k - 1] = [d, b]; best.sort((x, y) => x[0] - y[0]); }
  }
  if (!best.length) return null;
  const w = best.map(([d]) => 1 / Math.pow(1 + d, pw));
  let r = Math.random() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < best.length; i++) { r -= w[i]; if (r <= 0) return best[i][1]; }
  return best[0][1];
}
const openJob = b => b.workers < BT[b.type].jobs;
function setJob(a, b) {
  const old = B(a.job); if (old) old.workers--;
  a.job = b ? b.id : 0;
  if (b) b.workers++;
}
// Nobody takes a job much farther than a long commute across a district or two.
const MAX_COMMUTE = 180;
function assignJob(a) {
  const H = B(a.home); if (!H) return;
  const j = nearestPick(destWork, H, b => openJob(b) && distB(H, b) <= MAX_COMMUTE && reach(H, b), 3, 2.5);
  if (j) setJob(a, j);
}
// Every so often people notice a closer job with openings and switch to it.
function reconsiderJob(a) {
  const H = B(a.home); if (!H) return;
  const cur = B(a.job), curD = cur ? distB(H, cur) : 1e9;
  const alt = nearestPick(destWork, H, b => b.id !== a.job && openJob(b) && distB(H, b) <= MAX_COMMUTE && reach(H, b), 1);
  if (alt && distB(H, alt) < curD * 0.7 - 1) setJob(a, alt);
}
function leisure(a, from) {
  const usePark = destPark.length && Math.random() < 0.3;
  // Shops with goods on the shelf are the attractive ones; if nothing has been
  // delivered anywhere yet, people still go out.
  let shops = destCom;
  if (!usePark && destCom.some(b => (b.stock || 0) > 0)) shops = destCom.filter(b => (b.stock || 0) > 0);
  const dst = nearestPick(usePark ? destPark : shops, from, b => b.id !== from.id && reach(from, b), 4, 1.7);
  if (dst) return go(a, dst.id, 'leisure');
  return false;
}
// Through traffic: cars that enter at one road on the edge of the region and leave by another.
const THRU = ['#d9d9d9', '#b04a3a', '#3a5f8f', '#e0c060', '#5a5a5a', '#7a4f9a'];
function pickConn(exclude) {
  const ok = connections.filter(i => exclude < 0 || Math.abs(i % MW - exclude % MW) + Math.abs((i / MW | 0) - (exclude / MW | 0)) > 25);
  return ok.length ? ok[Math.floor(Math.random() * ok.length)] : -1;
}
function spawnCarAt(c) {
  carGeom(c);
  const arr = bucket.get(tileAt(c.x, c.y));
  if (arr) for (const o of arr) if (Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 4.5) return false;
  cars.push(c); carById.set(c.id, c);
  return true;
}
function spawnThrough() {
  const A = pickConn(-1); if (A < 0) return;
  const Bt = pickConn(A); if (Bt < 0) return;
  const p = findPath(A, Bt, 'car');
  if (!p || p.length < 2) return;
  spawnCarAt(newCar({through: true, destTile: Bt, path: p, speed: 16, color: THRU[Math.floor(Math.random() * THRU.length)], mode: 'through'}));
}
// ---------------------------------------------------------------------
// Resources: oil and gas fields, timber, quarrying
// ---------------------------------------------------------------------
let lastHourTick = -1;
const nearType = (b, type, r) => {
  for (const o of buildings.values()) {
    if (o.type !== type) continue;
    if (Math.abs(o.cx - b.cx) <= r && Math.abs(o.cy - b.cy) <= r) return true;
  }
  return false;
};
// ---------------------------------------------------------------------
// Moods: jobs, transport, overall and the reproductive mood that drives births
// ---------------------------------------------------------------------
const cityMood = {job: 0.7, transport: 0.7, overall: 0.7, repro: 0.55};
function jobsWanted() { let n = 0; for (const b of buildings.values()) n += BT[b.type].jobs; return n; }
function hospitalCount() { let n = 0; for (const b of buildings.values()) if (b.type === 'hospital') n++; return n; }
function updateMoods() {
  let pop = 0, employed = 0;
  for (const a of agents) { pop++; if (a.job) employed++; }
  const want = jobsWanted();
  const filled = want ? Math.min(1, employed / want) : 1;
  const job = clamp(0.35 + 0.65 * filled, 0.05, 1);
  const transport = clamp(1 - stats.ti * 0.55 - (stats.wait || 0) * 0.08, 0.05, 1);
  const cover = Math.min(1, hospitalCount() / Math.max(1, pop / 260));
  const overallBase = clamp(0.42 * job + 0.3 * transport + 0.28 * cover, 0.05, 1);
  const overall = worldSettings.difficulty === 'ideal' ? 1 : overallBase;
  const repro = clamp(0.25 + 0.6 * overall + 0.15 * cover, 0.05, 1);
  // Ideal makes residents reliably happy; other tiers react at increasing rates.
  const ease = {ideal: 1, easy: 0.1, normal: 0.22, hard: 0.38, insane: 0.58}[worldSettings.difficulty] ?? 0.22;
  if (worldSettings.difficulty === 'ideal') for (const a of agents) a.mood = 1;
  cityMood.job += (job - cityMood.job) * ease;
  cityMood.transport += (transport - cityMood.transport) * ease;
  cityMood.overall += (overall - cityMood.overall) * ease;
  cityMood.repro += (repro - cityMood.repro) * ease;
  for (const b of buildings.values()) {
    if (!BT[b.type].homes) continue;
    b.moodJob += (cityMood.job - b.moodJob) * ease;
    b.moodTransport += (cityMood.transport - b.moodTransport) * ease;
    b.moodOverall += (cityMood.overall - b.moodOverall) * ease;
    b.moodRepro += (cityMood.repro - b.moodRepro) * ease;
    b.mood = b.moodOverall;
  }
}
// Births are capped by hospital capacity, so a growing city needs more beds.
function birthFactor() {
  const pop = Math.max(1, agents.length);
  const cover = Math.min(1, hospitalCount() * 260 / pop);
  return clamp(0.15 + 0.85 * cityMood.repro * (0.4 + 0.6 * cover), 0, 1.4);
}
function hourTick() {
  // Production is accounted for by producer stock and item-specific storage;
  // it changes numbers, not art, so no tiles need redrawing here.
  updateMoods();
  if (typeof logisticsHour === 'function') logisticsHour();
}
function minuteTick() {
  const h = (gameMin / 60) % 24, day = Math.floor(gameMin / 1440);
  const hourNow = Math.floor(gameMin / 60);
  weatherTick();
  if (hourNow !== lastHourTick) { lastHourTick = hourNow; hourTick(); maybeFire(4); }
  maybeCrash();
  for (const b of buildings.values()) {
    const d = BT[b.type];
    b.asleep = 0;
    if (d.homes && b.residents < d.homes && (b.road >= 0 || b.walk >= 0) && Math.random() < 0.25 * birthFactor()) addAgent(b);
  }
  if (connections.length >= 2) {
    const f = (h >= 7 && h < 9.5) || (h >= 16 && h < 19) ? 1.6 : (h >= 6 && h < 22) ? 1 : 0.25;
    for (let r = 0.06 * Math.min(12, connections.length) * f; r > 0; r--) if (Math.random() < r) spawnThrough();
  }
  if (h > 5.5 && h < 23.5 && airports.length && planes.length < planeCap()) {
    // A lone airport is a quiet airfield: a flight every few game hours, and
    // almost never a visitor. Two or more airports keep each other busy.
    const busy = airports.length > 1;
    for (const ap of airports) {
      if (planes.length >= planeCap()) break;
      if (Math.random() < (busy ? 1 / 60 : 1 / 260)) spawnDeparture(ap);
      if (Math.random() < (busy ? 1 / 240 : 1 / 900)) spawnArrival(ap);  // flights from outside the region
    }
  }
  for (const dk of docks) {
    if (boats.length >= 40) break;
    if (Math.random() < 1 / 40) spawnBoat(dk, false);
    if (Math.random() < 1 / 40) spawnBoat(dk, true);
  }
  for (const a of agents) {
    if (a.dead || a.state !== 'idle') continue;
    const late = h >= a.bed - 0.5 || h < 4;
    if (a.loc === a.home) {
      if (asleepAt(a, h)) { const H = B(a.home); if (H) H.asleep++; continue; }
      if (h >= Math.max(6, wakeToday(a)) && h < 11 && a.worked !== day && a.worker) {
        if (Math.random() < 0.0075) {
          a.worked = day;
          if (!a.job) assignJob(a);
          else if (Math.random() < 0.4) reconsiderJob(a);
          if (a.job) go(a, a.job, 'work');
        }
      } else if (h >= 9 && h < Math.min(21, a.bed - 1.5) && Math.random() < 0.0013) {
        leisure(a, B(a.home));
      }
    } else {
      if (!late && gameMin < a.stayUntil) continue;
      const L = B(a.loc);
      if (!L) { a.loc = 0; teleportHome(a); continue; }
      if (!late && L.id === a.job && h < Math.min(20, a.bed - 2) && Math.random() < 0.2) { if (leisure(a, L)) continue; }
      go(a, a.home, 'home');
    }
  }
  // every ten minutes, each home's mood is the average of its residents
  if (Math.floor(gameMin) % 10 === 0) {
    const sum = new Map();
    for (const a of agents) { const s = sum.get(a.home); if (s) { s[0] += a.mood; s[1]++; } else sum.set(a.home, [a.mood, 1]); }
    for (const [id, s] of sum) { const b = B(id); if (b) b.mood = s[0] / s[1]; }
  }
}

// =====================================================================
// Planes and boats
// =====================================================================
function wrapAng(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
// Crews steer around a thunderstorm instead of flying through it. When a cell
// blocks the way to where an aircraft is going, it is given a point on the far
// side of the cell, well clear of its edge, and flies that instead: it slips
// past the storm and then carries on toward its goal. This never turns into an
// orbit, because the goal, not the aircraft's own heading, picks the side.
function stormAim(p, goal) {
  if (!weatherCells.length) return null;
  const R = WX_R * T;
  let ux = goal.x - p.x, uy = goal.y - p.y;
  const ul = Math.hypot(ux, uy);
  if (ul < 1) return null;
  ux /= ul; uy /= ul;
  let best = null, bd = Infinity;
  for (const c of weatherCells) {
    if (c.kind !== 'storm') continue;
    const dx = c.x * T - p.x, dy = c.y * T - p.y;
    const along = ux * dx + uy * dy;
    if (along < 0 || along > ul) continue;        // not between us and the goal
    const side = ux * dy - uy * dx;
    if (Math.abs(side) > R) continue;             // this track passes clear
    if (along < bd) { bd = along; best = {cx: c.x * T, cy: c.y * T, side}; }
  }
  if (!best) return null;
  // step around the cell on the free side, a little beyond its middle, but
  // never aim outside the region: a detour must not fly an aircraft off the map
  const lat = R * 1.7 * (best.side >= 0 ? -1 : 1);
  return {x: clamp(best.cx + ux * R * 0.2 - uy * lat, 300, FW - 300),
          y: clamp(best.cy + uy * R * 0.2 + ux * lat, 300, FH - 300)};
}
function turnToward(p, target, dt, rate = 0.9) { p.ang += clamp(wrapAng(target - p.ang), -rate * dt, rate * dt); }
function runway(ap) { return {x0: ap.x * T + 6, x1: ap.x * T + 84, y: ap.y * T + 8.5}; }
let nextPlaneId = 1;
// The most aircraft allowed in the air at once. One airport is a quiet
// airfield; more airports means a busier sky.
const planeCap = () => airports.length > 1 ? 3 + airports.length * 2 : 2;
const onRunway = q => q.phase === 'roll' || q.phase === 'landroll' || q.phase === 'final';
const wantsToLand = q => q.phase === 'inbound' || q.phase === 'hold';
function runwayFree(apId, except) {
  return !planes.some(q => q !== except && q.ap === apId && onRunway(q));
}
// Who may land next: among the aircraft actually waiting at this airport, the
// one that got here first. An aircraft still crossing the region is not in the
// queue yet, so it can never hold up one that is already circling.
function firstToLand(apId) {
  let best = null;
  for (const q of planes) {
    if (!wantsToLand(q) || q.ap !== apId || !q.queued) continue;
    if (!best || q.arrived < best.arrived || (q.arrived === best.arrived && q.id < best.id)) best = q;
  }
  return best;
}
// Somewhere over the region, well clear of where the aircraft already is, and
// not under a thunderstorm: a crew would not pick a storm to fly into.
function pickWaypoint(p) {
  for (let k = 0; k < 16; k++) {
    const x = 300 + Math.random() * Math.max(1, FW - 600);
    const y = 300 + Math.random() * Math.max(1, FH - 600);
    if (Math.hypot(x - p.x, y - p.y) <= 600) continue;
    if (weatherCells.length && weatherAt(x / T, y / T) === 'storm') continue;
    return {x, y};
  }
  return {x: Math.random() * FW, y: Math.random() * FH};
}
// A flight starts as a departure roll from a runway. With a second airport in
// the region most flights cross to it; otherwise the aircraft tours the city and
// comes back to the airport it left from.
function spawnDeparture(ap) {
  if (!ap || ap.type !== 'airport') return null;
  const r = runway(ap);
  if (!runwayFree(ap.id, null)) return null;
  // at most one aircraft of its own out and one on the way in
  if (planes.filter(q => q.ap === ap.id && q.phase !== 'landroll').length >= 2) return null;
  const others = airports.filter(a => a.id !== ap.id);
  const cross = others.length > 0 && Math.random() < 0.85;
  const dest = cross ? others[(Math.random() * others.length) | 0] : ap;
  const p = {id: nextPlaneId++, x: r.x0, y: r.y, ang: 0, speed: 0, alt: 0, phase: 'roll',
    ap: ap.id, from: ap.id, dest: dest.id, cross, wp: null, legs: 0, queued: false, finalT: 0,
    tour: 1 + (Math.random() * 2 | 0), air: 0, arrived: 0, t0: simTime, dead: false};
  planes.push(p);
  return p;
}
function setApproach(p, ap) {
  const r = runway(ap);
  p.ap = ap.id; p.tx = r.x0 - 40 * T; p.ty = r.y;
  p.queued = false; p.arrived = 0;   // joins the landing queue on reaching the pattern
}
// A visitor from outside the region joins the same queue as everybody else.
function spawnArrival(ap) {
  if (!ap || ap.type !== 'airport') return null;
  const r = runway(ap), side = Math.floor(Math.random() * 4);
  const x = side === 0 ? -40 : side === 1 ? FW + 40 : Math.random() * FW;
  const y = side === 2 ? -40 : side === 3 ? FH + 40 : Math.random() * FH;
  const p = {id: nextPlaneId++, x, y, ang: Math.atan2(r.y - y, r.x0 - 40 * T - x), speed: 62, alt: 22,
    phase: 'inbound', ap: ap.id, from: 0, dest: ap.id, cross: false, wp: null, legs: 0, tour: 1,
    air: 0, arrived: 0, queued: false, finalT: 0, t0: simTime, dead: false};
  setApproach(p, ap);
  planes.push(p);
  return p;
}
// Holding: fly a circle around the approach fix, staying a fixed distance out,
// until it is this aircraft's turn to land.
function holdCircle(p, dt) {
  const R = 110, speed = 55;
  // chase a point that walks around the circle at the aircraft's own speed, so
  // the turn radius stays R and the pattern never drifts off the fix
  const a = Math.atan2(p.y - p.ty, p.x - p.tx) + speed / R * dt;
  const tx = p.tx + Math.cos(a) * R, ty = p.ty + Math.sin(a) * R;
  turnToward(p, Math.atan2(ty - p.y, tx - p.x), dt, 2.2);
  p.speed = speed;
  p.alt = Math.min(22, p.alt + 4 * dt);
  p.x += Math.cos(p.ang) * p.speed * dt;
  p.y += Math.sin(p.ang) * p.speed * dt;
}
function stepPlanes(dt) {
  for (const p of planes) {
    const ap = B(p.ap), r = ap && ap.type === 'airport' ? runway(ap) : null;
    const move = () => { p.x += Math.cos(p.ang) * p.speed * dt; p.y += Math.sin(p.ang) * p.speed * dt; };
    // last resort: a flight that never finds a way down is diverted away
    if (p.t0 && simTime - p.t0 > 420 && p.phase !== 'fall') { p.dead = true; continue; }
    // Thunderstorms are dangerous to fly through. The roll happens once per
    // storm entered, not once per frame, so the odds are the same whether the
    // aircraft clips an edge or spends a minute inside.
    if (p.phase !== 'fall' && p.phase !== 'landroll' && p.alt > 2) {
      const stormy = stormAt(p.x / T, p.y / T);
      if (stormy && !p.inStorm) {
        p.inStorm = true;
        if (Math.random() < planeCrashChance()) { p.phase = 'fall'; p.fallT = 0; continue; }
      } else if (!stormy) p.inStorm = false;
    }
    if (p.phase === 'fall') {
      // a spinning dive, then the wreck on the ground below
      p.fallT += dt;
      p.alt = Math.max(0, p.alt - (10 + p.fallT * 26) * dt);
      p.ang += (2.6 + p.fallT) * dt;
      p.speed = Math.max(26, p.speed - 6 * dt);
      move();
      if (p.alt <= 0) { planeCrash(p.x / T, p.y / T); p.dead = true; }
      continue;
    }
    if (p.phase === 'roll') {
      if (!r) { p.dead = true; continue; }
      p.speed = Math.min(50, p.speed + 13 * dt); p.x += p.speed * dt;
      if (p.speed >= 42 || p.x > r.x1) p.phase = 'climb';
    } else if (p.phase === 'climb') {
      p.speed = Math.min(64, p.speed + 8 * dt); p.alt = Math.min(22, p.alt + 6 * dt);
      move();
      if (p.alt >= 22) {
        const dap = p.cross ? B(p.dest) : null;
        if (!dap || dap.type !== 'airport') { p.cross = false; p.dest = p.ap; }
        p.wp = pickWaypoint(p);
        p.phase = 'cruise';
      }
    } else if (p.phase === 'cruise') {
      p.air += dt;
      // a tour of the city does not last forever: head home once it is long enough
      if (!p.cross && p.air > 70) {
        const home = B(p.ap);
        if (home && home.type === 'airport') { setApproach(p, home); p.phase = 'inbound'; continue; }
        p.dead = true; continue;
      }
      const dap = p.cross ? B(p.dest) : null;
      if (p.cross && (!dap || dap.type !== 'airport')) { p.cross = false; p.dest = p.ap; }
      let tgt = p.wp;
      if (p.cross && dap) { const rr = runway(dap); tgt = {x: rr.x0 - 40 * T, y: rr.y}; }
      if (!tgt) { tgt = p.wp = pickWaypoint(p); }
      const detour = stormAim(p, tgt) || tgt;
      turnToward(p, Math.atan2(detour.y - p.y, detour.x - p.x), dt, detour === tgt ? 0.6 : 1);
      move();
      if (p.x < -400 || p.y < -400 || p.x > FW + 400 || p.y > FH + 400) { p.dead = true; continue; }
      if (Math.hypot(tgt.x - p.x, tgt.y - p.y) < 130) {
        if (p.cross && dap) { setApproach(p, dap); p.phase = 'inbound'; continue; }
        p.legs++;
        p.wp = null;
        if (p.legs >= p.tour || p.air > 70) {
          const home = B(p.ap);
          if (home && home.type === 'airport') { setApproach(p, home); p.phase = 'inbound'; }
          else p.dead = true;
        }
      }
    } else if (p.phase === 'inbound') {
      if (!r) { p.phase = 'cruise'; p.cross = false; p.wp = null; continue; }
      const d = Math.hypot(p.tx - p.x, p.ty - p.y);
      // reaching the pattern is what puts an aircraft in the landing queue
      if (!p.queued && d < 260) { p.queued = true; p.arrived = simTime; }
      const first = firstToLand(p.ap);
      const busy = !runwayFree(p.ap, p) || (first !== null && first !== p);
      if (busy && d < 300) { p.phase = 'hold'; p.queued = true; p.arrived = p.arrived || simTime; continue; }
      // slow and tighten the turn on the last stretch, or the aircraft can end
      // up flying circles around the fix it is trying to reach
      p.speed = d < 150 ? 46 : 64;
      // far from the airport an arrival still has room to vector around weather;
      // on the last stretch it has to stay on the centreline
      const detour = d > 350 ? stormAim(p, {x: p.tx, y: p.ty}) : null;
      turnToward(p, Math.atan2((detour ? detour.y : p.ty) - p.y, (detour ? detour.x : p.tx) - p.x), dt, detour ? 1 : d < 150 ? 1.6 : 0.9);
      p.alt = Math.min(22, p.alt + 4 * dt);
      move();
      if (d < 55) { p.phase = busy ? 'hold' : 'final'; p.finalT = 0; }
    } else if (p.phase === 'hold') {
      if (!r) { p.phase = 'cruise'; p.cross = false; p.wp = null; continue; }
      if (runwayFree(p.ap, p) && firstToLand(p.ap) === p) { p.phase = 'inbound'; continue; }
      holdCircle(p, dt);
    } else if (p.phase === 'final') {
      if (!r) { p.phase = 'cruise'; p.cross = false; p.wp = null; continue; }
      p.finalT = (p.finalT || 0) + dt;
      // aim well past the threshold: pure pursuit of a near point makes an
      // aircraft snake down the approach instead of settling on the centreline
      turnToward(p, Math.atan2(r.y - p.y, r.x1 + 120 - p.x), dt, 1.2);
      p.speed = Math.max(40, p.speed - 6 * dt); move();
      p.alt = clamp((r.x0 - p.x) / (40 * T) * 22, 0, 22);
      if (p.x >= r.x0 && p.x <= r.x1 + 20 && Math.abs(p.y - r.y) < 34) { p.y = r.y; p.ang = 0; p.alt = 0; p.phase = 'landroll'; }
      // overshot the runway, or never got lined up: climb away and come round again
      else if (p.x > r.x1 + 20 || p.finalT > 22) {
        p.phase = 'inbound'; p.speed = 64; p.alt = 12; p.finalT = 0; p.queued = false;
      }
    } else if (p.phase === 'landroll') {
      p.speed = Math.max(0, p.speed - 16 * dt); p.x += p.speed * dt;
      if (p.speed <= 2 || (r && p.x > r.x1)) p.dead = true;
    }
  }
  if (planes.some(p => p.dead)) planes = planes.filter(p => !p.dead);
}
// Boats leave docks for a far point on the same body of water, and others sail in.
const wStamp = new Uint32Array(N), wPrev = new Int32Array(N); let wId = 0;
function waterTrip(start) {
  wId++; const q = [start]; wStamp[start] = wId; wPrev[start] = -1; const edges = [];
  for (let h = 0; h < q.length && q.length < 80000; h++) {
    const u = q[h], x = u % MW, y = u / MW | 0;
    if (x === 0 || y === 0 || x === MW - 1 || y === MH - 1) edges.push(u);
    for (let d = 1; d <= 4; d++) { const v = nb(u, d); if (v >= 0 && water[v] && wStamp[v] !== wId) { wStamp[v] = wId; wPrev[v] = u; q.push(v); } }
  }
  if (q.length < 25) return null;
  const target = edges.length && Math.random() < 0.6 ? edges[Math.floor(Math.random() * edges.length)] : q[Math.floor(q.length * (0.55 + Math.random() * 0.45)) - 1];
  const path = []; for (let k = target; k !== -1; k = wPrev[k]) path.push(k);
  return path.reverse();
}
function spawnBoat(dk, inbound) {
  if (!dk.art || !dk.art.berth) return;
  const s = (dk.y + dk.art.berth[1]) * MW + dk.x + dk.art.berth[0];
  if (!water[s]) return;
  const p = waterTrip(s); if (!p || p.length < 6) return;
  if (inbound) p.reverse();
  boats.push({path: p, i: 0, t: 0, x: 0, y: 0, d: 2, speed: 6 + Math.random() * 3, color: pick(['#f4f5f7', '#f1c40f', '#e74c3c', '#3498db'], Math.random()), dead: false});
}
function stepBoats(dt) {
  for (const b of boats) {
    b.t += b.speed * dt / T;
    while (b.t >= 1) { b.t -= 1; b.i++; }
    if (b.i >= b.path.length - 1 || !water[b.path[b.i]]) { b.dead = true; continue; }
    const a = b.path[b.i], c = b.path[b.i + 1];
    b.x = ((a % MW) + ((c % MW) - (a % MW)) * b.t) * T + 4.5; b.y = ((a / MW | 0) + ((c / MW | 0) - (a / MW | 0)) * b.t) * T + 4.5; b.d = dirOf(a, c);
  }
  if (boats.some(b => b.dead)) boats = boats.filter(b => !b.dead);
}

// =====================================================================
// Simulation step
// =====================================================================
let heatTimer = 0, sampleTimer = 0, histTimer = 0;
// Area congestion field: road heat blurred over the neighborhood, divided by road density,
// so each spot shows the average congestion of the streets around it.
const fA = new Float32Array(N), fR = new Float32Array(N), fT = new Float32Array(N);
function boxBlur(src, r) {
  const k = 1 / ((2 * r + 1) * (2 * r + 1));
  for (let y = 0; y < MH; y++) {
    const row = y * MW; let s = 0;
    for (let x = 0; x <= r && x < MW; x++) s += src[row + x];
    for (let x = 0; x < MW; x++) { fT[row + x] = s; const a = x + r + 1, b = x - r; if (a < MW) s += src[row + a]; if (b >= 0) s -= src[row + b]; }
  }
  for (let x = 0; x < MW; x++) {
    let s = 0;
    for (let y = 0; y <= r && y < MH; y++) s += fT[y * MW + x];
    for (let y = 0; y < MH; y++) { src[y * MW + x] = s * k; const a = y + r + 1, b = y - r; if (a < MH) s += fT[a * MW + x]; if (b >= 0) s -= fT[b * MW + x]; }
  }
}
const areaCv = mk(MW, MH), actx = areaCv.getContext('2d'), areaImg = actx.createImageData(MW, MH);
function heatRGB(v) {
  v = Math.max(0, Math.min(1, v));
  return v < 0.5 ? [60 + 380 * v, 200 + 20 * v, 90 - 60 * v] : [250 - 30 * (v - 0.5), 210 - 300 * (v - 0.5), 60 - 20 * (v - 0.5)];
}
function computeArea() {
  for (let i = 0; i < N; i++) { const r = isRoad(i) ? 1 : 0; fR[i] = r; fA[i] = r ? heat[i] : 0; }
  boxBlur(fA, 3); boxBlur(fA, 3); boxBlur(fR, 3); boxBlur(fR, 3);
  const d = areaImg.data;
  for (let i = 0; i < N; i++) {
    const v = fR[i] > 0.002 ? fA[i] / fR[i] : 0, p = Math.min(1, fR[i] * 6);
    areaHeat[i] = v; areaPres[i] = p;
    const o = i * 4;
    if (p < 0.03) { d[o + 3] = 0; continue; }
    const [r, g, b] = heatRGB(v / 1.2);
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.round(p * 165);
  }
  actx.putImageData(areaImg, 0, 0);
}
function simStep(dt) {
  simTime += dt;
  const prev = gameMin; gameMin += dt * MIN_PER_SEC;
  const ticks = Math.min(3, Math.floor(gameMin) - Math.floor(prev));
  for (let k = 0; k < ticks; k++) minuteTick();
  buildBuckets();
  for (const b of buildings.values()) if (b.queue.length) { b.spawnCd -= dt; if (b.spawnCd <= 0) trySpawn(b); }
  for (const c of cars) if (!c.dead) stepCar(c, dt);
  for (const p of peds) if (!p.dead) stepPed(p, dt);
  stepPlanes(dt); stepBoats(dt); stepBusStops(dt); stepMetros(dt); stepMetroWait(); stepIncidents(dt);
  stepWeather(dt); if (typeof stepLogistics === 'function') stepLogistics(dt);
  if (cars.some(c => c.dead)) cars = cars.filter(c => !c.dead);
  if (agentsDirty) { agentsDirty = false; agents = agents.filter(a => !a.dead); recount(); }
  if (peds.some(p => p.dead)) peds = peds.filter(p => !p.dead);
  heatTimer += dt;
  if (heatTimer >= 0.5) {
    for (let i = 0; i < N; i++) { if (heat[i] || heatAcc[i]) { heat[i] = heat[i] * 0.82 + (heatAcc[i] / heatTimer) * 0.18; if (heat[i] < 0.01) heat[i] = 0; heatAcc[i] = 0; } }
    heatTimer = 0;
  }
  sampleTimer += dt;
  if (sampleTimer >= 1) {
    const ti = stats.tiN ? stats.tiAcc / stats.tiN : 0;
    stats.ti = stats.ti * 0.7 + ti * 0.3;
    stats.wait = stats.waitN / Math.max(1, sampleTimer * 30);
    stats.tiAcc = 0; stats.tiN = 0; stats.waitN = 0; sampleTimer = 0;
  }
  histTimer += dt;
  if (histTimer >= 2) { histTimer = 0; stats.hist.push({ti: stats.ti, cars: cars.length}); if (stats.hist.length > 115) stats.hist.shift(); }
}
