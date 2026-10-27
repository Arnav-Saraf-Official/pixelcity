// =====================================================================
// Tools & input
// =====================================================================
const TOOLS = {
  inspect:   {name: 'Inspect', kind: 'inspect', key: 'Q', desc: 'Click buildings, roads and traffic lights to see details and tune them.'},
  select:    {name: 'Select', kind: 'select', key: 'X', desc: 'Drag a box to highlight an area. Copy (Ctrl+C), cut (Ctrl+X) or delete (Del) it, then paste (Ctrl+V) and click to place copies.'},
  bulldoze:  {name: 'Bulldoze', kind: 'rect', key: 'B', desc: 'Drag a box to clear roads, buildings and trees.'},
  road:      {cat: 'roads', group: 'Streets', name: 'Street', kind: 'line', key: 'R', desc: 'Two-way street with sidewalks on both sides. Drag to draw.'},
  country:   {cat: 'roads', group: 'Streets', name: 'Country Road', kind: 'line', key: 'K', desc: 'A street with gravel shoulders and no sidewalks. Nobody walks along it.'},
  sidewalk:  {cat: 'roads', group: 'Streets', name: 'Sidewalks', kind: 'line', key: 'J', desc: 'Drag along streets to add or remove sidewalks.'},
  oneway:    {cat: 'roads', group: 'Streets', name: 'One-Way', kind: 'line', key: 'O', desc: 'Drag in the direction traffic should flow.'},
  highway:   {cat: 'roads', group: 'Streets', name: 'Highway', kind: 'line', key: 'H', desc: 'Fast road. Draw two side by side for two lanes each way.'},
  light:     {cat: 'roads', group: 'Junctions', name: 'Traffic Light', kind: 'click', key: 'L', desc: 'Click a 3- or 4-way intersection to add or remove a signal.'},
  overpass:  {cat: 'roads', group: 'Junctions', name: 'Overpass', kind: 'click', key: 'U', desc: 'Click a 4-way crossing to bridge one road over another.'},
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
  'b:fireStation': {cat: 'civic'}, 'b:policeStation': {cat: 'civic'}, 'b:researchLab': {cat: 'civic'}, 'b:billboard': {cat: 'civic', group: 'Policies'},
  'b:metro': {cat: 'transit', group: 'Metro'},
  rail:      {cat: 'transit', group: 'Metro', name: 'Metro Rails', kind: 'line', key: 'T', desc: 'Drag to extend subway track. Bulldoze in Underground view to remove it.'},
  'b:busstop': {cat: 'transit', group: 'Walking & parking'},
  path:      {cat: 'transit', group: 'Walking & parking', name: 'Footpath', kind: 'line', key: 'F', desc: 'Pedestrian path. Makes nearby buildings walkable.'},
  plaza:     {cat: 'transit', group: 'Walking & parking', name: 'Plaza', kind: 'rect', desc: 'Paved pedestrian square.'},
  'b:park': {cat: 'transit', group: 'Walking & parking'},
  'b:parking': {cat: 'transit', group: 'Walking & parking'}, 'b:garage': {cat: 'transit', group: 'Walking & parking'},
  track:     {cat: 'transit', group: 'Freight', name: 'Freight Track', kind: 'line', key: 'I', desc: 'Drag to extend single freight track. Bulldoze it to remove.'},
  track2:    {cat: 'transit', group: 'Freight', name: 'Two-Way Track', kind: 'line', desc: 'Drag to lay a wide two-track line. The two lanes stay separate, so trains pass each other instead of fusing into loops. Needs twice the clearance of single track.'},
  signal:    {cat: 'transit', group: 'Freight', name: 'Rail Signal', kind: 'click', key: 'E', desc: 'Click a piece of freight track to split it into signal blocks. Blocks turn red while a train has the leg.'},
  gate:      {cat: 'transit', group: 'Freight', name: 'Crossing Gate', kind: 'click', desc: 'Click a street where track crosses it to add or remove a barrier. The arm lowers over the road while a train is coming and cars wait behind it.'},
  freightline:{cat: 'transit', group: 'Freight', name: 'Freight Line', kind: 'click', desc: 'Click two to four train yards to give them a dedicated train loop. Click the first yard again to finish.'},
  'b:railyard': {cat: 'transit', group: 'Freight'},
  'b:port': {cat: 'transit', group: 'Freight'}, 'b:distribution': {cat: 'transit', group: 'Freight'},
  'b:riverWharf': {cat: 'transit', group: 'Freight'},
  'b:boardwalk': {cat: 'transit', group: 'Waterfront'}, 'b:aquarium': {cat: 'transit', group: 'Waterfront'}, 'b:ferrisWheel': {cat: 'transit', group: 'Waterfront'},
  tree:      {cat: 'nature', name: 'Trees', kind: 'brush', desc: 'Paint varied tree canopies on empty land.'},
  water:     {cat: 'nature', name: 'Water', kind: 'rect', desc: 'Drag a box to flood land. Roads over water become bridges.'},
  land:      {cat: 'nature', name: 'Land', kind: 'rect', desc: 'Drag a box to fill water.'},
  'b:platformConcrete': {cat: 'nature', group: 'Platforms'},
  'b:platformSteel': {cat: 'nature', group: 'Platforms'},
  'b:platformDirt': {cat: 'nature', group: 'Platforms'},
  'b:platformConcrete2': {cat: 'nature', group: 'Platforms'},
  'b:platformSteel2': {cat: 'nature', group: 'Platforms'},
  'b:platformDirt2': {cat: 'nature', group: 'Platforms'},
  district:  {cat: 'districts', name: 'District', kind: 'rect', key: 'D', desc: 'Drag a box to paint a district.'},
  undistrict:{cat: 'districts', name: 'Erase District', kind: 'rect', desc: 'Drag a box to remove district paint.'},
};
for (const id in TOOLS) if (id.startsWith('b:')) {
  const d = BT[id.slice(2)], parts = [];
  if (d.homes) parts.push(`Homes ${d.homes}`);
  if (d.jobs) parts.push(`Jobs ${d.jobs}`);
  if (d.cap) parts.push(`Parking ${d.cap}`);
  parts.push(`${d.w}×${d.h}`);
  Object.assign(TOOLS[id], {name: d.name, kind: 'build', desc: d.desc, stats: parts.join(' · ')});
}
const CATS = [
  {id: 'roads', name: 'Roads'}, {id: 'res', name: 'Housing'}, {id: 'work', name: 'Work'}, {id: 'com', name: 'Shops'},
  {id: 'power', name: 'Power'}, {id: 'rural', name: 'Agriculture'}, {id: 'civic', name: 'Civic'},
  {id: 'transit', name: 'Transit'}, {id: 'districts', name: 'Districts'}, {id: 'nature', name: 'World'},
];
let curTool = 'inspect', curCat = null;
let hoverT = {x: -1, y: -1}, drag = null, pan = null, spaceDown = false;
let mouse = {x: 0, y: 0, in: false};

