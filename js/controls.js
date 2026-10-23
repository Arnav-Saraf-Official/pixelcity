// =====================================================================
// Tools & input
// =====================================================================
const TOOLS = {
  inspect:   {name: 'Inspect', kind: 'inspect', key: 'Q', desc: 'Click buildings, roads and traffic lights to see details and tune them.'},
  select:    {name: 'Select', kind: 'select', key: 'X', desc: 'Drag a box to highlight an area. Copy (Ctrl+C), cut (Ctrl+X) or delete (Del) it, then paste (Ctrl+V) and click to place copies.'},
  bulldoze:  {name: 'Bulldoze', kind: 'rect', key: 'B', desc: 'Drag a box to clear roads, buildings and trees.'},
  road:      {cat: 'roads', group: 'Streets', name: 'Street', kind: 'line', key: 'R', desc: 'Two-way street with sidewalks on both sides. Drag to draw.'},
  country:   {cat: 'roads', group: 'Streets', name: 'Country Road', kind: 'line', key: 'K', desc: 'A street with gravel shoulders and no sidewalks. Nobody walks along it.'},
  sidewalk:  {cat: 'roads', group: 'Streets', name: 'Sidewalks', kind: 'line', key: 'J', desc: 'Drag along streets to add sidewalks. Start on a street that has them to remove them instead.'},
  oneway:    {cat: 'roads', group: 'Streets', name: 'One-Way', kind: 'line', key: 'O', desc: 'Drag in the direction traffic should flow. Click a one-way tile to rotate it.'},
  highway:   {cat: 'roads', group: 'Streets', name: 'Highway', kind: 'line', key: 'H', desc: 'Fast road (1.7x speed). Draw two side by side for two lanes each way. Buildings can\'t connect to it.'},
  light:     {cat: 'roads', group: 'Junctions', name: 'Traffic Light', kind: 'click', key: 'L', desc: 'Click a 3- or 4-way intersection to add or remove a signal.'},
  overpass:  {cat: 'roads', group: 'Junctions', name: 'Overpass', kind: 'click', key: 'U', desc: 'Click a 4-way crossing to bridge one road over the other. Traffic flies straight through, but nobody can turn there, so build ramps.'},
  'b:house': {cat: 'res'}, 'b:apartment': {cat: 'res'}, 'b:tower': {cat: 'res'}, 'b:farmhouse': {cat: 'res'},
  'b:office': {cat: 'work', group: 'Offices & industry'}, 'b:hq': {cat: 'work', group: 'Offices & industry'},
  'b:factory': {cat: 'work', group: 'Offices & industry'}, 'b:warehouse': {cat: 'work', group: 'Offices & industry'},
  'b:dock': {cat: 'work', group: 'Resources'}, 'b:quarry': {cat: 'work', group: 'Resources'},
  'b:mine': {cat: 'work', group: 'Resources'}, 'b:oilRig': {cat: 'work', group: 'Resources'},
  'b:gasWell': {cat: 'work', group: 'Resources'}, 'b:seafoodPlant': {cat: 'work', group: 'Resources'},
  'b:shop': {cat: 'com'}, 'b:market': {cat: 'com'}, 'b:mall': {cat: 'com'}, 'b:seafoodMarket': {cat: 'com'},
  'b:woodPlant': {cat: 'power'}, 'b:coalPlant': {cat: 'power'}, 'b:gasPlant': {cat: 'power'}, 'b:hydroPlant': {cat: 'power'}, 'b:solarPlant': {cat: 'power'}, 'b:nuclearPlant': {cat: 'power'},
  'b:farm': {cat: 'rural'}, 'b:orchard': {cat: 'rural'}, 'b:greenhouse': {cat: 'rural'}, 'b:loggingCamp': {cat: 'rural'}, 'b:fishery': {cat: 'rural'},
  'b:school': {cat: 'civic'}, 'b:hospital': {cat: 'civic'}, 'b:airport': {cat: 'civic'},
  'b:fireStation': {cat: 'civic'}, 'b:policeStation': {cat: 'civic'}, 'b:researchLab': {cat: 'civic'},
  'b:metro': {cat: 'transit', group: 'Metro'},
  rail:      {cat: 'transit', group: 'Metro', name: 'Metro Rails', kind: 'line', key: 'T', desc: 'Drag to lay track under the city. Rails that share an edge connect on their own, so a crossing becomes a junction and a loose end becomes a reversing block. Draw from a station tile to join the line to it.'},
  unrail:    {cat: 'transit', group: 'Metro', name: 'Lift Rails', kind: 'rect', desc: 'Drag a box to take up metro track. Bulldoze does the same while the Underground layer is showing.'},
  'b:busstop': {cat: 'transit', group: 'Walking & parking'},
  path:      {cat: 'transit', group: 'Walking & parking', name: 'Footpath', kind: 'line', key: 'F', desc: 'Pedestrian path. Makes nearby buildings walkable, so fewer people drive.'},
  plaza:     {cat: 'transit', group: 'Walking & parking', name: 'Plaza', kind: 'rect', desc: 'Paved pedestrian square. Drag a box. Raises the walk score of everything nearby.'},
  'b:park': {cat: 'transit', group: 'Walking & parking'},
  'b:parking': {cat: 'transit', group: 'Walking & parking'}, 'b:garage': {cat: 'transit', group: 'Walking & parking'},
  track:     {cat: 'transit', group: 'Freight', name: 'Freight Track', kind: 'line', key: 'I', desc: 'Drag to lay surface rail for freight trains. Track joins track that touches it, can cross a street at grade, and bridges water. Train yards and distribution terminals have to touch it.'},
  untrack:   {cat: 'transit', group: 'Freight', name: 'Lift Freight Track', kind: 'rect', desc: 'Drag a box to take up surface freight track.'},
  'b:railyard': {cat: 'transit', group: 'Freight'},
  'b:port': {cat: 'transit', group: 'Freight'}, 'b:distribution': {cat: 'transit', group: 'Freight'},
  tree:      {cat: 'nature', name: 'Trees', kind: 'brush', desc: 'Paint trees on empty grass.'},
  water:     {cat: 'nature', name: 'Water', kind: 'rect', desc: 'Drag a box to flood land. Roads over water become bridges.'},
  land:      {cat: 'nature', name: 'Land', kind: 'rect', desc: 'Drag a box to fill in water.'},
  district:  {cat: 'districts', name: 'District', kind: 'rect', key: 'D', desc: 'Drag a box to paint the active district over those tiles. Draw as many districts as you like, of any shape; nothing is fixed to a grid.'},
  undistrict:{cat: 'districts', name: 'Erase District', kind: 'rect', desc: 'Drag a box to remove district paint from those tiles.'},
};
for (const id in TOOLS) if (id.startsWith('b:')) {
  const d = BT[id.slice(2)];
  const parts = [];
  if (d.homes) parts.push(`Homes ${d.homes}`);
  if (d.jobs) parts.push(`Jobs ${d.jobs}`);
  if (d.cap) parts.push(`Parking ${d.cap}`);
  parts.push(`${d.w}×${d.h}`);
  Object.assign(TOOLS[id], {name: d.name, kind: 'build', desc: d.desc, stats: parts.join(' · ')});
}
const CATS = [
  {id: 'roads', name: 'Roads'}, {id: 'res', name: 'Housing'}, {id: 'work', name: 'Work'}, {id: 'com', name: 'Shops'},
  {id: 'power', name: 'Power'}, {id: 'rural', name: 'Agriculture'}, {id: 'civic', name: 'Civic'},
  {id: 'transit', name: 'Transit'}, {id: 'districts', name: 'Districts'}, {id: 'nature', name: 'Nature'},
];
let curTool = 'inspect', curCat = null;
let hoverT = {x: -1, y: -1}, drag = null, pan = null, spaceDown = false;
let mouse = {x: 0, y: 0, in: false};

