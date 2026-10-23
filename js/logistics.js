'use strict';
// =====================================================================
// Logistics: trucks, ports, distribution terminals and freight trains
//
// Producers (farms, quarries, fisheries, rigs, logging camps) build up a
// stock of goods. Trucks carry it to shops, or to a distribution terminal or
// port. Ports send cargo ships to other ports and to the edge of the region.
// Freight trains run on surface tracks between yards (and track-served
// terminals), made of 12-18 cars in runs of three of the same kind. Passenger
// cars take riders between metro stations that stand beside the line.
// =====================================================================
const PRODUCER = {
  farm:        {good: 'produce', rate: 7, cap: 90},
  orchard:     {good: 'produce', rate: 5, cap: 70},
  greenhouse:  {good: 'produce', rate: 3, cap: 50},
  fishery:     {good: 'fish',    rate: 5, cap: 70},
  seafoodPlant:{good: 'fish',    rate: 4, cap: 70},
  quarry:      {good: 'stone',   rate: 8, cap: 100},
  mine:        {good: 'ore',     rate: 8, cap: 100},
  loggingCamp: {good: 'timber',  rate: 6, cap: 80},
  oilRig:      {good: 'oil',     rate: 6, cap: 80},
  gasWell:     {good: 'gas',     rate: 6, cap: 80},
};
const GOOD_NAME = {produce: 'Produce', fish: 'Fish', stone: 'Stone', ore: 'Ore', timber: 'Timber', oil: 'Oil', gas: 'Gas', goods: 'Goods'};
const TRUCK_CAP = 20;
const SHOP_STOCK_CAP = 60;
const HUB_STOCK_CAP = 160;
const cargoStats = {deliveries: 0, shipped: 0, moved: 0, trainRuns: 0};
let truckTimer = 0, shipTimer = 0;
let logisticsReady = false;

const stockLimit = b => (b.type === 'port' || b.type === 'distribution' || b.type === 'railyard') ? HUB_STOCK_CAP
  : BT[b.type].cat === 'com' ? SHOP_STOCK_CAP : ((PRODUCER[b.type] && PRODUCER[b.type].cap) || 40);
const producerOf = b => PRODUCER[b.type] || null;

function resetLogistics() {
  ships.length = 0;
  freight.length = 0;
  cargoStats.deliveries = 0; cargoStats.shipped = 0; cargoStats.moved = 0; cargoStats.trainRuns = 0;
  truckTimer = 0; shipTimer = 0;
  logisticsReady = false;
}

// A shop takes whatever is on the shelf; a distributed "goods" load is welcome
// anywhere. Raw goods only go to the shops that sell that produce.
function acceptsGood(b, good) {
  if (good === 'goods') return BT[b.type].cat === 'com';
  if (b.type === 'distribution' || b.type === 'port' || b.type === 'warehouse' || b.type === 'railyard') return true;
  const t = b.type;
  if (good === 'fish') return t === 'seafoodMarket' || t === 'market' || t === 'mall' || t === 'shop';
  if (good === 'produce') return t === 'market' || t === 'mall' || t === 'shop' || t === 'seafoodMarket';
  return false;
}

function syncLogistics() {
  for (const b of buildings.values()) {
    if (b.stock === undefined) b.stock = producerOf(b) ? 8 : BT[b.type].cat === 'com' ? 24 : 0;
    if (b.truckCd === undefined) b.truckCd = 0;
  }
  logisticsReady = true;
  syncFreight();
}