function screenToTile(sx, sy) { const ax = sx / cam.z + cam.x, ay = sy / cam.z + cam.y; return {x: Math.floor(ax / T), y: Math.floor(ay / T)}; }
function anchorFor(type, t) { const d = BT[type]; return {x: t.x - ((d.w - 1) >> 1), y: t.y - ((d.h - 1) >> 1)}; }
function lineTiles(sx, sy, ex, ey) {
  sx = clamp(sx, 0, MW - 1); sy = clamp(sy, 0, MH - 1); ex = clamp(ex, 0, MW - 1); ey = clamp(ey, 0, MH - 1);
  const pts = [[sx, sy]]; let x = sx, y = sy, dx = Math.sign(ex - sx), dy = Math.sign(ey - sy);
  if (Math.abs(ex - sx) >= Math.abs(ey - sy)) { while (x !== ex) { x += dx; pts.push([x, y]); } while (y !== ey) { y += dy; pts.push([x, y]); } }
  else { while (y !== ey) { y += dy; pts.push([x, y]); } while (x !== ex) { x += dx; pts.push([x, y]); } }
  const tiles = pts.map(([a, b]) => b * MW + a), dirs = tiles.map((t, k) => k < tiles.length - 1 ? dirOf(t, tiles[k + 1]) : (k > 0 ? dirOf(tiles[k - 1], t) : 0));
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
    const add = !(tile[tiles[0]] === 1 && walkway[tiles[0]]); let n = 0;
    for (const i of tiles) if (tile[i] === 1) { walkway[i] = add ? 1 : 0; n++; }
    if (!n) { toast('Sidewalks go along streets. Drag over a street.'); return; }
    markTiles(tiles); mapChanged(); return;
  }
  if (tool === 'rail') {
    let n = 0;
    for (const i of tiles) if (!railOn[i]) { railOn[i] = 1; n++; }
    if (!n) { toast('There is already metro rail along that line.'); return; }
    mapChanged(); return;
  }
  if (tool === 'track' || tool === 'track2') {
    let n = 0, blocked = 0;
    // A two-way line is two tiles wide. The pair is laid on the side the drag
    // leans toward, and every tile remembers its lane axis so the linker keeps
    // the lanes apart.
    const wide = tool === 'track2';
    const axis = Math.abs(ex - sx) >= Math.abs(ey - sy) ? 1 : 2;   // 1 E-W, 2 N-S
    const laid = [];
    for (const i of tiles) {
      if (bldAt[i]) { blocked++; continue; }
      if (wide) {
        if (!trackOn[i]) { trackOn[i] = 1; tree[i] = 0; n++; }
        trackWide[i] = axis;
        laid.push(i);
        const x = i % MW, y = (i / MW) | 0;
        const px = axis === 1 ? x : x + 1, py = axis === 1 ? y + 1 : y;
        if (px < MW && py < MH) {
          const j = py * MW + px;
          if (!bldAt[j]) { if (!trackOn[j]) { trackOn[j] = 1; tree[j] = 0; n++; } trackWide[j] = axis; laid.push(j); }
          else blocked++;
        } else blocked++;
      } else {
        if (!trackOn[i]) { trackOn[i] = 1; tree[i] = 0; n++; }
        if (trackWide[i]) trackWide[i] = 0;
        laid.push(i);
      }
    }
    if (!n) { toast(blocked ? 'Buildings are in the way of that line.' : 'There is already freight track along that line.'); return; }
    if (blocked) toast(`Laid the line, but ${blocked} tile${blocked === 1 ? '' : 's'} were blocked.`);
    markTiles(laid); mapChanged(); return;
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
    const underground = overlays.underground, kill = new Set();
    for (const i of tiles) {
      if (underground) { railOn[i] = 0; trackOn[i] = 0; trackWide[i] = 0; continue; }
      if (bldAt[i]) kill.add(bldAt[i]);
      tile[i] = 0; oneway[i] = 0; walkway[i] = 0; tree[i] = 0;
      trackOn[i] = 0; trackWide[i] = 0; gateOff[i] = 0; overpass[i] = 0; lights.delete(i); gates.delete(i);
      if (platform[i]) { platform[i] = 0; water[i] = 1; }
    }
    for (const id of kill) { const b = B(id); if (b) removeBuilding(b); }
    if (typeof clearRuinsRect === 'function') clearRuinsRect(Math.min(sx, ex), Math.min(sy, ey), Math.max(sx, ex), Math.max(sy, ey));
  } else if (tool === 'plaza') {
    for (const i of tiles) if (!bldAt[i] && !isRoad(i) && !water[i]) { tile[i] = 4; tree[i] = 0; }
  } else if (tool === 'water') {
    for (const i of tiles) if (!bldAt[i] && tile[i] !== 4) { water[i] = 1; tree[i] = 0; platform[i] = 0; }
  }  else if (tool === 'land') {
    for (const i of tiles) if ((!bldAt[i] || !BT[B(bldAt[i]).type].water) && !platform[i]) water[i] = 0;
  } else if (tool === 'district') {
    let d = districts.get(activeDistrict);
    if (!d) { const name = (typeof prompt === 'function' ? prompt('District name:', 'District ' + (districts.size + 1)) : '') || ''; d = newDistrict(name.trim().slice(0, 24)); activeDistrict = d.id; }
    for (const i of tiles) districtLayer[i] = d.id;
    updateDistrictUI();
  } else if (tool === 'undistrict') {
    for (const i of tiles) districtLayer[i] = 0;
    updateDistrictUI();
  }
  markTiles(tiles); mapChanged();
}
let activeDistrict = 0;
function updateDistrictUI() {
  markDistrictsDirty();
  const box = document.getElementById('districtList'); if (!box) return;
  box.replaceChildren();
  for (const d of districts.values()) {
    let n = 0; for (let i = 0; i < N; i++) if (districtLayer[i] === d.id) n++;
    const b = document.createElement('button'); b.className = 'card' + (d.id === activeDistrict ? ' on' : '');
    b.style.borderColor = d.color; b.textContent = d.name + '  (' + n + ' tiles)';
    b.onclick = () => { activeDistrict = d.id; updateDistrictUI(); }; box.append(b);
  }
  if (!districts.size) { const p = document.createElement('small'); p.textContent = 'No districts yet. Use District and drag a box to draw one.'; box.append(p); }
}
function tryBuild(t) {
  const type = curTool.slice(2), a = anchorFor(type, t), d = BT[type];
  if (d.platform) {
    const tiles = [];
    for (let y = a.y; y < a.y + d.h; y++) for (let x = a.x; x < a.x + d.w; x++) {
      if (!inb(x, y) || !water[y * MW + x] || tile[y * MW + x] || bldAt[y * MW + x] || platform[y * MW + x]) {
        if (!drag) toast('World platforms need a clear water footprint.');
        return false;
      }
      tiles.push(y * MW + x);
    }
    const cost = platformCost(type);
    if (!spendMaterials(cost)) { if (!drag) toast(`Needs ${materialNeed(cost)} in the city material pool.`); return false; }
    for (const i of tiles) { platform[i] = d.platform; water[i] = 0; tree[i] = 0; }

    markTiles(tiles); mapChanged(); return true;
  }
  const why = whyNot(type, a.x, a.y);
  if (why) { if (!drag) toast((d.cat === 'com' || d.efficiencyBase || type === 'oilRig' || type === 'gasWell' || type === 'quarry' || type === 'mine' ? '⚠️ ' : '') + why); return false; }
  const b = placeBuilding(type, a.x, a.y);
  markDirty(a.x, a.y, a.x + d.w - 1, a.y + d.h - 1);
  if (type === 'metro' && typeof connectMetroStation === 'function') connectMetroStation(b);
  mapChanged();
  if (needsRoad(type) && b.road < 0) toast(`❗ ${BT[type].name} placed without road access. Add a street beside it.`);
  if (BT[type].cat === 'com' && !hasAccessibleSupply(b)) toast(`⚠️ ${BT[type].name} has no connected goods supply. Connect it to a producer or stocked warehouse.`);
  if ((type === 'fishery' || type === 'seafoodPlant') && !findCustomer(b, 'fish')) toast('⚠️ Fish products cannot be transported or accessed yet. Connect this site to a seafood market, shop, or warehouse by road.');
  return true;
}
function brushTree(t) {
  for (let k = 0; k < 3; k++) {
    const x = t.x + Math.round((Math.random() - 0.5) * 2), y = t.y + Math.round((Math.random() - 0.5) * 2);
    if (!inb(x, y)) continue; const i = y * MW + x;
    if (!tile[i] && !water[i] && !bldAt[i]) { tree[i] = 1 + Math.floor(Math.random() * 8); markDirty(x, y, x, y); }
  }
}
function clickOverpass(t) {
  if (!inb(t.x, t.y)) return;
  const i = t.y * MW + t.x;
  if (!isRoad(i) || deg[i] !== 4) { toast('Overpasses go on 4-way crossings. Draw one road across another first.'); return; }
  overpass[i] = overpass[i] ? 0 : 1; lights.delete(i); markTiles([i]); mapChanged();
}
function clickLight(t) {
  if (!inb(t.x, t.y)) return;
  const i = t.y * MW + t.x;
  if (overpass[i]) { toast('Overpasses don\'t need lights. Traffic never crosses there.'); return; }
  if (!isRoad(i) || deg[i] < 3) { toast('Traffic lights go on 3- or 4-way intersections.'); return; }
  if (lights.has(i)) lights.delete(i); else lights.set(i, {ns: 8, ew: 8, off: Math.random() * 10});
  mapChanged();
}
function clickSignal(t) {
  if (!inb(t.x, t.y)) return;
  const i = t.y * MW + t.x;
  if (!trackOn[i]) { toast('Signals sit on freight track. Draw track first.'); return; }
  sigNode[i] = sigNode[i] ? 0 : 1;
  markTiles([i]); mapChanged();
}
function clickGate(t) {
  if (!inb(t.x, t.y)) return;
  const i = t.y * MW + t.x;
  if (!crossingTile(i)) { toast('Crossing gates go where a straight run of track crosses a street.'); return; }
  if (gates.has(i)) { gates.delete(i); gateOff[i] = 1; mapChanged(); return; }
  gateOff[i] = 0; gates.add(i); mapChanged();
}
// Shift-click inspects a tile by cycling it through the states it can take:
// track first (single, two-way east-west, two-way north-south), then roads
// (street, country road, highway, the four one-way directions).
function cycleTile(t) {
  if (!inb(t.x, t.y)) return;
  const i = t.y * MW + t.x;
  if (bldAt[i]) { toast('That tile is occupied by a building.'); return; }
  if (trackOn[i]) {
    trackWide[i] = (trackWide[i] + 1) % 3;
    const label = trackWide[i] === 1 ? 'two-way (east-west)' : trackWide[i] === 2 ? 'two-way (north-south)' : 'single';
    markTiles([i]); mapChanged(); toast(`Track: ${label}.`); return;
  }
  if (tile[i] === 1 && oneway[i] === 0 && walkway[i]) {
    walkway[i] = 0; markTiles([i]); mapChanged(); toast('Road: country road.'); return;
  }
  if (tile[i] === 1 && oneway[i] === 0) {
    tile[i] = 2; markTiles([i]); mapChanged(); toast('Road: highway.'); return;
  }
  if (tile[i] === 2) {
    tile[i] = 1; walkway[i] = 1; oneway[i] = 2; markTiles([i]); mapChanged(); toast('Road: one-way east.'); return;
  }
  if (tile[i] === 1 && oneway[i]) {
    if (oneway[i] === 1) { oneway[i] = 0; walkway[i] = 1; toast('Road: two-way street.'); }
    else { oneway[i] = oneway[i] % 4 + 1; toast(`Road: one-way ${DIRNAME[oneway[i]].toLowerCase()}.`); }
    markTiles([i]); mapChanged(); return;
  }
  toast('Nothing to cycle on that tile.');
}
const LINE_COLORS = ['#f2c14e', '#4d96ff', '#6bcb77', '#ff7eb6', '#c77dff'];
let lineDraft = [];
function clickFreightLine(t, e) {
  if (!inb(t.x, t.y)) return;
  const id = bldAt[t.y * MW + t.x], yard = id ? B(id) : null;
  if (!yard || yard.type !== 'railyard') { toast('Freight lines start and stop at train yards.'); return; }
  if (e && e.shiftKey) {
    const before = freightLines.length;
    freightLines = freightLines.filter(l => !l.stops.includes(yard.id));
    if (freightLines.length === before) { toast('That yard is not on a freight line.'); return; }
    mapChanged();
    toast(`Removed ${before - freightLines.length} freight line${before - freightLines.length === 1 ? '' : 's'}.`);
    return;
  }
  if (!lineDraft.length) {
    lineDraft = [yard.id];
    toast('Line started. Click another yard, then click the first yard again to finish.');
    return;
  }
  if (yard.id === lineDraft[0]) {
    if (lineDraft.length < 2) { toast('A line needs at least two train yards.'); lineDraft = []; return; }
    const lid = nextLineId++;
    const line = {id: lid, stops: lineDraft.slice(), color: LINE_COLORS[(lid - 1) % LINE_COLORS.length]};
    freightLines.push(line);
    lineDraft = [];
    mapChanged();
    toast(`Freight line created with ${line.stops.length} stops.`);
    return;
  }
  if (lineDraft.includes(yard.id)) { toast('That yard is already on this line.'); return; }
  if (lineDraft.length >= 4) { toast('A line can visit up to four yards.'); return; }
  lineDraft.push(yard.id);
  toast(`${lineDraft.length} stops. Click the first yard again to finish.`);
}
function clickTool(tool, t, e) {
  if (tool === 'overpass') return clickOverpass(t);
  if (tool === 'signal') return clickSignal(t);
  if (tool === 'gate') return clickGate(t);
  if (tool === 'freightline') return clickFreightLine(t, e);
  return clickLight(t);
}