function screenToTile(sx, sy) { const ax = sx / cam.z + cam.x, ay = sy / cam.z + cam.y; return {x: Math.floor(ax / T), y: Math.floor(ay / T)}; }
function anchorFor(type, t) { const d = BT[type]; return {x: t.x - ((d.w - 1) >> 1), y: t.y - ((d.h - 1) >> 1)}; }
function lineTiles(sx, sy, ex, ey) {
  sx = clamp(sx, 0, MW - 1); sy = clamp(sy, 0, MH - 1);
  ex = clamp(ex, 0, MW - 1); ey = clamp(ey, 0, MH - 1);
  const pts = [[sx, sy]]; let x = sx, y = sy;
  const dx = Math.sign(ex - sx), dy = Math.sign(ey - sy);
  if (Math.abs(ex - sx) >= Math.abs(ey - sy)) { while (x !== ex) { x += dx; pts.push([x, y]); } while (y !== ey) { y += dy; pts.push([x, y]); } }
  else { while (y !== ey) { y += dy; pts.push([x, y]); } while (x !== ex) { x += dx; pts.push([x, y]); } }
  const tiles = pts.map(([a, b]) => b * MW + a);
  const dirs = tiles.map((t, k) => k < tiles.length - 1 ? dirOf(t, tiles[k + 1]) : (k > 0 ? dirOf(tiles[k - 1], t) : 0));
  return {tiles, dirs};
}
function rectTiles(sx, sy, ex, ey) {
  const x0 = Math.max(0, Math.min(sx, ex)), x1 = Math.min(MW - 1, Math.max(sx, ex)), y0 = Math.max(0, Math.min(sy, ey)), y1 = Math.min(MH - 1, Math.max(sy, ey));
  const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * MW + x);
  return out;
}
function commitLine(tool, sx, sy, ex, ey) {
  const {tiles, dirs} = lineTiles(sx, sy, ex, ey);
  if (tool === 'oneway' && tiles.length === 1) {
    const i = tiles[0]; if (bldAt[i]) return;
    if (tile[i] === 1 && oneway[i]) oneway[i] = oneway[i] % 4 + 1; else { if (tile[i] !== 1) walkway[i] = 1; tile[i] = 1; oneway[i] = 2; }
    tree[i] = 0; markTiles([i]); mapChanged(); return;
  }
  if (tool === 'sidewalk') {
    const add = !(tile[tiles[0]] === 1 && walkway[tiles[0]]);
    let n = 0; for (const i of tiles) if (tile[i] === 1) { walkway[i] = add ? 1 : 0; n++; }
    if (!n) { toast('Sidewalks go along streets. Drag over a street.'); return; }
    markTiles(tiles); mapChanged(); return;
  }
  if (tool === 'rail') {
    // Drawing always lays track, so a line can start on an existing rail and
    // branch off it; `Lift Rails` is the separate eraser. Adjacent rails connect
    // by themselves, and mapChanged() rebuilds the connection masks.
    let n = 0;
    for (const i of tiles) if (!railOn[i]) { railOn[i] = 1; n++; }
    if (!n) { toast('There is already rail along that line.'); return; }
    mapChanged();
    return;
  }
  if (tool === 'track') {
    // Surface freight track may cross a street at grade, and bridges water; it
    // only refuses a tile a building stands on.
    let n = 0, blocked = 0;
    for (const i of tiles) {
      if (bldAt[i]) { blocked++; continue; }
      if (!trackOn[i]) { trackOn[i] = 1; tree[i] = 0; n++; }
    }
    if (!n) { toast(blocked ? 'Buildings are in the way of that line.' : 'There is already freight track along that line.'); return; }
    markTiles(tiles); mapChanged();
    return;
  }
  let changed = false;
  tiles.forEach((i, k) => {
    if (bldAt[i]) return;
    if (tool === 'road') { tile[i] = 1; oneway[i] = 0; walkway[i] = 1; }
    else if (tool === 'country') { tile[i] = 1; oneway[i] = 0; walkway[i] = 0; }
    else if (tool === 'highway') { tile[i] = 2; oneway[i] = 0; walkway[i] = 0; lights.delete(i); }
    else if (tool === 'oneway') { if (tile[i] !== 1) walkway[i] = 1; tile[i] = 1; oneway[i] = dirs[k]; }
    else if (tool === 'path') { if (isRoad(i)) return; tile[i] = 3; }
    tree[i] = 0; changed = true;
  });
  if (changed) { markTiles(tiles); mapChanged(); }
}
function commitRect(tool, sx, sy, ex, ey) {
  const tiles = rectTiles(sx, sy, ex, ey);
  if (tool === 'bulldoze') {
    // In the Underground view the same tool clears tunnels instead of the city.
    if (curTool === 'bulldoze' && overlays.underground) {
      for (const i of tiles) railOn[i] = 0;
    } else {
      const kill = new Set();
      for (const i of tiles) { if (bldAt[i]) kill.add(bldAt[i]); tile[i] = 0; oneway[i] = 0; walkway[i] = 0; tree[i] = 0; overpass[i] = 0; trackOn[i] = 0; lights.delete(i); }
      for (const id of kill) { const b = B(id); if (b) removeBuilding(b); }
    }
  } else if (tool === 'plaza') {
    for (const i of tiles) if (!bldAt[i] && !isRoad(i) && !water[i]) { tile[i] = 4; tree[i] = 0; }
  } else if (tool === 'water') {
    for (const i of tiles) if (!bldAt[i] && tile[i] !== 4) { water[i] = 1; tree[i] = 0; }
  } else if (tool === 'land') {
    for (const i of tiles) if (!bldAt[i] || !BT[B(bldAt[i]).type].water) water[i] = 0;
  } else if (tool === 'unrail') {
    for (const i of tiles) railOn[i] = 0;
  } else if (tool === 'untrack') {
    for (const i of tiles) trackOn[i] = 0;
  } else if (tool === 'district') {
    let d = districts.get(activeDistrict);
    if (!d) {
      const name = (typeof prompt === 'function' ? prompt('District name:', 'District ' + (districts.size + 1)) : '') || '';
      d = newDistrict(name.trim().slice(0, 24));
      activeDistrict = d.id;
    }
    for (const i of tiles) districtLayer[i] = d.id;
    markTiles(tiles);
    updateDistrictUI();
  } else if (tool === 'undistrict') {
    for (const i of tiles) districtLayer[i] = 0;
    markTiles(tiles);
    updateDistrictUI();
  }
  if (tool !== 'district' && tool !== 'undistrict') { markTiles(tiles); }
  mapChanged();
}
let activeDistrict = 0;
function updateDistrictUI() {
  const box = document.getElementById('districtList');
  if (!box) return;
  box.replaceChildren();
  for (const d of districts.values()) {
    let n = 0;
    for (let i = 0; i < N; i++) if (districtLayer[i] === d.id) n++;
    const b = document.createElement('button');
    b.className = 'card' + (d.id === activeDistrict ? ' on' : '');
    b.style.borderColor = d.color;
    b.textContent = d.name + '  (' + n + ' tiles)';
    b.onclick = () => { activeDistrict = d.id; updateDistrictUI(); };
    box.append(b);
  }
  if (!districts.size) {
    const p = document.createElement('small');
    p.textContent = 'No districts yet. Use District and drag a box to draw one.';
    box.append(p);
  }
}
function tryBuild(t) {
  const type = curTool.slice(2), a = anchorFor(type, t);
  const why = whyNot(type, a.x, a.y);
  if (why) {
    if (!drag) toast(why);
    return false;
  }
  const b = placeBuilding(type, a.x, a.y);
  markDirty(a.x, a.y, a.x + BT[type].w - 1, a.y + BT[type].h - 1);
  if (type === 'metro') {
    // a station always sits on track, even before the player draws a line to it
    railOn[b.y * MW + b.x] = 1;
    if (!stations.length || stations.length === 1) toast('Station built. Draw Metro Rails to connect it to another station.');
  }
  mapChanged();
  if (b.road < 0 && b.walk < 0 && type !== 'park') toast(`${BT[type].name} needs a road next to it.`);
  return true;
}
function brushTree(t) {
  for (let k = 0; k < 3; k++) {
    const x = t.x + Math.round((Math.random() - 0.5) * 2), y = t.y + Math.round((Math.random() - 0.5) * 2);
    if (!inb(x, y)) continue; const i = y * MW + x;
    if (!tile[i] && !water[i] && !bldAt[i]) { tree[i] = 1 + Math.floor(Math.random() * 4); markDirty(x, y, x, y); }
  }
}
function clickOverpass(t) {
  if (!inb(t.x, t.y)) return;
  const i = t.y * MW + t.x;
  if (!isRoad(i) || deg[i] !== 4) { toast('Overpasses go on 4-way crossings. Draw one road across another first.'); return; }
  overpass[i] = overpass[i] ? 0 : 1; lights.delete(i);
  markTiles([i]); mapChanged();
}
function clickLight(t) {
  if (!inb(t.x, t.y)) return;
  const i = t.y * MW + t.x;
  if (overpass[i]) { toast('Overpasses don\'t need lights. Traffic never crosses there.'); return; }
  if (!isRoad(i) || deg[i] < 3) { toast('Traffic lights go on 3- or 4-way intersections.'); return; }
  if (lights.has(i)) lights.delete(i); else lights.set(i, {ns: 8, ew: 8, off: Math.random() * 10});
  mapChanged();
}