// ---------------------------------------------------------------------
// Freight tracks
//
// A separate, surface network from the metro tunnels: one tool draws it, the
// connection mask is rebuilt on every edit, and any two yards joined by track
// can exchange a train. Track may cross a street at grade, so a line can reach
// a yard on the far side of a road without breaking the road network.
// ---------------------------------------------------------------------
function relinkTrack() {
  track.fill(0);
  for (let i = 0; i < N; i++) {
    if (!trackOn[i]) continue;
    let m = 0;
    for (let d = 1; d <= 4; d++) { const j = nb(i, d); if (j >= 0 && trackOn[j]) m |= bit(d); }
    track[i] = m;
  }
}
const tqPath = new Int32Array(N), tqPrev = new Int32Array(N), tqSeen = new Uint32Array(N);
let tqGen = 0;
function trackPath(from, to) {
  if (from === to) return [from];
  if (!track[from] || !track[to]) return null;
  tqGen++;
  let qh = 0, qt = 0;
  tqSeen[from] = tqGen; tqPrev[from] = -1; tqPath[qt++] = from;
  while (qh < qt) {
    const u = tqPath[qh++];
    if (u === to) break;
    const m = track[u];
    for (let d = 1; d <= 4; d++) {
      if (!(m & bit(d))) continue;
      const v = nb(u, d);
      if (v < 0 || tqSeen[v] === tqGen || !track[v]) continue;
      tqSeen[v] = tqGen; tqPrev[v] = u; tqPath[qt++] = v;
    }
  }
  if (tqSeen[to] !== tqGen) return null;
  const out = [];
  for (let k = to; k !== -1; k = tqPrev[k]) out.push(k);
  return out.reverse();
}

// ---------------------------------------------------------------------
// Trucks
// ---------------------------------------------------------------------
function roadTileOf(b) {
  if (b.road >= 0 && tile[b.road] === 1) return b.road;
  return perimeter(b.x, b.y, b.w, b.h).find(i => tile[i] === 1) ?? -1;
}
function findCustomer(p, good) {
  const from = roadTileOf(p);
  if (from < 0) return null;
  const comp = compR[from];
  let best = null, bd = Infinity, bestPri = 99;
  for (const b of buildings.values()) {
    if (b === p || !acceptsGood(b, good)) continue;
    if (b.stock >= stockLimit(b)) continue;
    const r = roadTileOf(b);
    if (r < 0 || compR[r] !== comp) continue;
    const d = distB(p, b);
    if (d > 170) continue;
    // Sorted goods prefer shops, so a terminal does not bounce a load to
    // another terminal forever; raw goods prefer the shop that sells them.
    const isShop = BT[b.type].cat === 'com';
    const isHub = b.type === 'distribution' || b.type === 'port' || b.type === 'warehouse' || b.type === 'railyard';
    const pri = good === 'goods' ? (isShop ? 0 : 1) : (isHub ? 1 : 0);
    if (pri < bestPri || (pri === bestPri && d < bd)) { bestPri = pri; bd = d; best = b; }
  }
  return best;
}
function sendTruck(from, to, good, amount, color) {
  if (!from || !to || amount <= 0) return false;
  const a = roadTileOf(from), b = roadTileOf(to);
  if (a < 0 || b < 0 || compR[a] !== compR[b]) return false;
  const path = a === b ? [a] : findPath(a, b, 'car');
  if (!path || path.length < 1) return false;
  from.stock = Math.max(0, from.stock - amount);
  if (path.length < 2) {
    to.stock = Math.min(stockLimit(to), to.stock + amount);
    cargoStats.deliveries++; cargoStats.moved += amount;
    return true;
  }
  const c = newCar({truck: true, cargo: {good, amount}, dest: to.id, intent: to.id, path,
    color: color || '#ddd6c2', max: 18});
  carGeom(c);
  if (!spawnCarAt(c)) { from.stock += amount; return false; }
  return true;
}
function deliverTruck(c) {
  const D = B(c.dest);
  if (D && c.cargo) {
    D.stock = Math.min(stockLimit(D), (D.stock || 0) + c.cargo.amount);
    cargoStats.deliveries++; cargoStats.moved += c.cargo.amount;
  }
  endCar(c);
}
function dispatchTrucks() {
  let trucks = 0;
  for (const c of cars) if (c.truck) trucks++;
  if (trucks >= 70) return;
  // producers send their own goods first
  for (const b of buildings.values()) {
    if (b.road < 0 || b.truckCd > 0) continue;
    const p = producerOf(b);
    if (!p || b.stock < 10) continue;
    const to = findCustomer(b, p.good);
    if (!to) continue;
    const amount = Math.min(TRUCK_CAP, Math.floor(b.stock));
    if (sendTruck(b, to, p.good, amount)) { b.truckCd = 5 + Math.random() * 4; if (++trucks >= 70) return; }
  }
  // terminals and ports send sorted goods on to the shops
  for (const b of buildings.values()) {
    if (b.road < 0 || b.truckCd > 0) continue;
    if (b.type !== 'distribution' && b.type !== 'port' && b.type !== 'railyard') continue;
    if (b.stock < 12) continue;
    const to = findCustomer(b, 'goods');
    if (!to) continue;
    const amount = Math.min(TRUCK_CAP, Math.floor(b.stock));
    if (sendTruck(b, to, 'goods', amount, '#cfe0ef')) { b.truckCd = 7 + Math.random() * 5; if (++trucks >= 70) return; }
  }
}

