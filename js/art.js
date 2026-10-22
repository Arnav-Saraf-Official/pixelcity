// =====================================================================
// Art: roads, bridges, paths, trees, buildings
// =====================================================================
const ARROW = [[4, 2], [3, 3], [5, 3], [4, 3], [4, 4], [4, 5], [4, 6]];
function rot(px, py, d) { return d === 1 ? [px, py] : d === 2 ? [8 - py, px] : d === 3 ? [8 - px, 8 - py] : [py, 8 - px]; }

function drawMarkings(c, x0, y0, m, hw, ow, ml, ed) {
  if (ml) {
    // one row of a wide highway: a lane divider, then on each side either the edge,
    // a dashed line to the next lane going the same way, or the median
    const horiz = ml === 2 || ml === 4;
    const dash = (pos) => { for (let k = 0; k < 9; k++) if ((((horiz ? x0 : y0) + k) % 6) < 3) horiz ? c.fillRect(x0 + k, y0 + pos, 1, 1) : c.fillRect(x0 + pos, y0 + k, 1, 1); };
    const line = (pos, col) => { c.fillStyle = col; horiz ? c.fillRect(x0, y0 + pos, 9, 1) : c.fillRect(x0 + pos, y0, 1, 9); };
    c.fillStyle = '#e8e8e8'; dash(4);
    if (!ed) ed = ml === 4 || ml === 3 ? [0, 2] : [2, 0];   // toolbar icon: median toward the other half
    for (let s = 0; s < 2; s++) {
      const edge = s ? 8 : 0, inner = s ? 7 : 1;
      if (ed[s] === 1) { line(edge, '#2e3038'); line(inner, '#2e3038'); c.fillStyle = '#e8e8e8'; dash(edge); }
      else if (ed[s] === 2) { line(edge, '#a9acb3'); line(inner, '#e3b542'); }
    }
    return;
  }
  if (ow) {
    c.fillStyle = '#f4f4f4';
    for (const [px, py] of ARROW) { const [rx, ry] = rot(px, py, ow); c.fillRect(x0 + rx, y0 + ry, 1, 1); }
    return;
  }
  const H = (m & 10) && !(m & 5), V = (m & 5) && !(m & 10);
  c.fillStyle = hw ? '#e3b542' : '#e8c55a';
  if (H) for (let x = 0; x < 9; x++) { if (hw || ((x0 + x) % 6) < 3) c.fillRect(x0 + x, y0 + 4, 1, 1); }
  else if (V) for (let y = 0; y < 9; y++) { if (hw || ((y0 + y) % 6) < 3) c.fillRect(x0 + 4, y0 + y, 1, 1); }
  if (bits(m) >= 3 && !hw) {
    c.fillStyle = '#d6d6d6';
    if (m & 1) for (const x of [2, 4, 6]) c.fillRect(x0 + x, y0 + 1, 1, 1);
    if (m & 4) for (const x of [2, 4, 6]) c.fillRect(x0 + x, y0 + 7, 1, 1);
    if (m & 8) for (const y of [2, 4, 6]) c.fillRect(x0 + 1, y0 + y, 1, 1);
    if (m & 2) for (const y of [2, 4, 6]) c.fillRect(x0 + 7, y0 + y, 1, 1);
  }
}