// ---- Select, copy, cut, paste ---------------------------------------------------
// The clipboard holds roads, paths, plazas, trees, lights and the buildings that sit fully inside the box.
let selRect = null, clip = null, pasteMode = false;
function selSize() { return selRect ? [selRect.x1 - selRect.x0 + 1, selRect.y1 - selRect.y0 + 1] : [0, 0]; }
function copySel(cut) {
  if (!selRect) { toast('Drag a box with the Select tool first.'); return; }
  const {x0, y0, x1, y1} = selRect, [w, h] = selSize();
  const tiles = [], blds = [], lts = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * MW + x;
    if (tile[i] || (tree[i] && !bldAt[i])) tiles.push([x - x0, y - y0, tile[i], oneway[i], walkway[i], overpass[i], tile[i] ? 0 : tree[i]]);
  }
  for (const b of buildings.values()) if (b.x >= x0 && b.y >= y0 && b.x + b.w - 1 <= x1 && b.y + b.h - 1 <= y1) blds.push([b.type, b.x - x0, b.y - y0]);
  for (const [i, L] of lights) { const x = i % MW, y = i / MW | 0; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) lts.push([x - x0, y - y0, L.ns, L.ew, Math.round(L.off)]); }
  clip = {v: 1, w, h, tiles, b: blds, l: lts};
  // also put it on the system clipboard, so a copied area can be pasted into another game
  try { navigator.clipboard.writeText('PTCB1.' + b64(new TextEncoder().encode(JSON.stringify(clip)))).catch(() => {}); } catch (e) {}
  if (cut) { commitRect('bulldoze', x0, y0, x1, y1); toast(`Cut a ${w}×${h} area. Paste it with Ctrl+V.`); }
  else toast(`Copied a ${w}×${h} area with ${blds.length} buildings. Paste it with Ctrl+V.`);
  updateSelBar();
}
function deleteSel() {
  if (!selRect) return;
  const {x0, y0, x1, y1} = selRect;
  commitRect('bulldoze', x0, y0, x1, y1);
  toast('Cleared the highlighted area.');
}
function startPaste() {
  if (!clip) { toast('Copy an area first: highlight it with Select, then Ctrl+C.'); return; }
  if (curTool !== 'select') setTool('select');
  pasteMode = true; selRect = null; updateSelBar();
}
function stopPaste() { pasteMode = false; updateSelBar(); }
const pasteOrigin = t => ({x: t.x - (clip.w >> 1), y: t.y - (clip.h >> 1)});
function pasteAt(t) {
  const o = pasteOrigin(t);
  let skipped = 0;
  for (const [dx, dy, tt, ow, sw, ov, tr] of clip.tiles) {
    const x = o.x + dx, y = o.y + dy; if (!inb(x, y)) continue;
    const i = y * MW + x;
    if (bldAt[i]) { if (tt) skipped++; continue; }
    if (tt) {
      if (tt === 4 && water[i]) { skipped++; continue; }
      tile[i] = tt; oneway[i] = ow; walkway[i] = sw; overpass[i] = ov; tree[i] = 0;
    } else if (tr && !tile[i] && !water[i]) tree[i] = tr;
  }
  for (const [dx, dy, ns, ew, off] of clip.l) { const x = o.x + dx, y = o.y + dy; if (inb(x, y)) lights.set(y * MW + x, {ns, ew, off}); }
  for (const [type, dx, dy] of clip.b) { if (canPlace(type, o.x + dx, o.y + dy)) placeBuilding(type, o.x + dx, o.y + dy); else skipped++; }
  markDirty(o.x, o.y, o.x + clip.w - 1, o.y + clip.h - 1);
  mapChanged();
  if (skipped) toast(`Pasted. ${skipped} piece${skipped > 1 ? 's' : ''} didn't fit where something was already built.`);
}
// A copied area pasted from the system clipboard (from this or another game) is checked like a save.
function importClip(text) {
  try {
    const c = JSON.parse(new TextDecoder().decode(unb64(text.slice(6))));
    if (!c || c.v !== 1 || !isInt(c.w, 1, MW) || !isInt(c.h, 1, MH) || !Array.isArray(c.tiles) || !Array.isArray(c.b) || !Array.isArray(c.l) || c.tiles.length > c.w * c.h || c.b.length > 5000 || c.l.length > 5000) throw 0;
    const inBox = (dx, dy) => isInt(dx, 0, c.w - 1) && isInt(dy, 0, c.h - 1);
    for (const e of c.tiles) if (!Array.isArray(e) || !inBox(e[0], e[1]) || !isInt(e[2], 0, 4) || !isInt(e[3], 0, 4) || !isInt(e[4], 0, 1) || !isInt(e[5], 0, 1) || !isInt(e[6], 0, 4)) throw 0;
    for (const e of c.b) if (!Array.isArray(e) || !hasType(e[0]) || !inBox(e[1], e[2])) throw 0;
    for (const e of c.l) if (!Array.isArray(e) || !inBox(e[0], e[1]) || !isInt(e[2], 3, 25) || !isInt(e[3], 3, 25) || !isInt(e[4], 0, 60)) throw 0;
    clip = c; startPaste(); toast(`Pasted area ready: ${c.w}×${c.h}. Click to place it.`);
  } catch (e) { toast('That copied area is damaged, so it was not pasted.'); }
}
function updateSelBar() {
  const bar = document.getElementById('selBar');
  bar.classList.toggle('hidden', curTool !== 'select');
  const [w, h] = selSize();
  setT('selInfo', pasteMode ? `Click to place the ${clip.w}×${clip.h} copy · Esc to stop` : selRect ? `${w}×${h} highlighted` : 'Drag a box to highlight an area');
  document.getElementById('selCopy').disabled = !selRect;
  document.getElementById('selCut').disabled = !selRect;
  document.getElementById('selDel').disabled = !selRect;
  document.getElementById('selClear').disabled = !selRect && !pasteMode;
  const pb = document.getElementById('selPaste');
  pb.disabled = !clip; pb.classList.toggle('on', pasteMode); pb.textContent = pasteMode ? 'Placing…' : 'Paste';
}
document.getElementById('selCopy').onclick = () => copySel(false);
document.getElementById('selCut').onclick = () => copySel(true);
document.getElementById('selDel').onclick = () => askConfirm('Clear everything in the highlighted area?', deleteSel);
document.getElementById('selPaste').onclick = () => pasteMode ? stopPaste() : startPaste();
document.getElementById('selClear').onclick = () => { selRect = null; stopPaste(); };
addEventListener('paste', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
  if (text.startsWith('PTCB1.')) { e.preventDefault(); importClip(text.trim()); }
  else if (text.startsWith('PTC5')) { e.preventDefault(); askConfirm('Load the region in this save code? It replaces the current region.', () => loadSaveCode(text)); }
  else if (clip) startPaste();
});