// ---- Select, copy, cut, paste ---------------------------------------------------
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
  const gts = [];
  for (const i of gates) { const x = i % MW, y = i / MW | 0; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) gts.push([x - x0, y - y0]); }
  clip = {v: 1, w, h, tiles, b: blds, l: lts, g: gts};
  try { navigator.clipboard.writeText('PTCB1.' + b64(new TextEncoder().encode(JSON.stringify(clip)))).catch(() => {}); } catch (e) {}
  if (cut) { commitRect('bulldoze', x0, y0, x1, y1); toast(`Cut a ${w}×${h} area. Paste it with Ctrl+V.`); }
  else toast(`Copied a ${w}×${h} area with ${blds.length} buildings. Paste it with Ctrl+V.`);
  updateSelBar();
}
function deleteSel() { if (!selRect) return; const {x0, y0, x1, y1} = selRect; commitRect('bulldoze', x0, y0, x1, y1); toast('Cleared the highlighted area.'); }
function startPaste() { if (!clip) { toast('Copy an area first: highlight it with Select, then Ctrl+C.'); return; } if (curTool !== 'select') setTool('select'); pasteMode = true; selRect = null; updateSelBar(); }
function stopPaste() { pasteMode = false; updateSelBar(); }
const pasteOrigin = t => ({x: t.x - (clip.w >> 1), y: t.y - (clip.h >> 1)});
function pasteAt(t) {
  const o = pasteOrigin(t); let skipped = 0;
  for (const [dx, dy, tt, ow, sw, ov, tr] of clip.tiles) {
    const x = o.x + dx, y = o.y + dy; if (!inb(x, y)) continue; const i = y * MW + x;
    if (bldAt[i]) { if (tt) skipped++; continue; }
    if (tt) { if (tt === 4 && water[i]) { skipped++; continue; } tile[i] = tt; oneway[i] = ow; walkway[i] = sw; overpass[i] = ov; tree[i] = 0; }
    else if (tr && !tile[i] && !water[i]) tree[i] = tr;
  }
  for (const [dx, dy, ns, ew, off] of clip.l) { const x = o.x + dx, y = o.y + dy; if (inb(x, y)) lights.set(y * MW + x, {ns, ew, off}); }
  for (const [dx, dy] of clip.g || []) { const x = o.x + dx, y = o.y + dy; if (inb(x, y)) gates.add(y * MW + x); }
  for (const [type, dx, dy] of clip.b) { if (canPlace(type, o.x + dx, o.y + dy)) placeBuilding(type, o.x + dx, o.y + dy); else skipped++; }
  markDirty(o.x, o.y, o.x + clip.w - 1, o.y + clip.h - 1); mapChanged();
  if (skipped) toast(`Pasted. ${skipped} piece${skipped > 1 ? 's' : ''} didn't fit where something was already built.`);
}
function importClip(text) {
  try {
    const c = JSON.parse(new TextDecoder().decode(unb64(text.slice(6))));
    if (!c || c.v !== 1 || !isInt(c.w, 1, MW) || !isInt(c.h, 1, MH) || !Array.isArray(c.tiles) || !Array.isArray(c.b) || !Array.isArray(c.l) || c.tiles.length > c.w * c.h || c.b.length > 5000 || c.l.length > 5000) throw 0;
    const inBox = (dx, dy) => isInt(dx, 0, c.w - 1) && isInt(dy, 0, c.h - 1);
    for (const e of c.tiles) if (!Array.isArray(e) || !inBox(e[0], e[1]) || !isInt(e[2], 0, 4) || !isInt(e[3], 0, 4) || !isInt(e[4], 0, 1) || !isInt(e[5], 0, 1) || !isInt(e[6], 0, 8)) throw 0;
    for (const e of c.b) if (!Array.isArray(e) || !hasType(e[0]) || !inBox(e[1], e[2])) throw 0;
    for (const e of c.l) if (!Array.isArray(e) || !inBox(e[0], e[1]) || !isInt(e[2], 3, 25) || !isInt(e[3], 3, 25) || !isInt(e[4], 0, 60)) throw 0;
    if (c.g !== undefined) { if (!Array.isArray(c.g) || c.g.length > c.w * c.h) throw 0; for (const e of c.g) if (!Array.isArray(e) || !inBox(e[0], e[1])) throw 0; }
    clip = c; startPaste(); toast(`Pasted area ready: ${c.w}×${c.h}. Click to place it.`);
  } catch (e) { toast('That copied area is damaged, so it was not pasted.'); }
}
function updateSelBar() {
  const bar = document.getElementById('selBar'); bar.classList.toggle('hidden', curTool !== 'select');
  const [w, h] = selSize(); setT('selInfo', pasteMode ? `Click to place the ${clip.w}×${clip.h} copy · Esc to stop` : selRect ? `${w}×${h} highlighted` : 'Drag a box to highlight an area');
  document.getElementById('selCopy').disabled = !selRect; document.getElementById('selCut').disabled = !selRect; document.getElementById('selDel').disabled = !selRect; document.getElementById('selClear').disabled = !selRect && !pasteMode;
  const pb = document.getElementById('selPaste'); pb.disabled = !clip; pb.classList.toggle('on', pasteMode); pb.textContent = pasteMode ? 'Placing…' : 'Paste';
}
document.getElementById('selCopy').onclick = () => copySel(false);
document.getElementById('selCut').onclick = () => copySel(true);
document.getElementById('selDel').onclick = () => askConfirm('Clear everything in the highlighted area?', deleteSel);
document.getElementById('selPaste').onclick = () => pasteMode ? stopPaste() : startPaste();
document.getElementById('selClear').onclick = () => { selRect = null; stopPaste(); };
addEventListener('paste', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; const text = (e.clipboardData && e.clipboardData.getData('text')) || ''; if (text.startsWith('PTCB1.')) { e.preventDefault(); importClip(text.trim()); } else if (text.startsWith('PTC5')) { e.preventDefault(); askConfirm('Load the region in this save code? It replaces the current region.', () => loadSaveCode(text)); } else if (clip) startPaste(); });

