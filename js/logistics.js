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
  quarry:      {good: 'stone',   rate: 8, cap: 100, byproducts: {concrete: 1}},
  mine:        {good: 'ore',     rate: 8, cap: 100, byproducts: {coal: 3, steel: 1}},
  loggingCamp: {good: 'timber',  rate: 6, cap: 80},
  oilRig:      {good: 'oil',     rate: 6, cap: 80},
  gasWell:     {good: 'gas',     rate: 6, cap: 80},
};
const GOOD_NAME = {produce: 'Food', fish: 'Seafood', stone: 'Stone', ore: 'Ore', timber: 'Logs', oil: 'Oil', gas: 'Gas', coal: 'Coal', concrete: 'Concrete', steel: 'Steel', goods: 'Goods'};
const GOOD_LABEL = {produce: 'FOOD', fish: 'FISH', stone: 'STON', ore: 'ORE', timber: 'WOOD', oil: 'OIL', gas: 'GAS', coal: 'COAL', concrete: 'CONC', steel: 'STEL', goods: 'GOOD'};
const GOOD_KEYS = Object.keys(GOOD_LABEL);
const WAREHOUSE_CAP = 3000;
const warehouseTotal = b => Object.values(b.inventory || {}).reduce((sum, n) => sum + n, 0);
const stockGood = b => producerOf(b)?.good || 'goods';
const producerStock = (b, good) => {
  const p = producerOf(b);
  return !p ? (good === 'goods' ? b.stock || 0 : 0) : good === p.good ? b.stock || 0 : (b.byproducts && b.byproducts[good]) || 0;
};
const inventoryOf = b => {
  if (b.type === 'warehouse') return b.inventory || Object.create(null);
  const p = producerOf(b);
  return p ? Object.assign({[p.good]: b.stock || 0}, b.byproducts || {}) : {[stockGood(b)]: b.stock || 0};
};
function warehouseRoom(b) { return Math.max(0, WAREHOUSE_CAP - warehouseTotal(b)); }
function storeInWarehouse(b, good, amount) {
  if (!b || b.type !== 'warehouse' || amount <= 0) return 0;
  b.inventory ||= Object.create(null);
  const n = Math.min(amount, warehouseRoom(b));
  b.inventory[good] = Math.max(0, (b.inventory[good] || 0) + n);
  return n;
}
function takeFromWarehouse(b, good, amount) {
  if (!b || b.type !== 'warehouse') return 0;
  const n = Math.min(amount, Math.floor((b.inventory && b.inventory[good]) || 0));
  b.inventory[good] -= n;
  return n;
}
function formatQuantity(value) {
  const n = Math.max(0, value || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'K';
  return String(Math.floor(n));
}
function materialTotals() {
  const totals = Object.fromEntries(GOOD_KEYS.map(g => [g, 0]));
  for (const b of buildings.values()) {
    const inv = inventoryOf(b);
    for (const good of GOOD_KEYS) totals[good] += Math.max(0, inv[good] || 0);
  }
  for (const good of GOOD_KEYS) if (!['produce', 'fish'].includes(good)) totals[good] += Math.max(0, resources[good] || 0);
  return totals;
}
function updateMaterialHUD() {
  const el = document.getElementById('materials');
  if (!el) return;
  const totals = materialTotals();
  el.replaceChildren();
  for (const good of GOOD_KEYS) {
    const value = totals[good];
    if (value <= 0) continue;
    const chip = document.createElement('span');
    chip.className = 'material-chip';
    chip.title = `${GOOD_NAME[good] || good}: ${Math.floor(value)} units`;
    chip.textContent = `${GOOD_LABEL[good] || good.slice(0, 4).toUpperCase()} ${formatQuantity(value)}`;
    el.append(chip);
  }
  el.classList.toggle('hidden', !el.childElementCount);
}
function platformCost(type) {
  const d = BT[type], amount = d.platformCost || d.platform;
  if (d.platform === 1) return {stone: amount, concrete: amount};
  if (d.platform === 2) return {stone: amount, steel: amount};
  if (d.platform === 3) return {stone: amount};
  return {};
}
function materialNeed(cost) { return Object.entries(cost).map(([g, n]) => `${n} ${GOOD_NAME[g] || g}`).join(' and '); }
function canAffordPlatform(type) { const need = platformCost(type), have = materialTotals(); return Object.entries(need).every(([g, n]) => have[g] >= n); }
function spendMaterials(cost) {
  if (!Object.entries(cost).every(([g, n]) => materialTotals()[g] >= n)) return false;
  for (const [good, amount] of Object.entries(cost)) {
    let left = amount;
    const sources = [...buildings.values()].filter(b => b.type === 'warehouse').sort((a, b) => ((b.inventory && b.inventory[good]) || 0) - ((a.inventory && a.inventory[good]) || 0));
    for (const b of sources) { const n = takeFromWarehouse(b, good, left); left -= n; if (!left) break; }
    for (const b of buildings.values()) if (left && b.type !== 'warehouse') {
      const n = Math.min(left, producerStock(b, good));
      if (n) { takeProducerStock(b, good, n); left -= n; }
    }
    if (left) { const n = Math.min(left, resources[good] || 0); resources[good] -= n; left -= n; }
  }
  return true;
}
const TRUCK_CAP = 20;
const SHOP_STOCK_CAP = 60;
const HUB_STOCK_CAP = 160;
const cargoStats = {deliveries: 0, shipped: 0, moved: 0, trainRuns: 0};
let truckTimer = 0, shipTimer = 0;
let logisticsReady = false;

const stockLimit = b => b.type === 'warehouse' ? WAREHOUSE_CAP
  : (b.type === 'port' || b.type === 'riverWharf' || b.type === 'distribution' || b.type === 'railyard') ? HUB_STOCK_CAP
  : BT[b.type].cat === 'com' ? SHOP_STOCK_CAP : ((PRODUCER[b.type] && PRODUCER[b.type].cap) || 40);
const producerOf = b => PRODUCER[b.type] || null;
// Trucks already on the road toward a building, so two dispatches never race
// for the same shelf space. Derived from the fleet, so a truck that crashes
// simply stops counting instead of leaving a stale reservation behind.
function inboundByBuilding() {
  const inbound = new Map();
  for (const c of cars) {
    if (!c.truck || c.dead || !c.cargo) continue;
    inbound.set(c.dest, (inbound.get(c.dest) || 0) + c.cargo.amount);
  }
  return inbound;
}
function freeRoomOf(b, inbound) {
  const reserved = (inbound && inbound.get(b.id)) || 0;
  const room = b.type === 'warehouse' ? warehouseRoom(b) : stockLimit(b) - Math.max(0, b.stock || 0);
  return Math.max(0, room - reserved);
}
function takeProducerStock(b, good, amount) {
  const p = producerOf(b);
  if (!p) return 0;
  const have = producerStock(b, good), n = Math.min(have, amount);
  if (good === p.good) b.stock = have - n;
  else { b.byproducts ||= Object.create(null); b.byproducts[good] = have - n; }
  return n;
}
function hasAccessibleSupply(shop) {    const shopRoad = roadTileOf(shop);
  if (shopRoad < 0) return false;
  for (const source of buildings.values()) {
    const sourceRoad = roadTileOf(source);
    if (source === shop || sourceRoad < 0 || compR[sourceRoad] !== compR[shopRoad]) continue;
    if (source.type === 'warehouse') {
      if (GOOD_KEYS.some(g => acceptsGood(shop, g) && (source.inventory?.[g] || 0) > 0)) return true;
    } else if (producerOf(source)) {
      const p = producerOf(source);
      if ([p.good, ...Object.keys(p.byproducts || {})].some(g => acceptsGood(shop, g))) return true;
    } else if (source.stock > 0 && acceptsGood(shop, 'goods')) return true;
  }
  return false;
}

function resetLogistics() {
  ships.length = 0;
  freight.length = 0;
  freightLines = [];
  nextLineId = 1;
  railRes.fill(0); blockHold.fill(0);
  sigNode.fill(0);
  cargoStats.deliveries = 0; cargoStats.shipped = 0; cargoStats.moved = 0; cargoStats.trainRuns = 0;
  truckTimer = 0; shipTimer = 0;
  logisticsReady = false;
}

// A shop takes whatever is on the shelf; a distributed "goods" load is welcome
// anywhere. Raw goods only go to the shops that sell that produce.
function acceptsGood(b, good) {
  // A river wharf takes sorted goods straight off the trucks, so a river can be
  // fed by road at one end and ship the cargo out at the other.
  if (good === 'goods') return BT[b.type].cat === 'com' || b.type === 'riverWharf';
  if (b.type === 'distribution' || b.type === 'port' || b.type === 'riverWharf' || b.type === 'warehouse' || b.type === 'railyard') return true;
  const t = b.type;
  if (good === 'fish') return t === 'seafoodMarket' || t === 'market' || t === 'mall' || t === 'shop';
  if (good === 'produce') return t === 'market' || t === 'mall' || t === 'shop' || t === 'seafoodMarket';
  return false;
}

function syncLogistics() {
  for (const b of buildings.values()) {
    if (producerOf(b)) b.byproducts ||= Object.create(null);
    if (b.type === 'warehouse') {
      b.inventory ||= Object.create(null);
      if (b.stock > 0 && warehouseTotal(b) === 0) b.inventory.goods = Math.min(WAREHOUSE_CAP, b.stock);
      b.stock = warehouseTotal(b);
    } else if (b.stock === undefined) b.stock = producerOf(b) ? 8 : BT[b.type].cat === 'com' ? 24 : 0;
    if (b.truckCd === undefined) b.truckCd = 0;
    if (producerOf(b)) b.efficiency = industryEfficiency(b.type, b.x, b.y);
    if (BT[b.type].efficiencyBase && !Number.isFinite(b.efficiency)) b.efficiency = industryEfficiency(b.type, b.x, b.y);
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
// Which track network each tile belongs to, one id per connected run. Used to
// decide how many automatic trains a set of yards should have.
const trackComp = new Int32Array(N), trackCompQ = new Int32Array(N);
let trackCompCount = 0;
function relinkTrack() {
  track.fill(0);
  for (let i = 0; i < N; i++) {
    if (!trackOn[i]) continue;
    const lane = trackWide[i];
    let m = 0;
    for (let d = 1; d <= 4; d++) {
      const j = nb(i, d);
      if (j < 0 || !trackOn[j]) continue;
      // A lane of a two-way line only joins tiles along its own axis: the two
      // tracks of the pair never touch, so they read as two lines and not a
      // ladder of loops. A single track may only join a lane end-on for the
      // same reason.
      if (lane === 1 && d !== 2 && d !== 4) continue;
      if (lane === 2 && d !== 1 && d !== 3) continue;
      const other = trackWide[j];
      if (other && lane === 0 && ((other === 1 && d !== 2 && d !== 4) || (other === 2 && d !== 1 && d !== 3))) continue;
      m |= bit(d);
    }
    track[i] = m;
  }
  trackComp.fill(0);
  trackCompCount = 0;
  for (let s = 0; s < N; s++) {
    if (!trackOn[s] || trackComp[s]) continue;
    let qh = 0, qt = 0;
    trackComp[s] = ++trackCompCount; trackCompQ[qt++] = s;
    while (qh < qt) {
      const u = trackCompQ[qh++], m = track[u];
      for (let d = 1; d <= 4; d++) {
        if (!(m & bit(d))) continue;
        const v = nb(u, d);
        if (v < 0 || trackComp[v] || !trackOn[v]) continue;
        trackComp[v] = trackCompCount; trackCompQ[qt++] = v;
      }
    }
  }
  relinkBlocks();
}
const tqPath = new Int32Array(N), tqPrev = new Int32Array(N), tqSeen = new Uint32Array(N);
let tqGen = 0;
function trackPath(from, to, avoid) {
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
      if (v < 0 || tqSeen[v] === tqGen || !track[v] || (avoid && avoid(v))) continue;
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
function findCustomer(p, good, excludeWarehouses = false, inbound = null) {
  const from = roadTileOf(p);
  if (from < 0) return null;
  const comp = compR[from];
  let best = null, bestScore = -Infinity;
  for (const b of buildings.values()) {
    if (b === p || excludeWarehouses && b.type === 'warehouse' || !acceptsGood(b, good)) continue;
    if (freeRoomOf(b, inbound) <= 0) continue;
    const r = roadTileOf(b);
    if (r < 0 || compR[r] !== comp) continue;
    const d = distB(p, b);
    if (d > 170) continue;
    // Sorted goods prefer shops, so a terminal does not bounce a load to
    // another terminal forever; raw goods prefer the shop that sells them.
    const isShop = BT[b.type].cat === 'com';
    const isHub = b.type === 'distribution' || b.type === 'port' || b.type === 'riverWharf' || b.type === 'warehouse' || b.type === 'railyard';
    const preferred = good === 'goods' ? isShop : !isHub;
    // The emptiest shelves get the load. Without this the nearest shop keeps
    // winning until it is heaped with food, while a corner shop that has never
    // been served is passed over for being a little farther away.
    const cap = stockLimit(b);
    const have = b.type === 'warehouse' ? warehouseTotal(b) : Math.max(0, b.stock || 0);
    const fill = cap > 0 ? clamp((have + ((inbound && inbound.get(b.id)) || 0)) / cap, 0, 1) : 1;
    const score = (1 - fill) * 100 + (preferred ? 12 : 0) - d * 0.18;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return best;
}
function sendTruck(from, to, good, amount, color) {
  if (!from || !to || amount <= 0) return false;
  const room = to.type === 'warehouse' ? warehouseRoom(to) : stockLimit(to) - Math.max(0, to.stock || 0);
  amount = Math.min(amount, room, from.type === 'warehouse' ? (from.inventory && from.inventory[good]) || 0 : producerOf(from) ? producerStock(from, good) : good === 'goods' ? from.stock || 0 : 0);
  if (amount <= 0) return false;
  const a = roadTileOf(from), b = roadTileOf(to);
  if (a < 0 || b < 0 || compR[a] !== compR[b]) return false;
  const path = a === b ? [a] : findPath(a, b, 'car');
  if (!path || path.length < 1) return false;
  if (from.type === 'warehouse') {
    if (takeFromWarehouse(from, good, amount) < amount) return false;
  } else if (producerOf(from)) {
    if (takeProducerStock(from, good, amount) < amount) return false;
  } else from.stock = Math.max(0, from.stock - amount);
  if (path.length < 2) {
    if (to.type === 'warehouse') storeInWarehouse(to, good, amount);
    else to.stock = Math.min(stockLimit(to), to.stock + amount);
    cargoStats.deliveries++; cargoStats.moved += amount;
    return true;
  }
  const c = newCar({truck: true, cargo: {good, amount, from: from.id}, dest: to.id, intent: to.id, path,
    color: color || '#ddd6c2', max: 18});
  carGeom(c);
  if (!spawnCarAt(c)) {
    if (from.type === 'warehouse') storeInWarehouse(from, good, amount);
    else if (producerOf(from)) {
      if (good === producerOf(from).good) from.stock += amount;
      else { from.byproducts ||= Object.create(null); from.byproducts[good] = (from.byproducts[good] || 0) + amount; }
    } else from.stock += amount;
    return false;
  }
  return true;
}
// Put an undelivered load back where it came from, so a demolished or filled
// destination does not quietly delete stock.
function putBack(id, good, amount) {
  const S = B(id);
  if (!S || amount <= 0) return;
  if (S.type === 'warehouse') { storeInWarehouse(S, good, amount); return; }
  const p = producerOf(S);
  if (p) {
    if (good === p.good) S.stock = Math.min(p.cap, (S.stock || 0) + amount);
    else { S.byproducts ||= Object.create(null); S.byproducts[good] = Math.min(100, (S.byproducts[good] || 0) + amount); }
    return;
  }
  S.stock = Math.min(stockLimit(S), (S.stock || 0) + amount);
}
function deliverTruck(c) {
  const D = B(c.dest);
  if (!D || !c.cargo) { endCar(c); return; }
  const {good, amount} = c.cargo;
  const stored = D.type === 'warehouse' ? storeInWarehouse(D, good, amount)
    : Math.min(amount, Math.max(0, stockLimit(D) - (D.stock || 0)));
  if (D.type !== 'warehouse') D.stock = (D.stock || 0) + stored;
  if (stored > 0) { cargoStats.deliveries++; cargoStats.moved += stored; }
  if (stored < amount) putBack(c.cargo.from, good, amount - stored);
  endCar(c);
}
function dispatchTrucks() {
  let trucks = 0;
  for (const c of cars) if (c.truck) trucks++;
  if (trucks >= 70) return;
  const inbound = inboundByBuilding();
  const room = b => freeRoomOf(b, inbound);
  for (const b of buildings.values()) {
    const p = producerOf(b);
    if (!p || b.truckCd > 0) continue;
    const goods = [p.good, ...Object.keys(p.byproducts || {})];
    for (const good of goods) {
      if (producerStock(b, good) < 10) continue;
      const to = findCustomer(b, good, false, inbound);
      if (!to) continue;
      const amount = Math.min(TRUCK_CAP, Math.floor(producerStock(b, good)), room(to));
      if (amount <= 0) continue;
      if (sendTruck(b, to, good, amount)) {
        inbound.set(to.id, (inbound.get(to.id) || 0) + amount);
        b.truckCd = 5 + Math.random() * 4; if (++trucks >= 70) return;
      }
    }
  }
  // Warehouses top up reachable shops first, then relieve a nearly full peer
  // into a nearly empty one. Both thresholds are deliberately wide, so two
  // warehouses never shuttle the same load back and forth.
  for (const source of buildings.values()) {
    if (source.type !== 'warehouse' || source.truckCd > 0 || warehouseTotal(source) < 10) continue;
    let sent = false;
    for (const good of GOOD_KEYS) {
      const available = Math.floor((source.inventory && source.inventory[good]) || 0);
      if (available < 1) continue;
      const customer = findCustomer(source, good, true, inbound);
      if (!customer) continue;
      const amount = Math.min(TRUCK_CAP, available, room(customer));
      if (amount <= 0) continue;
      if (sendTruck(source, customer, good, amount, '#d1c5a8')) {
        inbound.set(customer.id, (inbound.get(customer.id) || 0) + amount);
        source.truckCd = 6; sent = true; if (++trucks >= 70) return; break;
      }
    }
    if (sent) continue;
    if (warehouseTotal(source) < WAREHOUSE_CAP * 0.6) continue;
    let target = null, gap = 0;
    for (const dest of buildings.values()) {
      if (dest === source || dest.type !== 'warehouse' || warehouseTotal(dest) > WAREHOUSE_CAP * 0.4) continue;
      const dr = roadTileOf(dest);
      if (dr < 0 || compR[dr] !== compR[roadTileOf(source)]) continue;
      const d = warehouseTotal(source) - warehouseTotal(dest);
      if (d > gap) { gap = d; target = dest; }
    }
    if (!target) continue;
    for (const good of GOOD_KEYS) {
      const have = Math.floor((source.inventory && source.inventory[good]) || 0);
      const n = Math.min(TRUCK_CAP, Math.floor(have / 2), room(target));
      if (n <= 0) continue;
      if (sendTruck(source, target, good, n, '#d1c5a8')) {
        inbound.set(target.id, (inbound.get(target.id) || 0) + n);
        source.truckCd = 6; if (++trucks >= 70) return;
      }
    }
  }
  // terminals and ports send sorted goods on to the shops
  for (const b of buildings.values()) {
    if (b.road < 0 || b.truckCd > 0) continue;
    if (b.type !== 'distribution' && b.type !== 'port' && b.type !== 'riverWharf' && b.type !== 'railyard') continue;
    if (b.stock < 12) continue;
    const to = findCustomer(b, 'goods', false, inbound);
    if (!to) continue;
    const amount = Math.min(TRUCK_CAP, Math.floor(b.stock), room(to));
    if (amount <= 0) continue;
    if (sendTruck(b, to, 'goods', amount, '#cfe0ef')) {
      inbound.set(to.id, (inbound.get(to.id) || 0) + amount);
      b.truckCd = 7 + Math.random() * 5; if (++trucks >= 70) return;
    }
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
// A voyage that fails (channel blocked, destination demolished) sends its cargo
// back to the quay it left, rather than deleting it at sea.
function returnShipCargo(s) {
  if (!s || !s.cargo) return;
  const S = B(s.origin);
  if (S) {
    if (S.type === 'warehouse') storeInWarehouse(S, s.cargo.good, s.cargo.amount);
    else S.stock = Math.min(stockLimit(S), (S.stock || 0) + s.cargo.amount);
  }
  s.cargo = null;
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
  let cargo = {good: 'goods', amount: Math.min(60, Math.floor(port.stock))};
  if (port.type === 'warehouse') {
    const good = GOOD_KEYS.find(g => (port.inventory && port.inventory[g]) >= 8);
    if (!good) return false;
    cargo = {good, amount: Math.min(60, Math.floor(port.inventory[good]))};
    takeFromWarehouse(port, good, cargo.amount);
  } else {
    if (cargo.amount < 8) return false;
    port.stock -= cargo.amount;
  }
  ships.push({path, i: 0, t: 0, x: 0, y: 0, d: 2, speed: 5 + Math.random() * 2,
    cargo, origin: port.id, destPort: destPort ? destPort.id : 0,
    color: pick(['#f4f5f7', '#d8e4f0', '#e8d8b8'], Math.random()), dead: false});
  return true;
}
function stepShips(dt) {
  for (const s of ships) {
    s.t += (s.speed || 6) * dt / T;
    while (s.t >= 1) { s.t -= 1; s.i++; }
    if (s.i >= s.path.length - 1 || !water[s.path[s.i]]) { returnShipCargo(s); s.dead = true; continue; }
    const a = s.path[s.i], c = s.path[s.i + 1];
    s.x = ((a % MW) + ((c % MW) - (a % MW)) * s.t) * T + 4.5;
    s.y = ((a / MW | 0) + ((c / MW | 0) - (a / MW | 0)) * s.t) * T + 4.5;
    s.d = dirOf(a, c);
    if (s.i >= s.path.length - 2) {
      // arrived: unload at the other port, or the cargo leaves the region
      const P = B(s.destPort);
      const {good, amount} = s.cargo;
      let stored = 0;
      if (P && P.type === 'warehouse') stored = storeInWarehouse(P, good, amount);
      else if (P) {
        stored = Math.min(amount, Math.max(0, stockLimit(P) - (P.stock || 0)));
        P.stock = (P.stock || 0) + stored;
      }
      if (P) {
        if (stored < amount) resources[good] = (resources[good] || 0) + (amount - stored);
        cargoStats.moved += stored;
      } else if (s.destPort) returnShipCargo(s);        // the port was demolished mid-voyage
      else cargoStats.shipped += amount;                // exported off the region
      s.cargo = null;
      s.dead = true;
    }
  }
  if (ships.some(s => s.dead)) ships = ships.filter(s => !s.dead);
}

// ---------------------------------------------------------------------
// Freight trains
// ---------------------------------------------------------------------
const FREIGHT_SPEED = 7;
// Player-drawn freight loops: {id, stops: [yard ids], color}. A line gets its
// own train; yards without a line keep an automatic demand tour.
let freightLines = [];
let nextLineId = 1;
// Which train holds which tile of track. Reserving tiles rather than whole
// signal blocks is what lets two tracks laid side by side work as a two-way
// line: opposing trains pass on their own track instead of taking turns.
const railRes = new Int32Array(N);   // tile -> train id holding it
const blockHold = new Int32Array(N); // block id -> how many of its tiles are held
let trackSignals = [];               // flat [tile, direction, block] triples at block boundaries
const blockNode = new Uint8Array(N);  // control point tiles: a block each, never flooded through
let railBusyGen = 1;
const railBusy = new Uint32Array(N), railSoon = new Uint32Array(N);  // tiles a train covers / is about to cover
const railBusyAt = i => railBusy[i] === railBusyGen;
const railSoonAt = i => railSoon[i] === railBusyGen;
// Road traffic and crossing gates read this: everything the consist covers,
// plus the stretch of track ahead of it that it will reach in a few seconds.
function markRailBusy() {
  railBusyGen++;
  for (const t of freight) {
    if (t.dead || !t.path) continue;
    const last = t.path.length - 1;
    // A train in a yard is inside the buffers: as its wagons roll in, fewer of
    // the approach tiles stay blocked, so a street beside the yard reopens.
    const behind = Math.max(0, Math.ceil(t.consist.length - (t.state === 'dwell' ? (t.ex || 0) : 0)));
    const tail = Math.max(0, Math.floor(t.i) - behind);
    // Traffic needs warning, not just the tiles under the train: mark about a
    // second of track ahead as well, or a car noses onto the crossing first.
    const head = Math.min(last, Math.ceil(t.i + FREIGHT_SPEED * 1.2));
    for (let k = tail; k <= head; k++) railBusy[t.path[k]] = railBusyGen;
    const soon = Math.min(last, Math.ceil(t.i + FREIGHT_SPEED * 3.5));
    for (let k = head; k <= soon; k++) railSoon[t.path[k]] = railBusyGen;
  }
}
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
// Signal blocks: one tile wide around junctions, yards and player signals, and
// a whole plain run of track in between. A block is the unit a train reserves,
// so two trains can never occupy the same stretch in opposite directions.
function relinkBlocks() {
  blockOf.fill(0);
  railRes.fill(0); blockHold.fill(0);
  for (const t of freight) t.reserved = [];
  const node = i => {
    if (sigNode[i]) return true;
    // Count connected neighbours from the link mask, not raw track tiles: the
    // two lanes of a two-way line are not connected across the pair.
    let n = 0;
    for (let d = 1; d <= 4; d++) if (track[i] & bit(d)) n++;
    if (n !== 2) return true;
    for (let d = 1; d <= 4; d++) {
      const j = nb(i, d), id = j >= 0 ? bldAt[j] : 0;
      if (!id) continue;
      const b = B(id);
      if (b && (b.type === 'railyard' || b.type === 'distribution')) return true;
    }
    return false;
  };
  // A control point is a block of its own and a wall between the runs on
  // either side: that is what lets a single signal split a straight line into
  // two blocks instead of the two floods meeting at an unmarked spot.
  blockNode.fill(0);
  let id = 0;
  for (let i = 0; i < N; i++) if (trackOn[i] && node(i)) { blockNode[i] = 1; blockOf[i] = ++id; }
  // A plain run between control points, and a closed loop with no node in it,
  // both fall out of the same flood over non-node track.
  const queue = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (!trackOn[i] || blockOf[i]) continue;
    let qh = 0, qt = 0;
    blockOf[i] = ++id; queue[qt++] = i;
    while (qh < qt) {
      const u = queue[qh++];
      for (let d = 1; d <= 4; d++) {
        const v = nb(u, d);
        if (v < 0 || !trackOn[v] || blockNode[v] || blockOf[v]) continue;
        blockOf[v] = id;
        queue[qt++] = v;
      }
    }
  }
  // Where one block hands over to another, one signal stands: record the east
  // and south edges only, so every boundary gets exactly one lamp.
  trackSignals = [];
  for (let i = 0; i < N; i++) {
    if (!trackOn[i] || !blockOf[i]) continue;
    const e = nb(i, 2), s = nb(i, 3);
    if (e >= 0 && trackOn[e] && blockOf[e] && blockOf[e] !== blockOf[i]) trackSignals.push(i, 2, blockOf[e]);
    if (s >= 0 && trackOn[s] && blockOf[s] && blockOf[s] !== blockOf[i]) trackSignals.push(i, 3, blockOf[s]);
  }
}
// A block is red while a train holds any tile in it.
function blockBusy(id) { return id > 0 && blockHold[id] > 0; }
// Reserve every tile of a leg in one go. All-or-nothing still avoids the
// classic stand-off where two trains each hold a piece the other wants, but a
// second track alongside is a separate set of tiles, so opposing trains can
// use it without waiting for each other.
function reservePath(t, path) {
  for (const i of path) if (railRes[i] && railRes[i] !== t.id) return false;
  for (const i of path) {
    if (railRes[i]) continue;
    railRes[i] = t.id;
    const b = blockOf[i];
    if (b) blockHold[b]++;
  }
  t.reserved = path.slice();
  return true;
}
function releaseBlocks(t) {
  for (const i of t.reserved || []) if (railRes[i] === t.id) {
    railRes[i] = 0;
    const b = blockOf[i];
    if (b && blockHold[b] > 0) blockHold[b]--;
  }
  t.reserved = [];
}
function freightStopScore(y) {
  let score = 0;
  for (const b of buildings.values()) {
    if (!nearYard(b, y)) continue;
    if (b.type === 'warehouse') score += warehouseTotal(b) * 0.4 + warehouseRoom(b) * 0.3;
    else if (b.type === 'distribution') score += Math.max(0, b.stock) * 1.5 + 40;
    else if (producerOf(b)) {
      const p = producerOf(b);
      score += producerStock(b, p.good) * 2;
      for (const g of Object.keys(p.byproducts || {})) score += producerStock(b, g);
    }
  }
  return score;
}
// Automatic itinerary: up to three yards with something to move, then home.
// A leg that cannot be routed is skipped rather than stranding the train.
function autoPlan(t) {
  const home = B(t.home);
  if (!home || yardTrack(home) < 0) return [];
  const pool = yards.filter(y => y.id !== t.home && yardTrack(y) >= 0 && freightStopScore(y) > 0)
    .sort((a, b) => freightStopScore(b) - freightStopScore(a));
  const plan = [];
  for (const y of pool) {
    if (plan.length >= 3) break;
    const prev = plan.length ? B(plan[plan.length - 1]) : home;
    const path = trackPath(yardTrack(prev), yardTrack(y));
    if (!path || path.length < 2) continue;
    plan.push(y.id);
  }
  if (!plan.length) return [];
  const last = B(plan[plan.length - 1]);
  if (!trackPath(yardTrack(last), yardTrack(home))) return [];
  plan.push(t.home);
  return plan;
}
function linePlan(t) {
  const line = freightLines.find(l => l.id === t.line);
  if (!line) return [];
  const stops = line.stops.filter(id => {
    const y = B(id);
    return y && y.type === 'railyard' && yardTrack(y) >= 0;
  });
  if (stops.length < 2) return [];
  const at = Math.max(0, stops.indexOf(t.at));
  const out = [];
  for (let k = 1; k < stops.length; k++) out.push(stops[(at + k) % stops.length]);
  out.push(stops[at]);
  return out;
}
function planFreight(t) {
  const plan = t.line ? linePlan(t) : autoPlan(t);
  if (!plan.length) return false;
  t.plan = plan; t.leg = 0; t.target = plan[0];
  return true;
}
function retireFreight(t) {
  t.dead = true;
  releaseBlocks(t);
  for (const p of t.riders) if (!p.dead) { p.riding = false; p.hidden = false; p.ride = 0; nextLeg(p); }
  t.riders = [];
}
function newFreightTrain(yard, lineId) {
  return {
    id: nextIncident++, home: yard.id, line: lineId || 0, consist: freightConsist(),
    path: null, i: 0, t: 0, ex: 0, x: yard.cx * T, y: yard.cy * T, d: 2,
    state: 'dwell', wait: TRAIN_RIDE_GAP + Math.random() * 3, at: yard.id, target: 0,
    plan: [], leg: 0, reserved: [], cargo: {material: 0, liquid: 0, gas: 0},
    riders: [], lastStop: -1, dead: false,
  };
}
function syncFreight() {
  for (const t of freight) {
    const a = B(t.home);
    if (!a || a.type !== 'railyard' || yardTrack(a) < 0) retireFreight(t);
    else if (t.line && !freightLines.some(l => l.id === t.line)) retireFreight(t);
  }
  freight = freight.filter(t => !t.dead);
  // one train per player line, then one automatic train per yard
  for (const line of freightLines) {
    if (freight.some(t => t.line === line.id)) continue;
    const home = B(line.stops[0]);
    if (!home || home.type !== 'railyard' || yardTrack(home) < 0) continue;
    if (line.stops.some(id => { const y = B(id); return !y || y.type !== 'railyard' || yardTrack(y) < 0; })) continue;
    if (freight.length >= 32) break;
    freight.push(newFreightTrain(home, line.id));
  }
  // One automatic train per connected track network, not one per yard: a
  // single line through six yards used to spawn six trains nose to tail.
  const autoComps = new Set(freight.filter(t => !t.line).map(t => {
    const y = B(t.home), tr = y ? yardTrack(y) : -1;
    return tr >= 0 ? trackComp[tr] : 0;
  }).filter(Boolean));
  for (const y of yards) {
    const tr = yardTrack(y);
    if (freight.length >= 32 || tr < 0 || !trackComp[tr]) continue;
    if (autoComps.has(trackComp[tr])) continue;
    freight.push(newFreightTrain(y, 0));
    autoComps.add(trackComp[tr]);
  }
}
const freightCap = (t, kind) => t.consist.filter(k => k === kind).length * 10;
// Distance between two footprints in blocks, so loading uses exactly the
// radius that placement advertises: five blocks from the yard's edge.
function nearYard(b, y) {
  const dx = Math.max(0, b.x - (y.x + y.w), y.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (y.y + y.h), y.y - (b.y + b.h));
  return dx + dy <= 5;
}
// How much a yard can take on arrival: only warehouses inside the same
// five-block radius the placement rules advertise, so a train never teleports
// cargo to a warehouse on the far side of the map.
function yardSideRoom(y) {
  if (!y) return 0;
  let room = 0;
  for (const b of buildings.values()) if (b.type === 'warehouse' && nearYard(b, y)) room += warehouseRoom(b);
  return room;
}
function loadFreight(t) {
  const y = B(t.at), dest = B(t.target);
  if (!y || !dest) return;
  const destRoom = yardSideRoom(dest);
  if (destRoom <= 0) return;                 // nowhere to put it: don't take it
  let roomLeft = destRoom;
  // A warehouse only exports a surplus, and only into a side that is still
  // mostly empty. Without both rules two yards trade the same load forever.
  let destCap = 0;
  for (const b of buildings.values()) if (b.type === 'warehouse' && nearYard(b, dest)) destCap += WAREHOUSE_CAP;
  const destFill = destCap ? 1 - destRoom / destCap : 0;
  const warehouseSurplus = destFill <= 0.5;
  // oil and gas only reach a yard if the rig is within five blocks, which is
  // the placement rule; the same radius gathers the other goods too.
  const hold = t.goods ||= Object.create(null);
  const recent = t.recent || null;           // goods just dropped here stay here
  for (const b of buildings.values()) {
    if (b === y) continue;
    const p = producerOf(b);
    if (!p || !nearYard(b, y)) continue;
    for (const good of [p.good, ...Object.keys(p.byproducts || {})]) {
      if (recent && recent.has(good)) continue;
      const kind = good === 'oil' ? 'liquid' : good === 'gas' ? 'gas' : 'material';
      const n = Math.min(freightCap(t, kind) - t.cargo[kind], Math.floor(producerStock(b, good)), roomLeft);
      if (n <= 0) continue;
      const moved = takeProducerStock(b, good, n);
      hold[good] = (hold[good] || 0) + moved;
      t.cargo[kind] += moved;
      roomLeft -= moved;
    }
  }
  // Warehouses only clear a surplus, so a load just delivered at the far end
  // is never picked straight back up and sent home.
  let materialRoom = freightCap(t, 'material') - t.cargo.material;
  for (const b of buildings.values()) {
    if (b === y || !nearYard(b, y) || b.type !== 'warehouse') continue;
    if (!warehouseSurplus || warehouseTotal(b) < WAREHOUSE_CAP * 0.5) continue;
    for (const good of GOOD_KEYS) {
      if (recent && recent.has(good)) continue;
      const n = Math.min(materialRoom, Math.floor((b.inventory && b.inventory[good]) || 0), roomLeft);
      if (n <= 0) continue;
      const moved = takeFromWarehouse(b, good, n); hold[good] = (hold[good] || 0) + moved;
      materialRoom -= moved; roomLeft -= moved; t.cargo.material += moved;
      if (!materialRoom || !roomLeft) break;
    }
    if (!materialRoom || !roomLeft) break;
  }
  // A rail-served terminal continues to carry legacy undifferentiated goods.
  for (const b of buildings.values()) {
    if (b.type !== 'distribution' || b === y || b.stock <= 0 || !nearYard(b, y)) continue;
    if (recent && recent.has('goods')) continue;
    const n = Math.min(freightCap(t, 'material') - t.cargo.material, Math.floor(b.stock), roomLeft);
    if (n > 0) { t.cargo.material += n; b.stock -= n; t.goods.goods = (t.goods.goods || 0) + n; roomLeft -= n; }
  }
}
function unloadFreight(t) {
  const total = t.cargo.material + t.cargo.liquid + t.cargo.gas;
  if (!total) return;
  const y = B(t.at);
  if (!y) return;
  const destinations = [...buildings.values()]
    .filter(b => b.type === 'warehouse' && nearYard(b, y) && warehouseRoom(b) > 0)
    .sort((a, b) => warehouseRoom(b) - warehouseRoom(a));
  const hold = t.goods || {};
  const unloaded = new Set();
  let moved = 0;
  for (const good of GOOD_KEYS) {
    let left = hold[good] || 0;
    if (left > 0) unloaded.add(good);
    for (const dest of destinations) {
      if (!left) break;
      const n = storeInWarehouse(dest, good, left); left -= n; moved += n;
    }
    if (left) resources[good] = (resources[good] || 0) + left;   // only when every nearby warehouse is full
  }
  t.recent = unloaded;
  t.cargo.material = 0; t.cargo.liquid = 0; t.cargo.gas = 0; t.goods = Object.create(null);
  cargoStats.moved += moved;
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
      // The locomotive has already run into the yard; `ex` tracks how far the
      // consist has cleared the approach, so the crossing beside the yard is
      // released as the train settles on the yard track.
      if (t.path && t.ex < 60) t.ex = Math.min(60, t.ex + FREIGHT_SPEED * dt);
      if (t.wait > 0) continue;
      if (!t.plan.length || t.leg >= t.plan.length) {
        if (!planFreight(t)) { t.wait = 3; continue; }
      }
      const here = B(t.at), next = B(t.target);
      const from = yardTrack(here), to = yardTrack(next);
      if (from < 0 || to < 0) { t.plan = []; t.wait = 3; continue; }
      let path = trackPath(from, to);
      if (!path || path.length < 2) { t.plan = []; t.wait = 3; continue; }
      loadFreight(t);
      // The whole leg is claimed before the train moves, so no train is ever
      // stranded half way holding track. If another train already holds part
      // of the direct route, try a second track alongside it: a two-way line
      // where each direction has its own rails. Otherwise wait for the line.
      if (!reservePath(t, path)) {
        const alt = trackPath(from, to, i => railRes[i] && railRes[i] !== t.id);
        if (!alt || alt.length < 2 || alt.length > path.length + 40 || !reservePath(t, alt)) { t.wait = 1.5; continue; }
        path = alt;
      }
      const stops = stationsAlong(path);
      t.path = path; t.i = 0; t.t = 0; t.ex = 0; t.state = 'run'; t.year = (t.year || 0) + 1;
      t.lastStop = -1;
      t.stops = stops;
      t.recent = null;              // next yard may load anything again
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
        t.at = t.target;
        // unload at this stop, free the blocks behind, then queue the next leg
        t.recent = null;             // this visit's own unload fills it below
        unloadFreight(t);
        releaseBlocks(t);
        t.leg++;
        t.target = t.leg < t.plan.length ? t.plan[t.leg] : 0;
        // Keep the leg until the last wagon is in, and stay in the yard long
        // enough that no car has to jump when the next leg begins.
        t.state = 'dwell';
        t.wait = Math.max(TRAIN_RIDE_GAP, 3 + t.consist.length / FREIGHT_SPEED);
        t.i = t.path.length - 1; t.t = 0; t.ex = 0; t.lastStop = -1; t.stops = null;
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
  markRailBusy();
}

// ---------------------------------------------------------------------
// Hourly production and consumption
// ---------------------------------------------------------------------
function logisticsHour() {
  for (const b of buildings.values()) {
    if (BT[b.type].efficiencyBase) b.efficiency = industryEfficiency(b.type, b.x, b.y);
    const p = producerOf(b);
    if (p) {
      const eff = b.efficiency;
      b.efficiency = eff;
      if (b.type === 'loggingCamp') {
        const jungle = biome[b.y * MW + b.x] === 2;
        const orchard = nearType(b, 'orchard', 10), greenhouse = nearType(b, 'greenhouse', 10);
        const sustainable = jungle && orchard && greenhouse;
        let cut = sustainable ? p.rate * eff : 0;
        if (!sustainable && jungle) {
          let cutCount = 0;
          const radius = 11;
          for (let y = Math.max(0, Math.floor(b.cy - radius)); y <= Math.min(MH - 1, Math.ceil(b.cy + radius)); y++)
            for (let x = Math.max(0, Math.floor(b.cx - radius)); x <= Math.min(MW - 1, Math.ceil(b.cx + radius)); x++) {
              const i = y * MW + x;
              if (tree[i] && !bldAt[i] && biome[i] === 2 && Math.random() < 0.08) { tree[i] = 0; cutCount++; markDirty(x, y, x, y); }
            }
          cut = cutCount * eff;
        } else if (!jungle && (orchard || greenhouse)) cut = p.rate * eff * 0.55;
        b.stock = Math.min(p.cap, (b.stock || 0) + cut);
    } else {
      const resource = b.type === 'oilRig' ? 'oil' : b.type === 'gasWell' ? 'gas' : null;
      const remaining = resource ? Math.max(0, resources[resource] || 0) : Infinity;
      const made = Math.min(p.rate * eff, remaining);
      b.stock = Math.min(p.cap, (b.stock || 0) + made);
      if (resource) resources[resource] = Math.max(0, remaining - made);
      if (p.byproducts) for (const [good, rate] of Object.entries(p.byproducts)) b.byproducts[good] = Math.min(100, (b.byproducts[good] || 0) + rate * eff);
    }
      continue;
    }
    if (b.type === 'warehouse') {
      b.stock = warehouseTotal(b);
      continue;
    }
    if (BT[b.type].cat === 'com') {
      const use = 1 + BT[b.type].cap / 8;
      b.stock = Math.max(0, (b.stock || 0) - use);
    }
  }
}

function stepLogistics(dt) {
  if (!logisticsReady) syncLogistics();
  // Cooldowns are the gap between one building's dispatches. Warehouses and
  // hubs use them too, so every source keeps shipping instead of firing once.
  for (const b of buildings.values()) if (b.truckCd > 0) b.truckCd = Math.max(0, b.truckCd - dt);
  truckTimer += dt;
  if (truckTimer >= 1.4) { truckTimer = 0; dispatchTrucks(); }
  shipTimer += dt;
  if (shipTimer >= 2.5) {
    shipTimer = 0;
    // terminals beside a port hand their cargo over at a loading pace, not all at once
    for (const h of hubs) {
      if (h.stock <= 0) continue;
      for (const i of perimeter(h.x, h.y, h.w, h.h)) {
        const id = bldAt[i];
        if (!id) continue;
        const b = B(id);
        if (!b || (b.type !== 'port' && b.type !== 'riverWharf')) continue;
        const n = Math.min(h.stock, 40, Math.max(0, stockLimit(b) - (b.stock || 0)));
        if (n <= 0) break;
        b.stock = (b.stock || 0) + n;
        h.stock -= n;
        break;
      }
    }
    if (ships.length < 10) for (const p of ports) {
      if (p.stock >= 20 && launchShip(p)) break;
    }
  }
  stepShips(dt);
  stepFreight(dt);
}