function drawRoadTile(c, x0, y0, m, hw, br, ow, sw, ml, ed) {
  if (br) { drawBridgeTile(c, x0, y0, m, hw, ow, sw, ml, ed); return; }
  const asph = hw ? '#2e3038' : '#3d4049';
  // highways get a barrier, streets a pale sidewalk, country roads a gravel shoulder
  c.fillStyle = hw ? '#7c8088' : sw ? '#c4c7cd' : '#8d8262'; c.fillRect(x0, y0, 9, 9);
  if (!hw) {
    c.fillStyle = sw ? '#a3a7ae' : '#6f8a4a';
    for (const k of [2, 6]) {
      if (!(m & 1)) c.fillRect(x0 + k, y0, 1, 1);
      if (!(m & 4)) c.fillRect(x0 + k, y0 + 8, 1, 1);
      if (!(m & 8)) c.fillRect(x0, y0 + k, 1, 1);
      if (!(m & 2)) c.fillRect(x0 + 8, y0 + k, 1, 1);
    }
  }
  c.fillStyle = asph; c.fillRect(x0 + 1, y0 + 1, 7, 7);
  if (m & 1) c.fillRect(x0 + 1, y0, 7, 1);
  if (m & 2) c.fillRect(x0 + 8, y0 + 1, 1, 7);
  if (m & 4) c.fillRect(x0 + 1, y0 + 8, 7, 1);
  if (m & 8) c.fillRect(x0, y0 + 1, 1, 7);
  if (hw) {
    c.fillStyle = '#d9d9d9';
    if (!(m & 1)) c.fillRect(x0 + 1, y0 + 1, 7, 1);
    if (!(m & 4)) c.fillRect(x0 + 1, y0 + 7, 7, 1);
    if (!(m & 8)) c.fillRect(x0 + 1, y0 + 1, 1, 7);
    if (!(m & 2)) c.fillRect(x0 + 7, y0 + 1, 1, 7);
  }
  drawMarkings(c, x0, y0, m, hw, ow, ml, ed);
}

// Road over water: a deck with railings, water showing at the open edges,
// and the deck's shadow and stone piers on the water below it.
function drawBridgeTile(c, x0, y0, m, hw, ow, sw, ml, ed) {
  const L = m & 8 ? 0 : 1, R = m & 2 ? 8 : 7, Tp = m & 1 ? 0 : 1, Bt = m & 4 ? 8 : 7;
  c.fillStyle = 'rgba(0,0,0,.34)';
  if (!(m & 4)) c.fillRect(x0 + L, y0 + 8, R - L + 1, 1);
  if (!(m & 2)) c.fillRect(x0 + 8, y0 + Tp, 1, Bt - Tp + 1);
  c.fillStyle = '#76695a';
  if (!(m & 4) && (m & 10)) { c.fillRect(x0 + 2, y0 + 8, 1, 1); c.fillRect(x0 + 6, y0 + 8, 1, 1); }
  if (!(m & 2) && (m & 5)) { c.fillRect(x0 + 8, y0 + 2, 1, 1); c.fillRect(x0 + 8, y0 + 6, 1, 1); }
  c.fillStyle = hw ? '#2e3038' : '#3d4049';
  c.fillRect(x0 + L, y0 + Tp, R - L + 1, Bt - Tp + 1);
  c.fillStyle = sw ? '#d8dade' : '#b3b6bd';
  if (!(m & 1)) c.fillRect(x0 + L, y0 + 1, R - L + 1, 1);
  if (!(m & 4)) c.fillRect(x0 + L, y0 + 7, R - L + 1, 1);
  if (!(m & 8)) c.fillRect(x0 + 1, y0 + Tp, 1, Bt - Tp + 1);
  if (!(m & 2)) c.fillRect(x0 + 7, y0 + Tp, 1, Bt - Tp + 1);
  c.fillStyle = '#5c5f66';
  for (const k of [1, 4, 7]) {
    if (!(m & 1)) c.fillRect(x0 + k, y0 + 1, 1, 1);
    if (!(m & 4)) c.fillRect(x0 + k, y0 + 7, 1, 1);
    if (!(m & 8)) c.fillRect(x0 + 1, y0 + k, 1, 1);
    if (!(m & 2)) c.fillRect(x0 + 7, y0 + k, 1, 1);
  }
  drawMarkings(c, x0, y0, m, hw, ow, ml, ed);
}

// East-west bridge deck drawn over a north-south road (an overpass).
function drawDeck(c, x0, y0, hw) {
  c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x0, y0 + 8, 9, 1);
  c.fillStyle = '#c3c6cd'; c.fillRect(x0, y0 + 1, 9, 7);
  c.fillStyle = '#8d9098'; c.fillRect(x0, y0 + 7, 9, 1);
  c.fillStyle = hw ? '#2e3038' : '#3d4049'; c.fillRect(x0, y0 + 2, 9, 5);
  c.fillStyle = hw ? '#e3b542' : '#e8c55a';
  for (let x = 0; x < 9; x++) if (hw || ((x0 + x) % 6) < 3) c.fillRect(x0 + x, y0 + 4, 1, 1);
}