function drawPreview(f) {
  const tool = TOOLS[curTool];
  const outline = (x, y, w, h, col) => { f.fillStyle = col; f.fillRect(x, y, w, 1); f.fillRect(x, y + h - 1, w, 1); f.fillRect(x, y, 1, h); f.fillRect(x + w - 1, y, 1, h); };
  if (curTool === 'select' && selRect && !pasteMode) {
    const {x0, y0, x1, y1} = selRect, px = x0 * T, py = y0 * T, pw = (x1 - x0 + 1) * T, ph = (y1 - y0 + 1) * T;
    f.fillStyle = 'rgba(111,179,255,.14)'; f.fillRect(px, py, pw, ph); const ph2 = (performance.now() / 120 | 0) % 4;
    for (let k = 0; k < pw; k++) { f.fillStyle = (k + ph2) % 4 < 2 ? '#6fb3ff' : '#ffffff'; f.fillRect(px + k, py, 1, 1); f.fillRect(px + pw - 1 - k, py + ph - 1, 1, 1); }
    for (let k = 0; k < ph; k++) { f.fillStyle = (k + ph2) % 4 < 2 ? '#6fb3ff' : '#ffffff'; f.fillRect(px + pw - 1, py + k, 1, 1); f.fillRect(px, py + ph - 1 - k, 1, 1); }
  }
  if (!mouse.in || pan) return;
  if (curTool === 'select' && pasteMode && clip && inb(hoverT.x, hoverT.y)) {
    const o = pasteOrigin(hoverT); f.globalAlpha = 0.7;
    for (const [dx, dy, tt, , , , tr] of clip.tiles) { const x = o.x + dx, y = o.y + dy; if (!inb(x, y)) continue; const blocked = bldAt[y * MW + x] && tt; f.fillStyle = blocked ? 'rgba(255,60,60,.8)' : tt === 1 ? '#3d4049' : tt === 2 ? '#2e3038' : tt === 3 ? '#dbc99f' : tt === 4 ? '#d3c9b4' : '#2f7d34'; if (tt) f.fillRect(x * T, y * T, T, T); else if (tr) f.fillRect(x * T + 2, y * T + 2, 5, 4); }
    for (const [type, dx, dy] of clip.b) { const x = o.x + dx, y = o.y + dy, d = BT[type]; drawBuilding(f, type, x * T, y * T, 777, (tx, ty) => inb(x + tx, y + ty) && water[(y + ty) * MW + x + tx] === 1); if (!canPlace(type, x, y)) { f.fillStyle = 'rgba(255,60,60,.45)'; f.fillRect(x * T, y * T, d.w * T, d.h * T); } }
    f.globalAlpha = 1; outline(o.x * T, o.y * T, clip.w * T, clip.h * T, '#ffd75e'); return;
  }
  if (drag && tool.kind === 'select' && !drag.paint) { const x0 = Math.min(drag.sx, drag.ex), y0 = Math.min(drag.sy, drag.ey), x1 = Math.max(drag.sx, drag.ex), y1 = Math.max(drag.sy, drag.ey); f.fillStyle = 'rgba(111,179,255,.22)'; f.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T); outline(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T, '#6fb3ff'); return; }
  if (drag && tool.kind === 'line') {
    const {tiles} = lineTiles(drag.sx, drag.sy, drag.ex, drag.ey), col = curTool === 'rail' ? 'rgba(69,201,141,.55)' : curTool === 'track' ? 'rgba(170,140,100,.6)' : curTool === 'track2' ? 'rgba(170,140,100,.6)' : curTool === 'highway' ? 'rgba(120,130,150,.6)' : curTool === 'path' ? 'rgba(230,210,160,.6)' : curTool === 'country' ? 'rgba(170,150,110,.6)' : curTool === 'sidewalk' ? 'rgba(220,225,235,.55)' : 'rgba(200,210,230,.55)';
    if (curTool === 'track2') {
      const axis = Math.abs(drag.ex - drag.sx) >= Math.abs(drag.ey - drag.sy) ? 1 : 2;
      for (const i of tiles) {
        const x = i % MW, y = (i / MW | 0);
        const pair = axis === 1 ? (x < MW && y + 1 < MH ? i + MW : -1) : (x + 1 < MW ? i + 1 : -1);
        f.fillStyle = bldAt[i] ? 'rgba(255,70,70,.5)' : col; f.fillRect(x * T, y * T, T, T);
        if (pair >= 0) { f.fillStyle = bldAt[pair] ? 'rgba(255,70,70,.5)' : col; f.fillRect((pair % MW) * T, (pair / MW | 0) * T, T, T); }
      }
      return;
    }
    for (const i of tiles) { f.fillStyle = bldAt[i] ? 'rgba(255,70,70,.5)' : col; f.fillRect((i % MW) * T, (i / MW | 0) * T, T, T); } return;
  }
  if (drag && tool.kind === 'rect') {
    const x0 = Math.min(drag.sx, drag.ex), y0 = Math.min(drag.sy, drag.ey), x1 = Math.max(drag.sx, drag.ex), y1 = Math.max(drag.sy, drag.ey), col = curTool === 'bulldoze' ? 'rgba(255,70,70,.35)' : curTool === 'water' ? 'rgba(60,130,220,.5)' : curTool === 'plaza' ? 'rgba(230,220,190,.55)' : 'rgba(120,200,90,.5)';
    f.fillStyle = col; f.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T); outline(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T, curTool === 'bulldoze' ? '#ff5050' : '#ffffff'); return;
  }
  if (!inb(hoverT.x, hoverT.y)) return;
  if (tool.kind === 'build') {
    const type = curTool.slice(2), d = BT[type], a = anchorFor(type, hoverT), platformTiles = [];
    if (d.platform) for (let y = a.y; y < a.y + d.h; y++) for (let x = a.x; x < a.x + d.w; x++) platformTiles.push(inb(x, y) && water[y * MW + x] && !tile[y * MW + x] && !bldAt[y * MW + x] && !platform[y * MW + x]);
    const ok = d.platform ? platformTiles.length === d.w * d.h && platformTiles.every(Boolean) && canAffordPlatform(type) : canPlace(type, a.x, a.y);
    f.globalAlpha = 0.75;
    if (d.platform) { for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) drawPlatform(f, (a.x + x) * T, (a.y + y) * T, d.platform); }
    else drawBuilding(f, type, a.x * T, a.y * T, 777, (tx, ty) => inb(a.x + tx, a.y + ty) && water[(a.y + ty) * MW + a.x + tx] === 1);
    f.globalAlpha = 1;
    const conn = !d.platform && ok && (touchesStreet(type, a.x, a.y) || ((isLeisureWalk(type) || type === 'metro') && perimeter(a.x, a.y, d.w, d.h).some(isWalk)));
    f.fillStyle = !ok ? 'rgba(255,60,60,.45)' : conn ? 'rgba(80,255,120,.18)' : 'rgba(255,190,60,.3)'; f.fillRect(a.x * T, a.y * T, d.w * T, d.h * T);
    outline(a.x * T, a.y * T, d.w * T, d.h * T, !ok ? '#ff5050' : conn ? '#7dff9a' : '#ffbe3c'); return;
  }
  outline(hoverT.x * T, hoverT.y * T, T, T, curTool === 'bulldoze' ? '#ff5050' : (curTool === 'light' || curTool === 'overpass' || curTool === 'gate') ? '#ffd23f' : '#ffffff');
  if (selection && selection.kind !== 'bld') { const i = selection.i; outline((i % MW) * T, (i / MW | 0) * T, T, T, '#ffd75e'); }
}

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  if (regionView) { if (e.button === 0) { const m = regionHit(e.clientX, e.clientY); if (m >= 0) { closeRegion(); fitDistrict(m); } } return; }
  if (e.button === 2 && drag) { drag = null; return; } if (e.button === 2 && pasteMode) { stopPaste(); return; }
  if (e.button === 1 || e.button === 2 || spaceDown) { pan = {x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y}; cv.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  const t = screenToTile(e.clientX, e.clientY), tool = TOOLS[curTool];
  // Shift-click is the state debugger: it never pans or builds.
  if (e.shiftKey) { cycleTile(t); return; }
  if (tool.kind === 'select') { if (pasteMode) pasteAt(t); else if (inb(t.x, t.y)) drag = {sx: t.x, sy: t.y, ex: t.x, ey: t.y}; }
  else if (tool.kind === 'line' || tool.kind === 'rect') { if (inb(t.x, t.y)) drag = {sx: t.x, sy: t.y, ex: t.x, ey: t.y}; }
  else if (tool.kind === 'build') { drag = null; tryBuild(t); drag = {paint: true}; }
  else if (tool.kind === 'brush') { brushTree(t); drag = {paint: true}; }
  else if (tool.kind === 'click') { clickTool(curTool, t, e); }
  else if (tool.kind === 'inspect') inspectAt(t);
});
cv.addEventListener('pointermove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  if (regionView) { regionHover = regionHit(e.clientX, e.clientY); cv.style.cursor = regionHover >= 0 ? 'pointer' : 'default'; return; }
  if (pan) { cam.x = pan.cx - (e.clientX - pan.x) / cam.z; cam.y = pan.cy - (e.clientY - pan.y) / cam.z; clampCam(); return; }
  const t = screenToTile(e.clientX, e.clientY), moved = t.x !== hoverT.x || t.y !== hoverT.y; hoverT = t;
  if (drag) { if (drag.paint && moved) { if (TOOLS[curTool].kind === 'build') tryBuild(t); else brushTree(t); } else if (!drag.paint) { drag.ex = t.x; drag.ey = t.y; } }
});
cv.addEventListener('pointerup', () => {
  if (pan) { pan = null; cv.style.cursor = curTool === 'inspect' ? 'pointer' : 'crosshair'; return; }
  if (drag && !drag.paint) {
    const tool = TOOLS[curTool];
    if (tool.kind === 'line') commitLine(curTool, drag.sx, drag.sy, drag.ex, drag.ey);
    else if (tool.kind === 'rect') commitRect(curTool, drag.sx, drag.sy, drag.ex, drag.ey);
    else if (tool.kind === 'select') { const c = v => clamp(v, 0, MW - 1), r = v => clamp(v, 0, MH - 1); selRect = {x0: c(Math.min(drag.sx, drag.ex)), y0: r(Math.min(drag.sy, drag.ey)), x1: c(Math.max(drag.sx, drag.ex)), y1: r(Math.max(drag.sy, drag.ey))}; updateSelBar(); }
  }
  drag = null;
});
cv.addEventListener('pointerleave', () => { mouse.in = false; hoverEl.classList.add('hidden'); });
function zoomStep(dir, sx = innerWidth / 2, sy = innerHeight / 2) {
  if (regionView) { if (dir > 0) closeRegion(); return; }
  let k = ZOOMS.indexOf(cam.z); if (k < 0) k = ZOOMS.indexOf(3);
  if (k === 0 && dir < 0) { openRegion(); return; }
  const nk = Math.max(0, Math.min(ZOOMS.length - 1, k + dir)); if (nk !== k) zoomTo(ZOOMS[nk], sx, sy);
}
function zoomTo(z, sx = innerWidth / 2, sy = innerHeight / 2) { const ax = sx / cam.z + cam.x, ay = sy / cam.z + cam.y; cam.z = z; cam.x = ax - sx / cam.z; cam.y = ay - sy / cam.z; clampCam(); setT('zoomLbl', Math.round(z * 100) + '%'); }
function centerOn(i, z) { if (z) cam.z = z; cam.x = (i % MW) * T + 4 - innerWidth / 2 / cam.z; cam.y = (i / MW | 0) * T + 4 - innerHeight / 2 / cam.z; zoomTo(cam.z); }
function fitRegion() { let z = ZOOMS[0]; for (const zz of ZOOMS) if (MW * T * zz <= innerWidth - 20 && MH * T * zz <= innerHeight - 120) z = zz; centerOn(Math.floor(MH / 2) * MW + Math.floor(MW / 2), z); }
function fitDistrict(m) { let z = ZOOMS[0]; for (const zz of ZOOMS) if (DW * T * zz <= innerWidth - 20 && DH * T * zz <= innerHeight - 120) z = zz; const cx = (m % RW) * DW + DW / 2, cy = (m / RW | 0) * DH + DH / 2; centerOn(Math.floor(cy) * MW + Math.floor(cx), z); }
const camDistrict = () => districtOf((cam.x + innerWidth / 2 / cam.z) / T, (cam.y + innerHeight / 2 / cam.z) / T);
cv.addEventListener('wheel', e => { e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); }, {passive: false});

