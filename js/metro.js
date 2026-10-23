// =====================================================================
// Metro: the underground network
//
// Stations are the only thing the player builds. Everything else here is
// derived from where they are:
//
//   rails     a tunnel is cut from each new station back to the nearest
//             existing rail (or station), preferring to run under streets.
//             The network is therefore a tree, which is what makes the
//             blocks meaningful: a tile where three or four rails meet is a
//             junction, and a tile where only one does is the end of a line,
//             a reversing block.
//   fleet     every station owns exactly two trains, homed to it. A train
//             shuttles out to wherever riders are waiting and comes back.
//
// A train cannot run round a loop, so where its route doubles back it has to
// stop on the reversing block, change ends, and go out the way it came in.
// =====================================================================
const METRO_CAP = 30;        // riders per train
const METRO_SPEED = 9;       // tiles per second
const METRO_DWELL = 1.1;     // seconds stopped at a platform
const METRO_REVERSE = 0.7;   // seconds to change ends on a reversing block
const METRO_GIVEUP = 210;    // game minutes before a waiting rider walks instead

let nextMid = 1;

// ---------------------------------------------------------------------
// A small binary heap, used only while laying track
// ---------------------------------------------------------------------
const heapI = [], heapC = [];
function heapPush(i, c) {
  heapI.push(i); heapC.push(c);
  let k = heapI.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heapC[p] <= heapC[k]) break;
    [heapI[p], heapI[k]] = [heapI[k], heapI[p]];
    [heapC[p], heapC[k]] = [heapC[k], heapC[p]];
    k = p;
  }
}
function heapPop() {
  const top = heapI[0];
  const li = heapI.pop(), lc = heapC.pop();
  if (heapI.length) {
    heapI[0] = li; heapC[0] = lc;
    let k = 0;
    for (;;) {
      const l = k * 2 + 1, r = l + 1;
      let s = k;
      if (l < heapI.length && heapC[l] < heapC[s]) s = l;
      if (r < heapI.length && heapC[r] < heapC[s]) s = r;
      if (s === k) break;
      [heapI[s], heapI[k]] = [heapI[k], heapI[s]];
      [heapC[s], heapC[k]] = [heapC[k], heapC[s]];
      k = s;
    }
  }
  return top;
}

// ---------------------------------------------------------------------
// Laying track
// ---------------------------------------------------------------------
const rCost = new Float32Array(N), rPrev = new Int32Array(N), rSeen = new Uint32Array(N);
let rGen = 0;

// What it costs to run a tunnel through a tile. Only used by world generation,
// where the demo city's lines are laid for you; in game the player draws them.
// Streets are where tunnels belong, so they are cheapest.
function railTileCost(i) {
  if (railOn[i]) return 1;
  if (water[i]) return 14;
  if (tile[i] === 1 || tile[i] === 2) return 1;
  if (bldAt[i]) return 5;
  return 3;
}

function railRoute(from, to) {
  if (from === to) return [from];
  rGen++;
  heapI.length = 0; heapC.length = 0;
  rSeen[from] = rGen; rCost[from] = 0; rPrev[from] = -1;
  heapPush(from, 0);
  let guard = N * 8;
  while (heapI.length && guard-- > 0) {
    const u = heapPop();
    if (u === to) break;
    if (rSeen[u] !== rGen) continue;
    for (let d = 1; d <= 4; d++) {
      const v = nb(u, d);
      if (v < 0) continue;
      const c = rCost[u] + railTileCost(v);
      if (rSeen[v] !== rGen || c < rCost[v]) {
        rSeen[v] = rGen; rCost[v] = c; rPrev[v] = u;
        heapPush(v, c);
      }
    }
  }
  if (rSeen[to] !== rGen) return null;
  const path = [];
  for (let k = to; k !== -1; k = rPrev[k]) path.push(k);
  return path.reverse();
}

// Rebuild the connection mask. Two rails that share an edge are connected, so
// junctions appear wherever three or four of them meet and a dead end — a
// reversing block — is any tile with a single neighbour. This runs at the
// start of mapChanged(), so every edit (drawing, erasing, loading) agrees.
function relinkRail() {
  rail.fill(0);
  for (let i = 0; i < N; i++) {
    if (!railOn[i]) continue;
    let m = 0;
    for (let d = 1; d <= 4; d++) { const j = nb(i, d); if (j >= 0 && railOn[j]) m |= bit(d); }
    rail[i] = m;
  }
}