function drawPathTile(c, x0, y0, m, br) {
  if (br) { c.fillStyle = '#7a5d3b'; c.fillRect(x0 + 2, y0 + 2, 5, 5); }
  c.fillStyle = br ? '#a9875a' : '#dbc99f';
  c.fillRect(x0 + 3, y0 + 3, 3, 3);
  if (m & 1) c.fillRect(x0 + 3, y0, 3, 3);
  if (m & 2) c.fillRect(x0 + 6, y0 + 3, 3, 3);
  if (m & 4) c.fillRect(x0 + 3, y0 + 6, 3, 3);
  if (m & 8) c.fillRect(x0, y0 + 3, 3, 3);
  c.fillStyle = br ? '#7a5d3b' : '#c9b384';
  c.fillRect(x0 + 4, y0 + 4, 1, 1);
}

function drawPlazaTile(c, x0, y0, i) {
  c.fillStyle = '#d3c9b4'; c.fillRect(x0, y0, 9, 9);
  c.fillStyle = '#c3b8a0';
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (((x0 + x) + (y0 + y)) % 4 === 0) c.fillRect(x0 + x, y0 + y, 1, 1);
  if (hash(i, 3, 9) < 0.14) {
    c.fillStyle = '#7a5b3a'; c.fillRect(x0 + 3, y0 + 4, 3, 2);
    c.fillStyle = '#3f9a42'; c.fillRect(x0 + 3, y0 + 2, 3, 3);
    c.fillStyle = '#5fbf5a'; c.fillRect(x0 + 3, y0 + 2, 2, 1);
  }
}

function drawTree(c, x0, y0, v) {
  const dx = (v & 1) ? 1 : -1, dy = (v & 2) ? 1 : 0;
  c.fillStyle = 'rgba(20,50,20,.35)'; c.fillRect(x0 + 3 + dx, y0 + 6 + dy, 4, 2);
  c.fillStyle = '#6b4a2b'; c.fillRect(x0 + 4 + dx, y0 + 5 + dy, 1, 2);
  c.fillStyle = v > 2 ? '#2b6e3a' : '#2f7d34';
  c.fillRect(x0 + 2 + dx, y0 + 2 + dy, 5, 3); c.fillRect(x0 + 3 + dx, y0 + 1 + dy, 3, 5);
  c.fillStyle = v > 2 ? '#3f8d4a' : '#4fa84f'; c.fillRect(x0 + 3 + dx, y0 + 2 + dy, 2, 1);
}