const keys = new Set();
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || document.body.classList.contains('menu-screen')) return;
  const k = e.key.toLowerCase(); if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey) { if (k === 'c' || k === 'x') { e.preventDefault(); if (curTool !== 'select' || !selRect) toast('Highlight an area with the Select tool (X) first.'); else copySel(k === 'x'); } else if (k === 's') { e.preventDefault(); saveLocal(false); } return; }
  keys.add(k);
  if ((k === 'delete' || k === 'backspace') && curTool === 'select' && selRect) { askConfirm('Clear everything in the highlighted area?', deleteSel); return; }
  if (k === 'escape') { if (!confirmEl.classList.contains('hidden')) confirmEl.classList.add('hidden'); else if (!saveEl.classList.contains('hidden')) saveEl.classList.add('hidden'); else if (pasteMode) stopPaste(); else if (curTool === 'select' && selRect) { selRect = null; updateSelBar(); } else if (regionView) closeRegion(); else if (drag) drag = null; else if (!helpEl.classList.contains('hidden')) helpEl.classList.add('hidden'); else { setTool('inspect'); select(null); } }
  else if (k === 'p') setSpeed(speed ? 0 : 1); else if (k === '1') setSpeed(1); else if (k === '2') setSpeed(3); else if (k === '3') setSpeed(8);
  else if (k === 'v') toggleOverlay('heat'); else if (k === 'c') toggleOverlay('occ'); else if (k === 'g') toggleOverlay('grid'); else if (k === 'm') toggleOverlay('mood'); else if (k === 'n') toggleOverlay('underground'); else if (k === 'y') toggleOverlay('sky');
  else if (k === '=' || k === '+') zoomStep(1); else if (k === '-' || k === '_') zoomStep(-1); else if (k === 'z') { if (regionView) closeRegion(); fitDistrict(camDistrict()); }
  else for (const id in TOOLS) if (TOOLS[id].key && TOOLS[id].key.toLowerCase() === k) { setTool(id); break; }
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === ' ') spaceDown = false; keys.delete(k); });
addEventListener('blur', () => keys.clear());
function panEdge(dt) {
  if (regionView || !mouse.in || pan) return;
  let dx = 0, dy = 0; if (mouse.x <= 0) dx = -1; else if (mouse.x >= innerWidth - 1) dx = 1; if (mouse.y <= 0) dy = -1; else if (mouse.y >= innerHeight - 1) dy = 1; if (!dx && !dy) return;
  const move = 520 * dt / cam.z; cam.x += dx * move; cam.y += dy * move; clampCam();
  const t = screenToTile(mouse.x, mouse.y), moved = t.x !== hoverT.x || t.y !== hoverT.y; hoverT = t;
  if (drag) { if (drag.paint && moved) { if (TOOLS[curTool].kind === 'build') tryBuild(t); else brushTree(t); } else if (!drag.paint) { drag.ex = t.x; drag.ey = t.y; } }
}
function panKeys(dt) { if (regionView) return; const s = 420 * dt / cam.z; if (keys.has('w') || keys.has('arrowup')) cam.y -= s; if (keys.has('s') || keys.has('arrowdown')) cam.y += s; if (keys.has('a') || keys.has('arrowleft')) cam.x -= s; if (keys.has('d') || keys.has('arrowright')) cam.x += s; if (keys.size) clampCam(); }