function drawPreview(f) {
  const tool = TOOLS[curTool];
  // highlighted area: marching outline while the Select tool is active
  const outline = (x, y, w, h, col) => { f.fillStyle = col; f.fillRect(x, y, w, 1); f.fillRect(x, y + h - 1, w, 1); f.fillRect(x, y, 1, h); f.fillRect(x + w - 1, y, 1, h); };
  if (curTool === 'select' && selRect && !pasteMode) {
    const {x0, y0, x1, y1} = selRect, px = x0 * T, py = y0 * T, pw = (x1 - x0 + 1) * T, ph = (y1 - y0 + 1) * T;
    f.fillStyle = 'rgba(111,179,255,.14)'; f.fillRect(px, py, pw, ph);
    const ph2 = (performance.now() / 120 | 0) % 4;
    for (let k = 0; k < pw; k++) { f.fillStyle = (k + ph2) % 4 < 2 ? '#6fb3ff' : '#ffffff'; f.fillRect(px + k, py, 1, 1); f.fillRect(px + pw - 1 - k, py + ph - 1, 1, 1); }
    for (let k = 0; k < ph; k++) { f.fillStyle = (k + ph2) % 4 < 2 ? '#6fb3ff' : '#ffffff'; f.fillRect(px + pw - 1, py + k, 1, 1); f.fillRect(px, py + ph - 1 - k, 1, 1); }
  }
  if (!mouse.in || pan) return;
  if (curTool === 'select' && pasteMode && clip && inb(hoverT.x, hoverT.y)) {
    const o = pasteOrigin(hoverT);
    f.globalAlpha = 0.7;
    for (const [dx, dy, tt, , , , tr] of clip.tiles) {
      const x = o.x + dx, y = o.y + dy; if (!inb(x, y)) continue;
      const blocked = bldAt[y * MW + x] && tt;
      f.fillStyle = blocked ? 'rgba(255,60,60,.8)' : tt === 1 ? '#3d4049' : tt === 2 ? '#2e3038' : tt === 3 ? '#dbc99f' : tt === 4 ? '#d3c9b4' : '#2f7d34';
      if (tt) f.fillRect(x * T, y * T, T, T); else if (tr) f.fillRect(x * T + 2, y * T + 2, 5, 4);
    }
    for (const [type, dx, dy] of clip.b) {
      const x = o.x + dx, y = o.y + dy, d = BT[type];
      drawBuilding(f, type, x * T, y * T, 777, (tx, ty) => inb(x + tx, y + ty) && water[(y + ty) * MW + x + tx] === 1);
      if (!canPlace(type, x, y)) { f.fillStyle = 'rgba(255,60,60,.45)'; f.fillRect(x * T, y * T, d.w * T, d.h * T); }
    }
    f.globalAlpha = 1;
    outline(o.x * T, o.y * T, clip.w * T, clip.h * T, '#ffd75e');
    return;
  }
  if (drag && tool.kind === 'select' && !drag.paint) {
    const x0 = Math.min(drag.sx, drag.ex), y0 = Math.min(drag.sy, drag.ey), x1 = Math.max(drag.sx, drag.ex), y1 = Math.max(drag.sy, drag.ey);
    f.fillStyle = 'rgba(111,179,255,.22)'; f.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
    outline(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T, '#6fb3ff');
    return;
  }
  if (drag && tool.kind === 'line') {
    const {tiles} = lineTiles(drag.sx, drag.sy, drag.ex, drag.ey);
    const col = curTool === 'rail' ? 'rgba(69,201,141,.55)' : curTool === 'track' ? 'rgba(170,140,100,.6)'
      : curTool === 'highway' ? 'rgba(120,130,150,.6)' : curTool === 'path' ? 'rgba(230,210,160,.6)' : curTool === 'country' ? 'rgba(170,150,110,.6)' : curTool === 'sidewalk' ? 'rgba(220,225,235,.55)' : 'rgba(200,210,230,.55)';
    for (const i of tiles) { f.fillStyle = bldAt[i] ? 'rgba(255,70,70,.5)' : col; f.fillRect((i % MW) * T, (i / MW | 0) * T, T, T); }
    return;
  }
  if (drag && tool.kind === 'rect') {
    const x0 = Math.min(drag.sx, drag.ex), y0 = Math.min(drag.sy, drag.ey), x1 = Math.max(drag.sx, drag.ex), y1 = Math.max(drag.sy, drag.ey);
    const col = curTool === 'bulldoze' || curTool === 'unrail' || curTool === 'untrack' ? 'rgba(255,70,70,.35)' : curTool === 'water' ? 'rgba(60,130,220,.5)' : curTool === 'plaza' ? 'rgba(230,220,190,.55)' : 'rgba(120,200,90,.5)';
    f.fillStyle = col; f.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
    outline(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T, curTool === 'bulldoze' || curTool === 'unrail' || curTool === 'untrack' ? '#ff5050' : '#ffffff');
    return;
  }
  if (!inb(hoverT.x, hoverT.y)) return;
  if (tool.kind === 'build') {
    const type = curTool.slice(2), d = BT[type], a = anchorFor(type, hoverT);
    const ok = canPlace(type, a.x, a.y);
    f.globalAlpha = 0.75; drawBuilding(f, type, a.x * T, a.y * T, 777, (tx, ty) => inb(a.x + tx, a.y + ty) && water[(a.y + ty) * MW + a.x + tx] === 1); f.globalAlpha = 1;
    const conn = ok && (touchesStreet(type, a.x, a.y) || ((type === 'park' || type === 'metro') && perimeter(a.x, a.y, d.w, d.h).some(isWalk)));
    f.fillStyle = !ok ? 'rgba(255,60,60,.45)' : conn ? 'rgba(80,255,120,.18)' : 'rgba(255,190,60,.3)';
    f.fillRect(a.x * T, a.y * T, d.w * T, d.h * T);
    outline(a.x * T, a.y * T, d.w * T, d.h * T, !ok ? '#ff5050' : conn ? '#7dff9a' : '#ffbe3c');
    return;
  }
  const col = curTool === 'bulldoze' ? '#ff5050' : (curTool === 'light' || curTool === 'overpass') ? '#ffd23f' : '#ffffff';
  outline(hoverT.x * T, hoverT.y * T, T, T, col);
  if (selection && selection.kind !== 'bld') { const i = selection.i; outline((i % MW) * T, (i / MW | 0) * T, T, T, '#ffd75e'); }
}

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  if (regionView) { if (e.button === 0) { const m = regionHit(e.clientX, e.clientY); if (m >= 0) { closeRegion(); fitDistrict(m); } } return; }
  if (e.button === 2 && drag) { drag = null; return; }
  if (e.button === 2 && pasteMode) { stopPaste(); return; }
  if (e.button === 1 || e.button === 2 || spaceDown || e.shiftKey) { pan = {x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y}; cv.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  const t = screenToTile(e.clientX, e.clientY);
  const tool = TOOLS[curTool];
  if (tool.kind === 'select') { if (pasteMode) pasteAt(t); else if (inb(t.x, t.y)) drag = {sx: t.x, sy: t.y, ex: t.x, ey: t.y}; }
  else if (tool.kind === 'line' || tool.kind === 'rect') { if (inb(t.x, t.y)) drag = {sx: t.x, sy: t.y, ex: t.x, ey: t.y}; }
  else if (tool.kind === 'build') { drag = null; tryBuild(t); drag = {paint: true}; }
  else if (tool.kind === 'brush') { brushTree(t); drag = {paint: true}; }
  else if (tool.kind === 'click') { if (curTool === 'overpass') clickOverpass(t); else clickLight(t); }
  else if (tool.kind === 'inspect') inspectAt(t);
});
cv.addEventListener('pointermove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  if (regionView) { regionHover = regionHit(e.clientX, e.clientY); cv.style.cursor = regionHover >= 0 ? 'pointer' : 'default'; return; }
  if (pan) { cam.x = pan.cx - (e.clientX - pan.x) / cam.z; cam.y = pan.cy - (e.clientY - pan.y) / cam.z; clampCam(); return; }
  const t = screenToTile(e.clientX, e.clientY);
  const moved = t.x !== hoverT.x || t.y !== hoverT.y;
  hoverT = t;
  if (drag) {
    if (drag.paint && moved) { if (TOOLS[curTool].kind === 'build') tryBuild(t); else brushTree(t); }
    else if (!drag.paint) { drag.ex = t.x; drag.ey = t.y; }
  }
});
cv.addEventListener('pointerup', () => {
  if (pan) { pan = null; cv.style.cursor = curTool === 'inspect' ? 'pointer' : 'crosshair'; return; }
  if (drag && !drag.paint) {
    const tool = TOOLS[curTool];
    if (tool.kind === 'line') commitLine(curTool, drag.sx, drag.sy, drag.ex, drag.ey);
    else if (tool.kind === 'rect') commitRect(curTool, drag.sx, drag.sy, drag.ex, drag.ey);
    else if (tool.kind === 'select') {
      const c = v => clamp(v, 0, MW - 1), r = v => clamp(v, 0, MH - 1);
      selRect = {x0: c(Math.min(drag.sx, drag.ex)), y0: r(Math.min(drag.sy, drag.ey)), x1: c(Math.max(drag.sx, drag.ex)), y1: r(Math.max(drag.sy, drag.ey))};
      updateSelBar();
    }
  }
  drag = null;
});
cv.addEventListener('pointerleave', () => { mouse.in = false; hoverEl.classList.add('hidden'); });
function zoomStep(dir, sx = innerWidth / 2, sy = innerHeight / 2) {
  if (regionView) { if (dir > 0) closeRegion(); return; }
  let k = ZOOMS.indexOf(cam.z); if (k < 0) k = ZOOMS.indexOf(3);
  if (k === 0 && dir < 0) { openRegion(); return; } // zooming out past a whole district shows the region
  const nk = Math.max(0, Math.min(ZOOMS.length - 1, k + dir));
  if (nk !== k) zoomTo(ZOOMS[nk], sx, sy);
}
function zoomTo(z, sx = innerWidth / 2, sy = innerHeight / 2) {
  const ax = sx / cam.z + cam.x, ay = sy / cam.z + cam.y;
  cam.z = z; cam.x = ax - sx / cam.z; cam.y = ay - sy / cam.z; clampCam();
  setT('zoomLbl', Math.round(z * 100) + '%');
}
function centerOn(i, z) {
  if (z) cam.z = z;
  cam.x = (i % MW) * T + 4 - innerWidth / 2 / cam.z; cam.y = (i / MW | 0) * T + 4 - innerHeight / 2 / cam.z; zoomTo(cam.z);
}
function fitRegion() {
  let z = ZOOMS[0];
  for (const zz of ZOOMS) if (MW * T * zz <= innerWidth - 20 && MH * T * zz <= innerHeight - 120) z = zz;
  centerOn(Math.floor(MH / 2) * MW + Math.floor(MW / 2), z);
}
function fitDistrict(m) {
  let z = ZOOMS[0];
  for (const zz of ZOOMS) if (DW * T * zz <= innerWidth - 20 && DH * T * zz <= innerHeight - 120) z = zz;
  const cx = (m % RW) * DW + DW / 2, cy = (m / RW | 0) * DH + DH / 2;
  centerOn(Math.floor(cy) * MW + Math.floor(cx), z);
}
const camDistrict = () => districtOf((cam.x + innerWidth / 2 / cam.z) / T, (cam.y + innerHeight / 2 / cam.z) / T);
cv.addEventListener('wheel', e => { e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); }, {passive: false});