// World generation only: lay a line between two tiles so the demo city ships
// with a working network. In game this is the Metro Rails tool.
function linkMetro(x1, y1, x2, y2) {
  if (!inb(x1, y1) || !inb(x2, y2)) return;
  const path = railRoute(y1 * MW + x1, y2 * MW + x2);
  if (!path) return;
  for (const i of path) railOn[i] = 1;
  relinkRail();
}

// Shortest route along existing rails. Rails form a tree, so this is a plain
// breadth-first walk; it is only run when a train sets off.
const rqPath = new Int32Array(N), rqPrev = new Int32Array(N), rqSeen = new Uint32Array(N);
let rqGen = 0;
function railPath(from, to) {
  if (from === to) return [from];
  if (!rail[from] || !rail[to]) return null;
  rqGen++;
  let qh = 0, qt = 0;
  rqSeen[from] = rqGen; rqPrev[from] = -1; rqPath[qt++] = from;
  while (qh < qt) {
    const u = rqPath[qh++];
    if (u === to) break;
    const m = rail[u];
    for (let d = 1; d <= 4; d++) {
      if (!(m & bit(d))) continue;
      const v = nb(u, d);
      if (v < 0 || rqSeen[v] === rqGen || !rail[v]) continue;
      rqSeen[v] = rqGen; rqPrev[v] = u; rqPath[qt++] = v;
    }
  }
  if (rqSeen[to] !== rqGen) return null;
  const path = [];
  for (let k = to; k !== -1; k = rqPrev[k]) path.push(k);
  return path.reverse();
}

const stationTile = s => s.y * MW + s.x;

// ---------------------------------------------------------------------
// Fleet
// ---------------------------------------------------------------------
function newMetro(s) {
  return {
    id: nextMid++, home: s.id, at: s.id, target: 0,
    x: s.x * T + 4.5, y: s.y * T + 4.5, d: 2,
    path: null, i: 0, t: 0, state: 'dwell', wait: 1 + Math.random() * 3,
    riders: [], dead: false
  };
}

// Exactly two trains per station, always. Trains whose station is gone are
// retired, and a new station gets its pair immediately.
function syncMetros() {
  const alive = new Set(stations.map(s => s.id));
  for (const m of metros) if (!alive.has(m.home)) m.dead = true;
  for (const m of metros) if (m.dead) retireMetro(m);
  if (metros.some(m => m.dead)) metros = metros.filter(m => !m.dead);
  for (const s of stations) {
    let n = 0;
    for (const m of metros) if (m.home === s.id) n++;
    while (n < 2) { metros.push(newMetro(s)); n++; }
  }
  for (const id of [...metroWait.keys()]) if (!alive.has(id)) {
    for (const p of metroWait.get(id)) if (!p.dead) nextLeg(p);
    metroWait.delete(id);
  }
}


// ---------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------
function queueMetroRider(p, fromId, toId) {
  p.riding = false;
  p.metroFrom = fromId;
  p.metroTo = toId;
  p.waitSince = gameMin;
  const list = metroWait.get(fromId);
  if (list) list.push(p); else metroWait.set(fromId, [p]);
  const s = B(fromId);
  if (s) s.waiting = (s.waiting || 0) + 1;
}

function boardMetro(m, p) {
  const list = metroWait.get(m.at);
  if (list) { const k = list.indexOf(p); if (k >= 0) list.splice(k, 1); }
  const s = B(m.at);
  if (s) s.waiting = Math.max(0, (s.waiting || 0) - 1);
  p.riding = true;
  p.hidden = true;
  p.ride = 0;
  m.riders.push(p);
}

function stepMetroWait() {
  for (const [id, list] of metroWait) {
    for (let k = list.length - 1; k >= 0; k--) {
      const p = list[k];
      if (p.dead || p.riding) {
        list.splice(k, 1);
        if (p.dead) { const s = B(id); if (s) s.waiting = Math.max(0, (s.waiting || 0) - 1); }
        continue;
      }
      // a station with no service should not strand anyone forever
      if (gameMin - (p.waitSince || 0) > METRO_GIVEUP) {
        list.splice(k, 1);
        const s = B(id);
        if (s) s.waiting = Math.max(0, (s.waiting || 0) - 1);
        nextLeg(p);
      }
    }
    if (!list.length) metroWait.delete(id);
  }
}

// ---------------------------------------------------------------------
// Trains
// ---------------------------------------------------------------------
// Take a train out of service without stranding anybody on board.
function retireMetro(m) {
  m.dead = true;
  for (const p of m.riders) if (!p.dead) { p.riding = false; p.hidden = false; nextLeg(p); }
  m.riders = [];
}