// ---------------------------------------------------------------------
// Ports and ships
// ---------------------------------------------------------------------
function waterNeighbour(b) {
  for (const i of perimeter(b.x, b.y, b.w, b.h)) if (water[i]) return i;
  return -1;
}
function waterPath(from, to) {
  if (from < 0 || to < 0 || !water[from] || !water[to]) return null;
  if (from === to) return [from];
  shGen++;
  let qh = 0, qt = 0;
  shQ[qt++] = from; shSeen[from] = shGen; shPrev[from] = -1;
  while (qh < qt) {
    const u = shQ[qh++];
    if (u === to) break;
    for (let d = 1; d <= 4; d++) {
      const v = nb(u, d);
      if (v < 0 || shSeen[v] === shGen || !water[v]) continue;
      shSeen[v] = shGen; shPrev[v] = u; shQ[qt++] = v;
    }
  }
  if (shSeen[to] !== shGen) return null;
  const out = [];
  for (let k = to; k !== -1; k = shPrev[k]) out.push(k);
  return out.reverse();
}
const shQ = new Int32Array(N), shSeen = new Uint32Array(N), shPrev = new Int32Array(N);
let shGen = 0;
function exportTile(b) {
  // Any water tile on the edge of the region: a ship sails off the map there.
  const berth = waterNeighbour(b);
  if (berth < 0) return -1;
  let best = -1, bd = Infinity, q = [berth];
  shGen++; shSeen[berth] = shGen;
  for (let h = 0; h < q.length; h++) {
    const u = q[h], x = u % MW, y = u / MW | 0;
    if (x === 0 || y === 0 || x === MW - 1 || y === MH - 1) {
      const d = Math.abs(x - b.cx) + Math.abs(y - b.cy);
      if (d < bd) { bd = d; best = u; }
    }
    for (let d = 1; d <= 4; d++) {
      const v = nb(u, d);
      if (v >= 0 && water[v] && shSeen[v] !== shGen) { shSeen[v] = shGen; q.push(v); }
    }
    if (q.length > 60000) break;
  }
  return best;
}
function launchShip(port) {
  const from = waterNeighbour(port);
  if (from < 0) return false;
  const others = ports.filter(p => p !== port && waterNeighbour(p) >= 0);
  let to = -1, destPort = null, path = null;
  const order = others.sort((a, b) => distB(port, a) - distB(port, b));
  for (const p of order) {
    const t = waterNeighbour(p);
    if (t < 0) continue;
    const pp = waterPath(from, t);
    if (pp && pp.length >= 4) { to = t; destPort = p; path = pp; break; }
  }
  if (!path) {
    to = exportTile(port);
    path = to >= 0 ? waterPath(from, to) : null;
  }
  if (!path || path.length < 4) return false;
  const amount = Math.min(60, Math.floor(port.stock));
  if (amount < 8) return false;
  port.stock -= amount;
  ships.push({path, i: 0, t: 0, x: 0, y: 0, d: 2, speed: 5 + Math.random() * 2,
    cargo: {good: 'goods', amount}, destPort: destPort ? destPort.id : 0,
    color: pick(['#f4f5f7', '#d8e4f0', '#e8d8b8'], Math.random()), dead: false});
  return true;
}
function stepShips(dt) {
  for (const s of ships) {
    s.t += (s.speed || 6) * dt / T;
    while (s.t >= 1) { s.t -= 1; s.i++; }
    if (s.i >= s.path.length - 1 || !water[s.path[s.i]]) { s.dead = true; continue; }
    const a = s.path[s.i], c = s.path[s.i + 1];
    s.x = ((a % MW) + ((c % MW) - (a % MW)) * s.t) * T + 4.5;
    s.y = ((a / MW | 0) + ((c / MW | 0) - (a / MW | 0)) * s.t) * T + 4.5;
    s.d = dirOf(a, c);
    if (s.i >= s.path.length - 2) {
      // arrived: unload at the other port, or the cargo leaves the region
      const P = B(s.destPort);
      if (P) P.stock = Math.min(stockLimit(P), (P.stock || 0) + s.cargo.amount);
      else cargoStats.shipped += s.cargo.amount;
      if (P) cargoStats.moved += s.cargo.amount;
      s.dead = true;
    }
  }
  if (ships.some(s => s.dead)) ships = ships.filter(s => !s.dead);
}