// Draws a building and returns where its windows / parking slots / status light are.
// `wet(tx, ty)` tells the art which footprint tiles sit on water (docks).
function drawBuilding(c, type, ox, oy, seed, wet) {
  const rnd = mulberry(seed);
  const d = BT[type], W = d.w * T;
  const art = {win: [], park: [], stat: null, order: [], berth: null};
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(ox + x, oy + y, w, h); };
  const Wn = (x, y) => { R(x, y, 1, 1, '#2b3a4e'); art.win.push([ox + x, oy + y]); };
  const P = (x, y, v) => art.park.push([ox + x, oy + y, v ? 1 : 0]);
  switch (type) {
    case 'house': {
      const roof = pick(['#c0504d', '#d2763a', '#8e5ea2', '#4f7cac', '#5f8f3a', '#b5651d', '#a83f5f', '#3f7f7f'], rnd()), wall = pick(['#efe3c8', '#e6d3b3', '#dcd6d0', '#f3efe6', '#d9c3a5'], rnd());
      R(0, 0, 9, 9, '#68ad52');
      R(1, 1, 7, 3, roof); R(2, 1, 5, 1, shade(roof, 28)); R(1, 3, 7, 1, shade(roof, -35));
      R(1, 4, 7, 3, wall); R(4, 5, 1, 2, '#6b4423'); Wn(2, 5); Wn(6, 5);
      if (rnd() < 0.6) R(6, 0, 1, 2, '#7a4a3a');
      R(0, 7, 9, 2, '#8c8f96'); P(1, 7, 0); P(5, 7, 0);
      break;
    }
    case 'farmhouse': {
      R(0, 0, 9, 9, '#7fb35a');
      for (let x = 0; x < 9; x += 2) { R(x, 0, 1, 1, '#c9a66b'); R(0, x, 1, 1, '#c9a66b'); }
      R(2, 1, 6, 2, '#8b3a2e'); R(3, 1, 4, 1, '#a8483a'); R(2, 3, 6, 3, '#f0e2c0');
      R(4, 4, 1, 2, '#5a3a22'); Wn(3, 4); Wn(6, 4); Wn(3, 3);
      R(1, 7, 3, 1, '#5a8f3a'); R(1, 7, 1, 1, '#e05a3a'); R(3, 7, 1, 1, '#e0c03a');
      R(5, 6, 3, 3, '#a8946e'); P(5, 6, 1);
      break;
    }
    case 'apartment': {
      const wall = pick(['#c9b79c', '#b8c4d0', '#d8c8b8', '#c7a98f', '#a9b7a0'], rnd());
      R(0, 0, 18, 18, '#68ad52');
      R(1, 1, 16, 12, wall); R(1, 1, 16, 2, shade(wall, -45)); R(3, 1, 2, 1, '#8f9aa3'); R(12, 1, 3, 1, '#8f9aa3');
      R(1, 12, 16, 1, shade(wall, -25));
      for (const y of [4, 6, 8, 10]) for (const x of [3, 5, 7, 10, 12, 14]) Wn(x, y);
      R(8, 10, 2, 3, '#5a3a22');
      R(0, 13, 18, 5, '#6f727a');
      for (const y of [14, 16]) for (const x of [1, 5, 10, 14]) P(x, y, 0);
      break;
    }
    case 'tower': {
      const wall = pick(['#9db0c4', '#b6a6c9', '#a7b9a2', '#c4b29a'], rnd());
      R(0, 0, 27, 27, '#68ad52');
      R(2, 1, 23, 19, wall); R(2, 1, 23, 2, shade(wall, -50)); R(2, 19, 23, 1, shade(wall, -30)); R(13, 1, 1, 1, '#e0e0e0');
      for (let y = 4; y <= 16; y += 2) for (let x = 4; x <= 22; x += 2) Wn(x, y);
      R(12, 17, 3, 3, '#3a2a1a');
      R(0, 21, 27, 6, '#6f727a');
      for (const y of [22, 24]) for (const x of [1, 5, 9, 13, 17, 21]) P(x, y, 0);
      break;
    }
    case 'shop': {
      const wall = pick(['#f0e6d2', '#e2d6c2', '#f4ecec'], rnd()), awn = pick(['#d9534f', '#3e8ed0', '#3bb273', '#e69a2e', '#9b59b6'], rnd());
      R(0, 0, 9, 9, '#c9c2b0');
      R(1, 1, 7, 5, wall); R(1, 1, 7, 1, shade(awn, -30));
      for (let x = 1; x <= 7; x++) R(x, 3, 1, 1, x % 2 ? awn : '#ffffff');
      Wn(2, 4); Wn(6, 4); R(4, 4, 1, 2, '#6b4423');
      R(0, 6, 9, 3, '#7a7d84'); P(0, 7, 0); P(3, 7, 0); P(6, 7, 0);
      break;
    }
    case 'market': {
      const sign = pick(['#d9534f', '#2f8f4f', '#e69a2e', '#3e6fd0'], rnd());
      R(0, 0, 18, 18, '#6f727a');
      R(1, 1, 16, 9, '#e8e2d2'); R(1, 1, 16, 1, '#bdb5a2'); R(4, 2, 10, 3, sign); R(5, 3, 8, 1, '#ffffff');
      for (const x of [2, 4, 6, 11, 13, 15]) Wn(x, 7);
      R(8, 7, 2, 3, '#4c5566');
      for (const y of [11, 14]) for (const x of [1, 5, 10, 14]) P(x, y, 0);
      R(0, 17, 18, 1, '#5f6168');
      break;
    }
    case 'mall': {
      const sign = pick(['#c0392b', '#8e44ad', '#16a085', '#d35400'], rnd());
      R(0, 0, 27, 27, '#6f727a');
      R(1, 1, 25, 14, '#d9d4e6'); R(1, 1, 25, 1, '#a9a3bb'); R(1, 14, 25, 1, '#b3adc4');
      for (let x = 4; x <= 21; x += 4) R(x, 3, 2, 5, '#8fd3ff');
      R(9, 9, 9, 2, sign); R(10, 9, 7, 1, shade(sign, 50));
      for (const x of [3, 5, 7, 19, 21, 23]) Wn(x, 12);
      R(12, 12, 3, 3, '#3c4250');
      for (const y of [17, 20, 23]) for (const x of [1, 5, 9, 14, 18, 22]) P(x, y, 0);
      break;
    }
    case 'office': {
      const glass = pick(['#4f7fa8', '#4f8f96', '#5a6fa8', '#6a7f96'], rnd());
      R(0, 0, 18, 18, '#68ad52');
      R(1, 1, 11, 16, glass); R(1, 1, 11, 1, shade(glass, 40)); R(1, 16, 11, 1, shade(glass, -35)); R(11, 1, 1, 16, shade(glass, -20));
      for (let y = 3; y <= 11; y += 2) for (const x of [3, 5, 7, 9]) Wn(x, y);
      R(5, 14, 2, 3, '#1c2533');
      R(13, 0, 5, 18, '#6f727a');
      for (const y of [1, 5, 9, 13]) for (const x of [13, 15]) P(x, y, 1);
      break;
    }
    case 'hq': {
      R(0, 0, 27, 27, '#68ad52'); R(0, 22, 21, 5, '#c9c2b0');
      R(3, 1, 17, 21, '#22384f'); R(4, 2, 15, 19, '#3d6488'); R(4, 2, 15, 1, '#6f95b8');
      for (let y = 4; y <= 18; y += 2) for (let x = 6; x <= 16; x += 2) Wn(x, y);
      R(11, 0, 1, 2, '#dddddd');
      R(10, 20, 3, 2, '#101820');
      R(21, 0, 6, 27, '#6f727a');
      for (const y of [1, 5, 9, 13, 17, 22]) for (const x of [21, 24]) P(x, y, 1);
      break;
    }
    case 'factory': {
      R(0, 0, 27, 18, '#8a8577');
      R(1, 1, 18, 11, '#a8a090');
      for (let k = 0; k < 6; k++) { R(1 + k * 3, 1, 3, 3, '#bdb4a0'); R(1 + k * 3, 3, 3, 1, '#6f695d'); R(1 + k * 3, 1, 1, 2, '#d8cfba'); }
      for (const y of [6, 8]) for (let x = 3; x <= 17; x += 2) Wn(x, y);
      R(8, 10, 3, 2, '#4a4438');
      R(21, 1, 2, 8, '#7a5a4a'); R(21, 1, 2, 1, '#2e2e2e');
      R(23, 4, 3, 3, '#b0b8c0'); R(23, 4, 3, 1, '#d6dde3'); R(23, 8, 3, 3, '#b0b8c0'); R(23, 8, 3, 1, '#d6dde3');
      R(0, 13, 27, 5, '#6f727a');
      for (const x of [1, 5, 9, 13, 17, 21]) P(x, 14, 0);
      break;
    }
    case 'warehouse': {
      R(0, 0, 27, 18, '#7a7d84');
      R(1, 1, 25, 10, '#b9bcc2');
      for (let x = 1; x < 26; x += 3) R(x, 1, 1, 10, '#a3a6ad');
      R(1, 10, 25, 1, '#8a8d93');
      for (const k of [0, 1, 2]) R(3 + k * 5, 11, 3, 1, '#3a3d44');
      for (const k of [0, 1]) { R(3 + k * 5, 12, 3, 4, '#e6e6e6'); R(3 + k * 5, 16, 3, 1, pick(['#2f6fd0', '#c0392b', '#27ae60'], rnd())); }
      R(19, 12, 7, 5, '#d8d2c4'); R(19, 12, 7, 1, '#a8a294'); Wn(21, 14); Wn(23, 14);
      P(14, 12, 1); P(16, 12, 1);
      break;
    }
    case 'dock': {
      let crane = false;
      for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
        const x = tx * 9, y = ty * 9;
        if (wet && wet(tx, ty)) {
          // pier: planks over the water with mooring posts
          R(x, y + 1, 9, 7, '#8b6a43');
          for (const k of [2, 4, 6]) R(x, y + k, 9, 1, '#6e5233');
          R(x, y + 1, 1, 1, '#3e2c1c'); R(x + 8, y + 1, 1, 1, '#3e2c1c'); R(x, y + 7, 1, 1, '#3e2c1c'); R(x + 8, y + 7, 1, 1, '#3e2c1c');
          if (!art.berth) art.berth = [tx, ty];
        } else {
          R(x, y, 9, 9, '#9a9ca2');
          if (!crane) {
            crane = true;
            R(x + 1, y + 1, 6, 4, '#d8d2c4'); R(x + 1, y + 1, 6, 1, '#a8a294'); Wn(x + 2, y + 3); Wn(x + 5, y + 3);
            R(x + 7, y, 1, 6, '#e0b030'); R(x + 3, y, 6, 1, '#e0b030');
          } else {
            R(x + 1, y + 1, 3, 3, '#b07a3a'); R(x + 1, y + 1, 3, 1, '#8a5a2a');
            R(x + 5, y + 1, 3, 4, pick(['#c0392b', '#2f6fd0', '#27ae60', '#e67e22'], rnd()));
          }
          P(x + 5, y + 6, 0);
        }
      }
      break;
    }
    case 'farm': {
      R(0, 0, 36, 27, '#7fb35a');
      for (let y = 0; y < 17; y++) R(0, y, 22, 1, y % 3 === 0 ? '#c9b24a' : y % 3 === 1 ? '#a8c04a' : '#86a83c');
      R(0, 18, 22, 9, '#6d5a3a'); for (let y = 19; y < 27; y += 2) R(0, y, 22, 1, '#5a4a30');
      R(24, 2, 10, 8, '#b33a2e'); R(24, 2, 10, 2, '#7a2a22'); R(27, 7, 4, 3, '#5a2420'); R(28, 8, 1, 1, '#e8e2d2'); R(29, 7, 1, 1, '#e8e2d2');
      Wn(25, 5); Wn(32, 5);
      R(25, 12, 4, 8, '#c8ccd2'); R(25, 11, 4, 1, '#9aa0a8'); R(25, 15, 4, 1, '#9aa0a8');
      R(30, 14, 3, 2, '#3a8a3a'); R(30, 16, 1, 1, '#222222'); R(32, 16, 1, 1, '#222222');
      R(23, 21, 13, 6, '#a8946e'); P(24, 22, 0); P(28, 22, 0); P(32, 22, 0);
      break;
    }
    case 'orchard': {
      R(0, 0, 27, 27, '#6fa84a');
      for (const ty of [1, 8, 15]) for (const tx of [1, 9, 17]) {
        R(tx + 3, ty + 4, 1, 2, '#6b4a2b');
        R(tx + 1, ty, 5, 4, '#2f7d34'); R(tx + 2, ty - (ty > 1 ? 0 : 0), 3, 5, '#2f7d34'); R(tx + 2, ty, 2, 1, '#4fa84f');
        R(tx + 2, ty + 1, 1, 1, '#e04a3a'); R(tx + 4, ty + 2, 1, 1, '#e04a3a'); R(tx + 1, ty + 3, 1, 1, '#f0a030');
      }
      R(1, 22, 6, 4, '#8a6a4a'); R(1, 22, 6, 1, '#5a4030'); Wn(3, 24);
      R(8, 22, 19, 5, '#a8946e'); P(10, 23, 0); P(15, 23, 0); P(20, 23, 0);
      break;
    }
    case 'school': {
      R(0, 0, 27, 18, '#68ad52');
      R(1, 1, 17, 10, '#b5543c'); R(1, 1, 17, 1, '#7a3424');
      for (const y of [4, 7]) for (const x of [3, 5, 7, 11, 13, 15]) Wn(x, y);
      R(9, 8, 2, 3, '#3a2a1a');
      R(20, 1, 1, 6, '#dddddd'); R(21, 1, 3, 2, '#3a6fd0');
      R(19, 8, 7, 3, '#c9a66b'); R(20, 8, 4, 1, '#c0392b'); R(24, 9, 1, 2, '#f1c40f');
      R(0, 12, 27, 6, '#6f727a');
      for (const x of [9, 13, 17, 21]) P(x, 13, 0);
      R(1, 13, 6, 3, '#f5c518'); R(2, 13, 4, 1, '#9fc4e0');
      break;
    }
    case 'hospital': {
      R(0, 0, 27, 27, '#68ad52');
      R(2, 1, 20, 16, '#eef0f2'); R(2, 16, 20, 1, '#c4c8ce');
      R(10, 4, 4, 10, '#d63a3a'); R(7, 7, 10, 4, '#d63a3a');
      for (let y = 3; y <= 13; y += 2) for (const x of [3, 5, 18, 20]) Wn(x, y);
      R(22, 2, 5, 5, '#5a5d64');
      for (const [x, y] of [[23, 3], [23, 4], [23, 5], [25, 3], [25, 4], [25, 5], [24, 4]]) R(x, y, 1, 1, '#ffffff');
      R(10, 17, 5, 2, '#d63a3a'); R(17, 18, 3, 2, '#ffffff'); R(18, 18, 1, 2, '#d63a3a');
      R(0, 20, 27, 7, '#6f727a');
      for (const y of [21, 24]) for (const x of [1, 5, 9, 13, 17, 21]) P(x, y, 0);
      break;
    }
    case 'airport': {
      R(0, 0, 90, 45, '#7fa85a');
      R(0, 4, 90, 9, '#3a3d44'); R(0, 4, 90, 1, '#cfd2d6'); R(0, 12, 90, 1, '#cfd2d6');
      for (let x = 8; x < 82; x += 6) R(x, 8, 3, 1, '#ffffff');
      for (let k = 0; k < 4; k++) { R(1, 5 + k * 2, 3, 1, '#ffffff'); R(86, 5 + k * 2, 3, 1, '#ffffff'); }
      R(10, 13, 70, 3, '#4a4d55'); R(8, 16, 74, 10, '#5a5d64');
      for (const x of [20, 34, 48]) { R(x, 20, 7, 1, '#f4f5f7'); R(x + 3, 18, 1, 5, '#f4f5f7'); R(x, 19, 1, 3, '#d63a3a'); }
      R(14, 27, 52, 10, '#d9dde4'); R(14, 27, 52, 1, '#a8adb6');
      for (let x = 16; x < 65; x += 2) Wn(x, 31);
      for (const x of [22, 36, 50]) R(x, 24, 2, 3, '#9aa0a8');
      R(70, 26, 4, 11, '#c8ccd2'); R(69, 25, 6, 3, '#5a8fc0');
      R(14, 38, 60, 7, '#6f727a');
      for (const y of [39, 42]) for (let x = 15; x <= 69; x += 4) P(x, y, 0);
      break;
    }
    case 'park': {
      R(0, 0, 18, 18, '#5bb04a');
      for (let k = 0; k < 18; k++) R(Math.floor(rnd() * 18), Math.floor(rnd() * 18), 1, 1, rnd() < 0.5 ? '#f5e663' : '#ff9ec4');
      R(8, 0, 2, 18, '#dbc99f'); R(0, 8, 18, 2, '#dbc99f');
      R(11, 12, 5, 4, '#3f82c8'); R(12, 11, 3, 1, '#3f82c8'); R(12, 13, 1, 1, '#9fd0ff');
      drawTree(c, ox, oy, 1); drawTree(c, ox + 10, oy, 2); drawTree(c, ox, oy + 9, 3);
      R(4, 10, 3, 1, '#8b5a2b');
      for (const [x, y] of [[3, 7], [6, 6], [12, 6], [14, 3], [5, 12], [2, 15], [6, 15], [11, 10], [15, 10], [4, 3], [13, 16], [16, 7]]) art.win.push([ox + x, oy + y]);
      break;
    }
    case 'metro': {
      R(0, 0, 9, 9, '#cfc6b4'); R(1, 1, 7, 7, '#bdb39e');
      R(2, 1, 5, 4, '#1f4fb0');
      for (const [x, y] of [[3, 2], [3, 3], [4, 2], [5, 2], [5, 3]]) R(x, y, 1, 1, '#ffffff');
      R(2, 6, 5, 2, '#8a8170'); R(2, 7, 5, 1, '#5f584b');
      break;
    }
    case 'busstop': {
      R(0, 0, 9, 9, '#c4c7cd'); R(1, 1, 7, 3, '#3a6f9a'); R(1, 1, 7, 1, '#6f9fc8'); R(2, 4, 5, 1, '#8b5a2b');
      R(7, 4, 1, 4, '#5c5f66'); R(6, 4, 3, 2, '#f5c518'); R(7, 4, 1, 1, '#2f4f6f');
      art.spots = [[2, 6], [4, 6], [3, 7], [5, 7], [1, 7], [2, 5]].map(([x, y]) => [ox + x, oy + y]);
      break;
    }
    case 'parking': {
      R(0, 0, 18, 18, '#4a4d55'); R(0, 0, 18, 1, '#8c8f96'); R(0, 17, 18, 1, '#8c8f96');
      for (const x of [0, 3, 6, 9, 12, 15]) { R(x, 1, 1, 4, '#d8d8d8'); R(x, 13, 1, 4, '#d8d8d8'); }
      for (const y of [1, 14]) for (const x of [1, 4, 7, 10, 13, 16]) P(x, y, 1);
      R(7, 8, 4, 1, '#d8d8d8'); R(10, 7, 1, 3, '#d8d8d8');
      break;
    }
    case 'garage': {
      R(0, 0, 18, 18, '#9a9ca2'); R(1, 1, 16, 16, '#7d8087');
      R(13, 2, 3, 14, '#6a6d73'); for (let y = 3; y < 16; y += 2) R(13, y, 3, 1, '#8a8d93');
      R(2, 2, 4, 5, '#2f6fd0'); for (const [x, y] of [[3, 3], [3, 4], [3, 5], [4, 3], [4, 4]]) R(x, y, 1, 1, '#ffffff');
      for (const y of [2, 6, 10]) for (const x of [7, 10]) P(x, y, 1);
      for (const x of [2, 4]) P(x, 10, 1);
      for (const x of [2, 7, 10]) P(x, 14, 0);
      break;
    }
  }
  if (type === 'metro') art.spots = [[1, 5], [7, 5], [1, 7], [7, 7], [1, 3], [7, 3]].map(([x, y]) => [ox + x, oy + y]);
  if (type !== 'metro' && type !== 'park' && type !== 'busstop') art.stat = [ox + W - 2, oy];
  art.order = shuffle(art.win.map((_, k) => k), mulberry(seed ^ 0x55));
  return art;
}
const wetFor = b => (tx, ty) => water[(b.y + ty) * MW + b.x + tx] === 1;

function drawCarSprite(c, x, y, horiz, col) {
  c.fillStyle = col;
  if (horiz) { c.fillRect(x, y, 3, 2); c.fillStyle = '#a9d2ee'; c.fillRect(x + 1, y, 1, 2); }
  else { c.fillRect(x, y, 2, 3); c.fillStyle = '#a9d2ee'; c.fillRect(x, y + 1, 2, 1); }
}