const keys = new Set();
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (document.body.classList.contains('menu-screen')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+V is handled by the paste event, so text copied from another game can come in too
    if (k === 'c' || k === 'x') { e.preventDefault(); if (curTool !== 'select' || !selRect) toast('Highlight an area with the Select tool (X) first.'); else copySel(k === 'x'); }
    else if (k === 's') { e.preventDefault(); saveLocal(false); }
    return;
  }
  keys.add(k);
  if ((k === 'delete' || k === 'backspace') && curTool === 'select' && selRect) { askConfirm('Clear everything in the highlighted area?', deleteSel); return; }
  if (k === 'escape') {
    if (!confirmEl.classList.contains('hidden')) confirmEl.classList.add('hidden');
    else if (!saveEl.classList.contains('hidden')) saveEl.classList.add('hidden');
    else if (pasteMode) stopPaste();
    else if (curTool === 'select' && selRect) { selRect = null; updateSelBar(); }
    else if (regionView) closeRegion(); else if (drag) drag = null;
    else if (!helpEl.classList.contains('hidden')) helpEl.classList.add('hidden'); else { setTool('inspect'); select(null); }
  }
  else if (k === 'p') setSpeed(speed ? 0 : 1);
  else if (k === '1') setSpeed(1); else if (k === '2') setSpeed(3); else if (k === '3') setSpeed(8);
  else if (k === 'v') toggleOverlay('heat'); else if (k === 'c') toggleOverlay('occ'); else if (k === 'g') toggleOverlay('grid'); else if (k === 'm') toggleOverlay('mood');
  else if (k === 'n') toggleOverlay('underground'); else if (k === 'y') toggleOverlay('sky');
  else if (k === '=' || k === '+') zoomStep(1); else if (k === '-' || k === '_') zoomStep(-1); else if (k === 'z') { if (regionView) closeRegion(); fitDistrict(camDistrict()); }
  else for (const id in TOOLS) if (TOOLS[id].key && TOOLS[id].key.toLowerCase() === k) { setTool(id); break; }
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === ' ') spaceDown = false; keys.delete(k); });
addEventListener('blur', () => keys.clear());
// Push-scrolling: with the pointer in the last pixel at the edge of the window,
// the map slides that way. The speed is in screen pixels per second, so the
// ground moves at the same rate on screen whatever the zoom; in world units
// that means dividing by the zoom. It also keeps working while you drag out a
// road or a box, because the drag endpoint follows the cursor every frame.
function panEdge(dt) {
  if (regionView || !mouse.in || pan) return;
  let dx = 0, dy = 0;
  if (mouse.x <= 0) dx = -1; else if (mouse.x >= innerWidth - 1) dx = 1;
  if (mouse.y <= 0) dy = -1; else if (mouse.y >= innerHeight - 1) dy = 1;
  if (!dx && !dy) return;
  const move = 520 * dt / cam.z;
  cam.x += dx * move; cam.y += dy * move;
  clampCam();
  const t = screenToTile(mouse.x, mouse.y);
  const moved = t.x !== hoverT.x || t.y !== hoverT.y;
  hoverT = t;
  if (drag) {
    if (drag.paint && moved) {
      if (TOOLS[curTool].kind === 'build') tryBuild(t); else brushTree(t);
    } else if (!drag.paint) { drag.ex = t.x; drag.ey = t.y; }
  }
}
function panKeys(dt) {
  if (regionView) return;
  const s = 420 * dt / cam.z;
  if (keys.has('w') || keys.has('arrowup')) cam.y -= s;
  if (keys.has('s') || keys.has('arrowdown')) cam.y += s;
  if (keys.has('a') || keys.has('arrowleft')) cam.x -= s;
  if (keys.has('d') || keys.has('arrowright')) cam.x += s;
  if (keys.size) clampCam();
}