// ---------------------------------------------------------------------
// Freight trains
// ---------------------------------------------------------------------
const FREIGHT_SPEED = 7;
function freightConsist() {
  const total = 3 * (4 + Math.floor(Math.random() * 3));   // 12, 15 or 18 cars
  // One group of each kind is guaranteed, so every train can move people as
  // well as solids, liquids and gas; the remaining groups are random.
  const kinds = ['passenger', 'material', 'liquid', 'gas'];
  const groups = kinds.slice();
  while (groups.length * 3 < total) groups.push(kinds[Math.floor(Math.random() * kinds.length)]);
  shuffle(groups, Math.random);
  return groups.flatMap(k => [k, k, k]);
}
function yardTrack(b) {
  if (!b) return -1;
  const per = perimeter(b.x, b.y, b.w, b.h);
  return per.find(i => trackOn[i]) ?? -1;
}
function partnerYard(y) {
  const mine = yardTrack(y);
  if (mine < 0) return null;
  const list = [];
  for (const o of buildings.values()) {
    if (o.type !== 'railyard' && o.type !== 'distribution') continue;
    if (o.id === y.id) continue;
    const t = yardTrack(o);
    if (t < 0) continue;
    const p = trackPath(mine, t);
    if (p && p.length > 1) list.push({b: o, d: distB(y, o), path: p});
  }
  if (!list.length) return null;
  list.sort((a, b) => a.d - b.d);
  return list[0];
}
function retireFreight(t) {
  t.dead = true;
  for (const p of t.riders) if (!p.dead) { p.riding = false; p.hidden = false; p.ride = 0; nextLeg(p); }
  t.riders = [];
}
function syncFreight() {
  for (const t of freight) {
    const a = B(t.home), b = B(t.partner);
    if (!a || !b || a.type !== 'railyard' || yardTrack(a) < 0 || yardTrack(b) < 0) retireFreight(t);
  }
  freight = freight.filter(t => !t.dead);
  const homed = new Set(freight.map(t => t.home));
  for (const y of yards) {
    if (homed.has(y.id) || freight.length >= 10) continue;
    const p = partnerYard(y);
    if (!p) continue;
    const train = {
      id: nextIncident++, home: y.id, partner: p.b.id, consist: freightConsist(),
      path: null, i: 0, t: 0, x: y.cx * T, y: y.cy * T, d: 2,
      state: 'dwell', wait: 2 + Math.random() * 2, at: y.id, target: p.b.id,
      cargo: {material: 0, liquid: 0, gas: 0}, riders: [], lastStop: -1, dead: false,
    };
    freight.push(train);
    homed.add(y.id);
  }
}
const freightCars = t => t.consist.length;
const freightCap = (t, kind) => t.consist.filter(k => k === kind).length * 10;
function freightEnds(t) {
  const a = B(t.target), y = B(t.at);
  return {from: yardTrack(y), to: yardTrack(a), a, y};
}
// Distance between two footprints in blocks, so loading uses exactly the
// radius that placement advertises: five blocks from the yard's edge.
function nearYard(b, y) {
  const dx = Math.max(0, b.x - (y.x + y.w), y.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (y.y + y.h), y.y - (b.y + b.h));
  return dx + dy <= 5;
}
function loadFreight(t) {
  const y = B(t.at);
  if (!y) return;
  // oil and gas only reach a yard if the rig is within five blocks, which is
  // the placement rule; the same radius gathers the other goods too.
  for (const b of buildings.values()) {
    if (b === y) continue;
    const p = producerOf(b);
    if (!p || b.stock <= 0) continue;
    if (!nearYard(b, y)) continue;
    const kind = p.good === 'oil' ? 'liquid' : p.good === 'gas' ? 'gas' : 'material';
    const room = freightCap(t, kind) - t.cargo[kind];
    const n = Math.min(room, Math.floor(b.stock));
    if (n <= 0) continue;
    t.cargo[kind] += n; b.stock -= n;
  }
  // a rail-served terminal hands its sorted stock to the train
  for (const b of buildings.values()) {
    if (b.type !== 'distribution' || b === y || b.stock <= 0) continue;
    if (!nearYard(b, y)) continue;
    const room = freightCap(t, 'material') - t.cargo.material;
    const n = Math.min(room, Math.floor(b.stock));
    if (n <= 0) continue;
    t.cargo.material += n; b.stock -= n;
  }
}
function unloadFreight(t) {
  const total = t.cargo.material + t.cargo.liquid + t.cargo.gas;
  if (!total) return;
  const y = B(t.at);
  if (!y) return;
  let best = null, bd = Infinity;
  for (const b of buildings.values()) {
    if (b.type !== 'distribution' && b.type !== 'port' && b.type !== 'railyard') continue;
    const d = Math.abs(b.cx - y.cx) + Math.abs(b.cy - y.cy);
    if (d < bd) { bd = d; best = b; }
  }
  const target = best && bd < 14 ? best : y;
  target.stock = Math.min(stockLimit(target), (target.stock || 0) + total);
  t.cargo.material = 0; t.cargo.liquid = 0; t.cargo.gas = 0;
  cargoStats.moved += total;
}
// A metro station within one tile of the line gets a platform stop for the
// freight train, so its passenger cars are good for something.
function stationBeside(i) {
  const here = bldAt[i];
  if (here) { const b = B(here); if (b && b.type === 'metro') return b; }
  for (let d = 1; d <= 4; d++) {
    const j = nb(i, d);
    if (j < 0) continue;
    const id = bldAt[j];
    if (!id) continue;
    const b = B(id);
    if (b && b.type === 'metro') return b;
  }
  return null;
}
function stationsAlong(path) {
  const out = [];
  let last = 0;
  for (let k = 0; k < path.length; k++) {
    const st = stationBeside(path[k]);
    if (st && st.id !== last) { out.push({k, id: st.id}); last = st.id; }
  }
  return out;
}
function freightStop(t, st, ahead) {
  if (!st) return;
  // passengers get off at their station
  const stay = [];
  for (const p of t.riders) {
    if (p.dead) continue;
    if (p.metroTo === st.id || !B(p.metroTo)) { p.riding = false; p.ride = 0; p.hidden = false; nextLeg(p); }
    else stay.push(p);
  }
  t.riders = stay;
  // and people waiting here for a station still ahead on this line get on board
  const cap = t.consist.filter(k => k === 'passenger').length * 8;
  const list = metroWait.get(st.id) || [];
  for (let k = list.length - 1; k >= 0 && t.riders.length < cap; k--) {
    const p = list[k];
    if (p.dead || p.riding || !ahead.has(p.metroTo)) continue;
    list.splice(k, 1);
    st.waiting = Math.max(0, (st.waiting || 0) - 1);
    p.riding = true; p.hidden = true; p.ride = 0;
    t.riders.push(p);
  }
}
function stepFreight(dt) {
  for (const t of freight) {
    if (t.dead) continue;
    if (t.state === 'dwell') {
      t.wait -= dt;
      if (t.wait > 0) continue;
      const ends = freightEnds(t);
      if (ends.from < 0 || ends.to < 0) { t.wait = 3; continue; }
      const path = trackPath(ends.from, ends.to);
      if (!path || path.length < 2) { t.wait = 3; continue; }
      loadFreight(t);
      t.path = path; t.i = 0; t.t = 0; t.state = 'run'; t.year = (t.year || 0) + 1;
      t.lastStop = -1;
      t.stops = stationsAlong(path);
      cargoStats.trainRuns++;
      const a = path[0], b = path[1];
      t.x = (a % MW) * T + 4.5; t.y = (a / MW | 0) * T + 4.5;
      t.d = dirOf(a, b);
      continue;
    }
    if (t.state === 'stop') {
      t.wait -= dt;
      if (t.wait <= 0) t.state = 'run';
      continue;
    }
    if (t.state !== 'run' || !t.path) continue;
    // A station beside the line is a stop: riders get on and off.
    const stopIdx = t.stops ? t.stops.findIndex(s => s.k === t.i) : -1;
    if (stopIdx >= 0 && stopIdx !== t.lastStop) {
      const ahead = new Set(t.stops.slice(stopIdx + 1).map(s => s.id));
      t.lastStop = stopIdx;
      freightStop(t, B(t.stops[stopIdx].id), ahead);
      t.state = 'stop'; t.wait = 1.1;
      continue;
    }
    t.t += FREIGHT_SPEED * dt;
    while (t.t >= 1) {
      t.t -= 1; t.i++;
      if (t.i >= t.path.length - 1) {
        t.at = t.target; t.target = t.partner === t.target ? t.home : t.partner;
        // at the far end the train turns around; at home it loads and goes out again
        unloadFreight(t);
        t.state = 'dwell'; t.wait = 3; t.path = null; t.i = 0; t.t = 0; t.lastStop = -1; t.stops = null;
        const y = B(t.at);
        if (y) { t.x = y.cx * T; t.y = y.cy * T; }
        break;
      }
    }
    if (t.state !== 'run' || !t.path) continue;
    const a = t.path[t.i], b = t.path[t.i + 1];
    if (!track[a] || !track[b]) { t.state = 'dwell'; t.wait = 2; t.path = null; t.stops = null; continue; }
    const ax = a % MW, ay = a / MW | 0, bx = b % MW, by = b / MW | 0;
    t.x = (ax + (bx - ax) * t.t) * T + 4.5;
    t.y = (ay + (by - ay) * t.t) * T + 4.5;
    t.d = dirOf(a, b);
  }
  if (freight.some(t => t.dead)) freight = freight.filter(t => !t.dead);
}