function metroDepart(m) {
  const here = B(m.at);
  if (!here) { retireMetro(m); return; }
  const waiting = (metroWait.get(m.at) || []).filter(p => !p.dead && !p.riding);

  // Prefer the destination most riders here are heading for, so a train
  // leaving a busy platform is actually useful.
  // Weighted by how many are going there, so a busy destination is served more
  // often but a quiet one is never starved of a train.
  const counts = [];
  let total = 0;
  for (const p of waiting) {
    if (!p.metroTo || p.metroTo === m.at || !B(p.metroTo)) continue;
    const hit = counts.find(c => c.id === p.metroTo);
    if (hit) { hit.n++; total++; }
    else { counts.push({ id: p.metroTo, n: 1 }); total++; }
  }
  let target = 0;
  if (total) {
    let r = Math.random() * total;
    for (const c of counts) { r -= c.n; if (r <= 0) { target = c.id; break; } }
    if (!target) target = counts[counts.length - 1].id;
  }
  // Nothing to do here: go home, or from home make one round trip out.
  if (!target) {
    if (m.at !== m.home) target = m.home;
    else {
      const others = stations.filter(s => s.id !== m.at);
      if (!others.length) { m.wait = 2; return; }
      target = others[Math.floor(Math.random() * others.length)].id;
    }
  }
  if (target === m.at) { m.wait = 2; return; }

  const D = B(target);
  if (!D) { m.wait = 2; return; }
  const path = railPath(stationTile(here), stationTile(D));
  if (!path || path.length < 2) { m.wait = 2; return; }   // no rails (yet): try again later

  // Only riders for the station this train stops at get on: a line can pass
  // another station without stopping, and nobody should ride past their stop.
  for (const p of waiting) {
    if (m.riders.length >= METRO_CAP) break;
    if (p.metroTo !== target) continue;
    boardMetro(m, p);
  }

  m.path = path; m.i = 0; m.t = 0; m.target = target;
  m.x = path[0] % MW * T + 4.5; m.y = (path[0] / MW | 0) * T + 4.5;
  m.at = 0;
  const nd = dirOf(path[0], path[1]);
  // Leaving a reversing block backwards is exactly what the block is for;
  // anywhere else a train can only go straight on around the curve.
  if (m.d && nd === OPP[m.d] && bits(rail[path[0]]) === 1) { m.state = 'reverse'; m.wait = METRO_REVERSE; }
  else m.state = 'run';
  m.d = nd;
}

function metroArrive(m) {
  const id = m.target, s = B(id);
  m.at = id; m.state = 'dwell'; m.wait = METRO_DWELL; m.target = 0;
  m.path = null; m.i = 0; m.t = 0;
  if (s) { m.x = s.x * T + 4.5; m.y = s.y * T + 4.5; }
  const staying = [];
  for (const p of m.riders) {
    if (p.dead) continue;
    // get off at your stop; if it was demolished while you were aboard, get off here
    if (p.metroTo === id || !B(p.metroTo)) { p.riding = false; p.ride = 0; p.hidden = false; nextLeg(p); }
    else staying.push(p);
  }
  m.riders = staying;
}

function stepMetros(dt) {
  for (const m of metros) {
    if (m.dead) continue;
    if (m.state === 'dwell') {
      m.wait -= dt;
      if (m.wait <= 0) metroDepart(m);
      continue;
    }
    if (m.state === 'reverse') {
      m.wait -= dt;
      if (m.wait <= 0) { m.state = 'run'; m.t = 0; }
      continue;
    }
    if (m.state !== 'run' || !m.path) continue;
    m.t += METRO_SPEED * dt;   // t is a fraction of one tile
    while (m.t >= 1) {
      m.t -= 1; m.i++;
      if (m.i >= m.path.length - 1) { metroArrive(m); break; }
    }
    if (m.state !== 'run') continue;
    const a = m.path[m.i], b = m.path[m.i + 1];
    // the player lifted the track out from under it: the fleet is rebuilt
    if (!rail[a] || !rail[b]) { retireMetro(m); continue; }
    const ax = a % MW, ay = a / MW | 0, bx = b % MW, by = b / MW | 0;
    m.x = (ax + (bx - ax) * m.t) * T + 4.5;
    m.y = (ay + (by - ay) * m.t) * T + 4.5;
    m.d = dirOf(a, b);
  }
  if (metros.some(m => m.dead)) metros = metros.filter(m => !m.dead);
}

function metroRiders() { let n = 0; for (const m of metros) n += m.riders.length; return n; }
function metroWaiting() { let n = 0; for (const [, list] of metroWait) n += list.length; return n; }