// ---------------------------------------------------------------------
// Hourly production and consumption
// ---------------------------------------------------------------------
function logisticsHour() {
  for (const b of buildings.values()) {
    const p = producerOf(b);
    if (p) { b.stock = Math.min(p.cap, (b.stock || 0) + p.rate); continue; }
    if (BT[b.type].cat === 'com') {
      const use = 1 + BT[b.type].cap / 8;
      b.stock = Math.max(0, (b.stock || 0) - use);
    }
  }
}

function stepLogistics(dt) {
  if (!logisticsReady) syncLogistics();
  truckTimer += dt;
  if (truckTimer >= 1.4) { truckTimer = 0; dispatchTrucks(); }
  // terminals beside a port pass their cargo straight to the quay
  for (const h of hubs) {
    if (h.stock <= 0) continue;
    for (const i of perimeter(h.x, h.y, h.w, h.h)) {
      const id = bldAt[i];
      if (!id) continue;
      const b = B(id);
      if (!b || b.type !== 'port') continue;
      const n = Math.min(h.stock, 40);
      b.stock = Math.min(stockLimit(b), (b.stock || 0) + n);
      h.stock -= n;
      break;
    }
  }
  shipTimer += dt;
  if (shipTimer >= 2.5) {
    shipTimer = 0;
    if (ships.length < 10) for (const p of ports) {
      if (p.stock >= 20 && launchShip(p)) break;
    }
  }
  stepShips(dt);
  stepFreight(dt);
}
