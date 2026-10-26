// =====================================================================
// UI: toolbar, flyouts, icons, tooltip, dialogs
// =====================================================================
const SPR = {
  inspect: ['.###.....', '#...#....', '#...#....', '#...#....', '.###.....', '....##...', '.....##..', '......##.', '.......#.'],
  bulldoze: ['.........', '..####...', '..#..#...', '######.#.', '#######.#', '#######.#', '.#.#.#...', '.........', '.........'],
  select: ['##.#.#.##', '#.......#', '.........', '#.......#', '.........', '#.......#', '.........', '#.......#', '##.#.#.##'],
};
function makeIcon(id) {
  const ic = mk(54, 54), c = ic.getContext('2d');
  let aw = 18, ah = 18;
  if (id.startsWith('b:')) { const d = BT[id.slice(2)]; aw = d.w * T; ah = d.h * T; }
  const tmp = mk(Math.max(27, aw), Math.max(27, ah)), t = tmp.getContext('2d');
  const grass = () => { t.fillStyle = '#5a9e45'; t.fillRect(0, 0, aw, ah); };
  if (id.startsWith('b:')) {
    const ty = id.slice(2), d = BT[ty];
    if (d.platform) { for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) drawPlatform(t, x * T, y * T, d.platform); }
    else {
      grass();
      const wet = d.water ? (tx => tx === d.w - 1) : null;
      if (wet) { t.fillStyle = '#2e6cb4'; t.fillRect((d.w - 1) * T, 0, T, ah); }
      drawBuilding(t, ty, 0, 0, 4242, wet);
    }
  } else switch (id) {
    case 'rail': aw = ah = 9; drawRailTile(t, 0, 0, 15, 'junction'); break;
    case 'track': aw = ah = 9; grass(); drawTrackTile(t, 0, 0, 10, false); break;
    case 'signal': aw = ah = 9; grass(); drawTrackTile(t, 0, 0, 10, false); t.fillStyle = '#24282e'; t.fillRect(6, 4, 2, 3); t.fillStyle = '#e5484d'; t.fillRect(6, 4, 2, 2); break;
    case 'gate': aw = ah = 18; grass();
      drawRoadTile(t, 0, 6, 10, 0, 0, 0, 1, 0); drawRoadTile(t, 9, 6, 10, 0, 0, 0, 1, 0);
      drawTrackTile(t, 6, 0, 5, false); drawTrackTile(t, 6, 9, 5, false);
      t.fillStyle = '#24282e'; t.fillRect(4, 4, 2, 2); t.fillRect(12, 4, 2, 2);
      t.fillStyle = '#f4f5f7'; t.fillRect(5, 5, 1, 8); t.fillRect(12, 5, 1, 8);
      t.fillStyle = '#e5484d'; for (let k = 0; k < 8; k += 2) { t.fillRect(5, 5 + k, 1, 1); t.fillRect(12, 5 + k, 1, 1); }
      t.fillStyle = '#ff4848'; t.fillRect(12, 6, 2, 2); break;
    case 'freightline': aw = ah = 9; grass(); drawTrackTile(t, 0, 0, 10, false); t.fillStyle = '#f2c14e'; t.fillRect(1, 1, 2, 2); t.fillStyle = '#4d96ff'; t.fillRect(6, 6, 2, 2); break;
    case 'road': grass(); drawRoadTile(t, 0, 0, 4, 0, 0, 0, 1, 0); drawRoadTile(t, 0, 9, 3, 0, 0, 0, 1, 0); drawRoadTile(t, 9, 9, 8, 0, 0, 0, 1, 0); break;
    case 'country': grass(); drawRoadTile(t, 0, 4, 10, 0, 0, 0, 0, 0); drawRoadTile(t, 9, 4, 10, 0, 0, 0, 0, 0); break;
    case 'sidewalk': grass(); drawRoadTile(t, 0, 4, 10, 0, 0, 0, 1, 0); drawRoadTile(t, 9, 4, 10, 0, 0, 0, 1, 0);
      t.fillStyle = '#ff6b6b'; t.fillRect(4, 4, 1, 1); t.fillStyle = '#4d96ff'; t.fillRect(13, 12, 1, 1); t.fillStyle = '#f1c9a0'; t.fillRect(4, 3, 1, 1); t.fillRect(13, 11, 1, 1); break;
    case 'oneway': grass(); drawRoadTile(t, 0, 4, 10, 0, 0, 2, 1, 0); drawRoadTile(t, 9, 4, 10, 0, 0, 2, 1, 0); break;
    case 'highway': grass(); drawRoadTile(t, 0, 0, 10, 1, 0, 0, 0, 4); drawRoadTile(t, 9, 0, 10, 1, 0, 0, 0, 4); drawRoadTile(t, 0, 9, 10, 1, 0, 0, 0, 2); drawRoadTile(t, 9, 9, 10, 1, 0, 0, 0, 2); break;
    case 'overpass': aw = ah = 9; drawRoadTile(t, 0, 0, 5, 1, 0, 0, 0, 0); drawDeck(t, 0, 0, 1); break;
    case 'light': aw = ah = 9; drawRoadTile(t, 0, 0, 15, 0, 0, 0, 1, 0); t.fillStyle = '#3ef06b'; t.fillRect(0, 0, 1, 1); t.fillRect(8, 8, 1, 1); t.fillStyle = '#ff4848'; t.fillRect(8, 0, 1, 1); t.fillRect(0, 8, 1, 1); break;
    case 'path': grass(); drawPathTile(t, 0, 0, 6, 0); drawPathTile(t, 9, 0, 12, 0); drawPathTile(t, 0, 9, 3, 0); drawPathTile(t, 9, 9, 9, 0); break;
    case 'plaza': for (let k = 0; k < 4; k++) drawPlazaTile(t, (k & 1) * 9, (k >> 1) * 9, k === 1 ? 5 : 2); break;
    case 'tree': aw = ah = 9; grass(); drawTree(t, 0, 0, 1); break;
    case 'water': aw = ah = 9; t.fillStyle = '#2e6cb4'; t.fillRect(0, 0, 9, 9); t.fillStyle = '#68a2e0'; t.fillRect(1, 2, 3, 1); t.fillRect(5, 5, 3, 1); t.fillRect(2, 7, 2, 1); break;
    case 'land': aw = ah = 9; t.fillStyle = '#589c44'; t.fillRect(0, 0, 9, 9); t.fillStyle = '#d6c48c'; t.fillRect(0, 7, 9, 2); t.fillStyle = '#2e6cb4'; t.fillRect(0, 8, 9, 1); break;
    case 'district': aw = ah = 18; t.fillStyle = '#5ce08a'; t.fillRect(0, 0, 18, 18); t.fillStyle = '#5a9e45'; t.fillRect(3, 3, 12, 12); t.strokeStyle = '#ffffff'; t.lineWidth = 1; t.strokeRect(0.5, 0.5, 17, 17); break;
    case 'undistrict': aw = ah = 18; t.fillStyle = '#5a9e45'; t.fillRect(0, 0, 18, 18); t.fillStyle = '#ff5050'; for (let k = 3; k < 15; k++) { t.fillRect(k, k, 1, 1); t.fillRect(17 - k, k, 1, 1); } break;
    default: {
      aw = ah = 9; const s = SPR[id];
      t.fillStyle = id === 'bulldoze' ? '#f2c94c' : id === 'select' ? '#6fb3ff' : '#e9ecf5';
      s.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') t.fillRect(x, y, 1, 1); }));
    }
  }
  let s = 54 / Math.max(aw, ah);
  if (s >= 1) s = Math.floor(s);
  c.imageSmoothingEnabled = s < 1;
  c.drawImage(tmp, 0, 0, aw, ah, Math.round((54 - aw * s) / 2), Math.round((54 - ah * s) / 2), Math.round(aw * s), Math.round(ah * s));
  return ic;
}
const iconCache = {};
const icon = id => { const c = mk(54, 54); c.getContext('2d').drawImage(iconCache[id] || (iconCache[id] = makeIcon(id)), 0, 0); return c; };

const barEl = document.getElementById('bar'), flyEl = document.getElementById('flyout'), tipEl = document.getElementById('tip');
const hoverEl = document.getElementById('hover'), helpEl = document.getElementById('help');
const saveEl = document.getElementById('saveDlg'), confirmEl = document.getElementById('confirmDlg');
function showTip(el, id) {
  const t = TOOLS[id];
  tipEl.textContent = '';
  const b = document.createElement('b'); b.textContent = t.name; tipEl.append(b);
  if (t.key) { const k = document.createElement('span'); k.style.color = 'var(--dim)'; k.textContent = ` [${t.key}]`; tipEl.append(k); }
  tipEl.append(document.createElement('br'), document.createTextNode(t.desc));
  if (t.stats) { const s = document.createElement('span'); s.className = 's'; s.textContent = t.stats; tipEl.append(document.createElement('br'), s); }
  tipEl.classList.remove('hidden');
  const r = el.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
  tipEl.style.left = Math.max(8, Math.min(innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2)) + 'px';
  tipEl.style.top = Math.max(8, r.top - tr.height - 10) + 'px';
}
function hideTip() { tipEl.classList.add('hidden'); }
// The toolbar takes whatever width its contents need; this only nudges it left
// when that would otherwise put it under the zoom panel. Both values are read
// from the live DOM, so a different font, label or zoom control still fits.
function layoutBottom() {
  const zoom = document.getElementById('zoom'), bottom = document.getElementById('bottom');
  if (!zoom || !bottom) return;
  const style = document.documentElement.style;
  const zw = Math.ceil(zoom.getBoundingClientRect().width);
  style.setProperty('--zoomw', zw + 'px');
  const w = bottom.offsetWidth;                       // re-measured with the new max-width
  const shift = Math.min(0, innerWidth / 2 - zw - 18 - w / 2);
  style.setProperty('--bshift', Math.ceil(shift) + 'px');
}
function buildBar() {
  barEl.innerHTML = '';
  for (const id of ['inspect', 'select', 'bulldoze']) {
    const b = document.createElement('button'); b.className = 'card tool'; b.dataset.tool = id;
    b.style.width = '64px';
    b.append(icon(id)); b.append(document.createTextNode(TOOLS[id].name));
    b.onclick = () => setTool(id);
    b.onmouseenter = () => showTip(b, id); b.onmouseleave = hideTip;
    barEl.append(b);
  }
  const sep = document.createElement('div'); sep.className = 'sep'; barEl.append(sep);
  for (const cat of CATS) {
    const b = document.createElement('button'); b.className = 'tab'; b.dataset.cat = cat.id; b.textContent = cat.name;
    b.title = `Open the ${cat.name} palette`;
    b.style.padding = '10px 12px';
    b.onclick = () => openCat(curCat === cat.id ? null : cat.id);
    barEl.append(b);
  }
  layoutBottom();
}
// the pixel font settles after first paint and changes the width of every label
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layoutBottom());
function openCat(cat) {
  curCat = cat;
  barEl.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
  if (!cat) { flyEl.classList.add('hidden'); return; }
  flyEl.innerHTML = '';
  const catName = (CATS.find(c => c.id === cat) || {}).name || cat;
  // A search box and a close button make a long palette usable: type to narrow
  // it, Escape or ✕ to get it out of the way.
  const head = document.createElement('div');
  head.className = 'fhead';
  const title = document.createElement('b'); title.textContent = catName; head.append(title);
  const filter = document.createElement('input');
  filter.id = 'paletteFilter'; filter.type = 'search'; filter.placeholder = `Filter ${catName.toLowerCase()}…`;
  filter.setAttribute('aria-label', `Filter ${catName} tools`);
  head.append(filter);
  const close = document.createElement('button');
  close.className = 'fclose'; close.textContent = '✕'; close.title = 'Close palette';
  close.onclick = () => openCat(null);
  head.append(close);
  flyEl.append(head);

  const body = document.createElement('div'); body.className = 'fbody'; flyEl.append(body);
  // Tools are laid out in labelled groups, so a tab reads as sections rather
  // than one long row: metro, walking, then freight, for example.
  let group = null, row = null;
  const groups = [];
  for (const id in TOOLS) {
    if (TOOLS[id].cat !== cat) continue;
    const t = TOOLS[id], g = t.group || '';
    if (g !== group) {
      group = g;
      const wrap = document.createElement('div'); wrap.className = 'fgroup';
      if (g) { const lbl = document.createElement('small'); lbl.textContent = g; wrap.append(lbl); }
      row = document.createElement('div'); row.className = 'frow'; wrap.append(row);
      body.append(wrap); groups.push(wrap);
    }
    const b = document.createElement('button'); b.className = 'card'; b.dataset.tool = id;
    b.title = t.desc || t.name;
    b.dataset.search = `${t.name} ${t.desc || ''} ${g} ${t.key || ''}`.toLowerCase();
    b.append(icon(id));
    const nm = document.createElement('span'); nm.textContent = t.name; b.append(nm);
    if (t.stats) { const s = document.createElement('small'); s.textContent = t.stats.split(' · ')[0]; b.append(s); }
    if (t.key) { const k = document.createElement('kbd'); k.textContent = t.key; b.append(k); }
    b.onclick = () => setTool(id);
    b.onmouseenter = () => showTip(b, id); b.onmouseleave = hideTip;
    row.append(b);
  }
  const empty = document.createElement('div');
  empty.className = 'fempty'; empty.textContent = 'No tools match that filter.'; empty.hidden = true;
  body.append(empty);
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let any = false;
    for (const wrap of groups) {
      let shown = 0;
      for (const b of wrap.querySelectorAll('.card')) {
        const hit = !q || b.dataset.search.includes(q);
        b.classList.toggle('hidden', !hit);
        if (hit) shown++;
      }
      wrap.hidden = shown === 0;
      if (shown) any = true;
    }
    empty.hidden = any;
  });
  filter.addEventListener('keydown', e => { if (e.key === 'Escape') openCat(null); });
  if (cat === 'world') {
    const info = document.createElement('small'); info.className = 'field-hint';
    info.textContent = 'Build islands from materials produced by quarries and mines; placing platforms consumes the materials.';
    body.append(info);
  }
  if (cat === 'districts') {
    const wrap = document.createElement('div');
    wrap.id = 'districtList';
    wrap.className = 'list';
    body.append(wrap);
    updateDistrictUI();
  }
  flyEl.classList.remove('hidden');
  markTool();
  layoutBottom();
}
function markTool() { document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === curTool)); }
function setTool(id) {
  curTool = id; drag = null;
  if (id !== 'select') pasteMode = false;
  updateSelBar();
  const cat = TOOLS[id].cat;
  if (cat && cat !== curCat) openCat(cat);
  markTool();
  cv.style.cursor = id === 'inspect' ? 'pointer' : 'crosshair';
}
function setSpeed(s) { speed = s; document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', +b.dataset.s === s)); }
document.querySelectorAll('#speeds button').forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
let railViewAuto = false;
function syncOverlayButtons() {
  document.querySelectorAll('#overlays button').forEach(b => b.classList.toggle('on', !!overlays[b.dataset.o]));
}
function toggleOverlay(o) {
  if (o === 'power') return;   // electricity is scaffolding only
  overlays[o] = !overlays[o];
  if (o === 'underground') railViewAuto = false;   // switched by hand: leave it alone
  syncOverlayButtons();
  if (o === 'heat') { document.getElementById('cong').classList.toggle('hidden', !overlays.heat); if (overlays.heat) { computeArea(); updateHotspots(); } }
}
// Worst spots: peaks of the area congestion field, at least 8 tiles apart.
function updateHotspots() {
  const el = document.getElementById('hotList');
  const order = [];
  for (let i = 0; i < N; i++) if (areaPres[i] > 0.15 && areaHeat[i] > 0.35) order.push(i);
  order.sort((a, b) => areaHeat[b] - areaHeat[a]);
  const spots = [];
  for (const i of order) {
    const x = i % MW, y = i / MW | 0;
    if (spots.some(j => Math.abs(j % MW - x) + Math.abs((j / MW | 0) - y) < 8)) continue;
    spots.push(i);
    if (spots.length >= 5) break;
  }
  el.textContent = '';
  if (!spots.length) { const d = document.createElement('div'); d.style.color = 'var(--dim)'; d.textContent = 'No jams right now.'; el.append(d); return; }
  for (const i of spots) {
    let road = i, bd = 99;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = i % MW + dx, y = (i / MW | 0) + dy; if (!inb(x, y)) continue; const j = y * MW + x; if (isRoad(j) && heat[j] > 0 && Math.abs(dx) + Math.abs(dy) < bd) { bd = Math.abs(dx) + Math.abs(dy); road = j; } }
    let name = deg[road] >= 3 ? (lights.has(road) ? 'Signal' : 'Intersection') : tile[road] === 2 ? 'Highway' : 'Street';
    let near = null, nd = 7;
    for (const b of buildings.values()) {
      if (b.type === 'house' || b.type === 'farmhouse') continue;
      const d = Math.abs(b.cx - road % MW) + Math.abs(b.cy - (road / MW | 0)) - BT[b.type].w;
      if (d < nd) { nd = d; near = b; }
    }
    if (near) name += ' near ' + BT[near.type].name;
    const [r, g, b] = heatRGB(areaHeat[i] / 1.2);
    const btn = document.createElement('button'); btn.className = 'hot';
    const sw = document.createElement('i'); sw.style.background = `rgb(${r | 0},${g | 0},${b | 0})`;
    const lab = document.createElement('span'); lab.textContent = heatLabel(areaHeat[i] * 1.6);
    btn.append(sw, document.createTextNode(name), lab);
    btn.onclick = () => { centerOn(road, Math.max(cam.z, 4)); flash = {i: road, until: performance.now() + 2500}; select({kind: lights.has(road) ? 'light' : 'road', i: road}); };
    el.append(btn);
  }
}
document.querySelectorAll('#overlays button').forEach(b => b.onclick = () => toggleOverlay(b.dataset.o));
const menuEl = document.getElementById('menu');
document.getElementById('menuBtn').onclick = () => menuEl.classList.toggle('hidden');
const taxDlg = document.getElementById('taxDlg');
document.getElementById('taxBtn').onclick = () => {
  document.getElementById('taxSales').value = worldSettings.taxSales || 0;
  document.getElementById('taxIncome').value = worldSettings.taxIncome || 0;
  document.getElementById('taxSalesValue').textContent = `${worldSettings.taxSales || 0}%`;
  document.getElementById('taxIncomeValue').textContent = `${worldSettings.taxIncome || 0}%`;
  taxDlg.classList.remove('hidden');
};
document.getElementById('taxClose').onclick = () => taxDlg.classList.add('hidden');
document.getElementById('taxSales').oninput = e => { worldSettings.taxSales = +e.target.value; document.getElementById('taxSalesValue').textContent = `${e.target.value}%`; };
document.getElementById('taxIncome').oninput = e => { worldSettings.taxIncome = +e.target.value; document.getElementById('taxIncomeValue').textContent = `${e.target.value}%`; };
// The page can't use confirm() everywhere it runs, so it asks in its own dialog.
let confirmFn = null;
function askConfirm(msg, fn) { document.getElementById('confirmMsg').textContent = msg; confirmFn = fn; confirmEl.classList.remove('hidden'); document.getElementById('confirmNo').focus(); }
document.getElementById('confirmYes').onclick = () => { confirmEl.classList.add('hidden'); const f = confirmFn; confirmFn = null; if (f) f(); };
document.getElementById('confirmNo').onclick = () => { confirmEl.classList.add('hidden'); confirmFn = null; };
menuEl.querySelectorAll('button').forEach(b => b.onclick = () => {
  menuEl.classList.add('hidden');
  const m = b.dataset.m;
  if (m === 'save') openSaveDlg();
  else if (m === 'file') downloadSave();
  else if (m === 'newWorld') openWorldSetup();
  else if (m === 'worlds') openWorldList('game');
  else if (m === 'start') returnToStartScreen();
  else if (m === 'clearmap') { const d = camDistrict(); askConfirm(`Clear everything built in the ${DISTRICTS[d]} district?`, () => clearDistrict(d)); }
  else if (m === 'help') helpEl.classList.remove('hidden');
});
document.getElementById('helpClose').onclick = () => helpEl.classList.add('hidden');
document.getElementById('zOut').onclick = () => zoomStep(-1);
document.getElementById('zIn').onclick = () => zoomStep(1);
document.getElementById('zFit').onclick = () => { const d = camDistrict(); if (regionView) closeRegion(); fitDistrict(d); };
document.getElementById('zRegion').onclick = () => regionView ? closeRegion() : openRegion();
document.getElementById('mapChip').onclick = () => regionView ? closeRegion() : openRegion();
function toast(msg) {
  const el = document.createElement('div'); el.className = 'toast panel'; el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 4600);
}
function toastAction(msg, label, fn) {
  const el = document.createElement('div'); el.className = 'toast panel act';
  const s = document.createElement('span'); s.textContent = msg;
  const b = document.createElement('button'); b.textContent = label; b.onclick = () => { el.remove(); fn(); };
  el.append(s, b);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 7100);
}
function showBuilding(id) {
  const b = B(id); if (!b) { toast('That building is gone now.'); return; }
  if (regionView) closeRegion();
  const i = Math.floor(b.cy) * MW + Math.floor(b.cx);
  centerOn(i, Math.max(cam.z, 3));
  flash = {i, until: performance.now() + 3000};
  setTool('inspect'); select({kind: 'bld', id});
}
// Jump to a spot on the map, for an alert that wants to show where something
// happened: a crash site, a fire, or a driver who could not park.
function showSite(x, y) {
  const tx = Math.round(x), ty = Math.round(y);
  if (!inb(tx, ty)) return;
  if (regionView) closeRegion();
  const i = ty * MW + tx;
  centerOn(i, Math.max(cam.z, 4));
  flash = {i, until: performance.now() + 3000};
}
document.getElementById('gFailRow').onclick = () => { if (stats.lastFail) showBuilding(stats.lastFail); else toast('No parking problems yet.'); };
document.getElementById('gIncidentRow').onclick = () => {
  const s = stats.lastSite;
  if (s) showSite(s.x, s.y); else toast('No fires or crashes yet.');
};

// =====================================================================
// Inspector
// =====================================================================
const inspEl = document.getElementById('inspector');
let selection = null;
function inspectAt(t) {
  if (!inb(t.x, t.y)) { select(null); return; }
  const i = t.y * MW + t.x;
  if (bldAt[i]) select({kind: 'bld', id: bldAt[i]});
  else if (lights.has(i)) select({kind: 'light', i});
  else if (trackOn[i] && isRoad(i)) select({kind: 'crossing', i});
  else if (isRoad(i)) select({kind: 'road', i});
  else select(null);
}
function row(label, id) { return `<div class="row"><span>${label}</span><span id="${id}">-</span></div>`; }
function select(sel) {
  selection = sel;
  if (!sel) { inspEl.classList.add('hidden'); return; }
  inspEl.classList.remove('hidden');
  let html = '';
  if (sel.kind === 'bld') {
    const b = B(sel.id), d = BT[b.type];
    html = `<div class="ih"><span id="iIcon"></span><div class="t">${d.name}<small>${d.label || CATLABEL[d.cat]} · ${DISTRICTS[districtOf(b.cx, b.cy)]}</small></div><button id="iClose">✕</button></div>`;
    if (d.homes) html += row('Residents', 'ivRes') + row('Home right now', 'ivHome') + row('Asleep', 'ivSleep') + row('Happy with traffic', 'ivMood');
    if (d.jobs) html += row('Workers', 'ivJobs') + row('People inside', 'ivPeople');
    if (isLeisure(b.type)) html += row('Visitors', 'ivPeople');
    if (d.efficiencyBase) html += row('Industry efficiency', 'ivEfficiency');
    if (b.type === 'billboard') html += `<label for="billboardPolicy">Policy advertisement</label><select id="billboardPolicy"><option value="driving">Driving</option><option value="tax">Tax</option><option value="environment">Environment</option><option value="birth">Birth rate</option></select><label for="billboardTone">Public response</label><select id="billboardTone"><option value="positive">Positive</option><option value="negative">Negative</option></select><p class="note">Policy effects on mood are a future system.</p>`;
    if (b.type === 'warehouse') html += row('Mixed inventory', 'ivInventory');
    if (d.cap) html += row('Cars parked', 'ivCars') + `<div class="bar"><i id="ivBar"></i></div>`;
    if (b.type === 'metro') html += row('Riders nearby', 'ivRiders');
    if (b.type === 'airport') html += row('Planes in the air', 'ivPlanes');
    if (b.type === 'dock') html += row('Boats on the water', 'ivBoats');
    if (b.type === 'port' || b.type === 'riverWharf') html += row('Ships at sea', 'ivShips') + row('Cargo at the quay', 'ivStock');
    if (b.type === 'distribution' || b.type === 'railyard') html += row('Cargo waiting', 'ivStock');
    if (typeof producerOf === 'function' && producerOf(b)) html += row('Stock in the yard', 'ivStock');
    if (BT[b.type].cat === 'com') html += row('Goods on the shelf', 'ivStock');
    html += row('Road access', 'ivRoad') + row('Walk score', 'ivWalk') + row('Cars heading here', 'ivIncoming');
    html += row('District', 'ivDistrict');
    if (d.homes) html += row('Job mood', 'ivMoodJob') + row('Transport mood', 'ivMoodRide') + row('Birth mood', 'ivMoodBirth');
    if (POWER_REQ[b.type]) html += row('Power output', 'ivPower') + row('Needs', 'ivPowerNeed');
    html += `<div class="btns"><button class="danger" id="iDel">Bulldoze</button></div>`;
  } else if (sel.kind === 'light') {
    const L = lights.get(sel.i);
    html = `<div class="ih"><span id="iIcon"></span><div class="t">Traffic Light<small>Signal timing</small></div><button id="iClose">✕</button></div>
      ${row('North-South', 'ivNS')}${row('East-West', 'ivEW')}${row('Congestion', 'ivHeat')}
      <div class="row" style="margin-top:6px"><span>N-S green</span><span id="ivNSv">${L.ns}s</span></div><input type="range" min="3" max="25" step="1" value="${L.ns}" id="iNS">
      <div class="row"><span>E-W green</span><span id="ivEWv">${L.ew}s</span></div><input type="range" min="3" max="25" step="1" value="${L.ew}" id="iEW">
      <div class="row"><span>Offset (green wave)</span><span id="ivOffv">${Math.round(L.off)}s</span></div><input type="range" min="0" max="30" step="1" value="${Math.round(L.off)}" id="iOff">
      <div class="btns"><button class="danger" id="iRmLight">Remove light</button></div>`;
  } else if (sel.kind === 'road') {
    html = `<div class="ih"><span id="iIcon"></span><div class="t" id="ivRoadName">Road<small></small></div><button id="iClose">✕</button></div>
      ${row('Type', 'ivType')}${row('Connections', 'ivDeg')}${row('Congestion', 'ivHeat')}${row('Cars here', 'ivHere')}
      <div class="btns" id="iRoadBtns"></div>`;
  } else if (sel.kind === 'crossing') {
    html = `<div class="ih"><span id="iIcon"></span><div class="t">Level Crossing<small>street over freight track</small></div><button id="iClose">✕</button></div>
      ${row('Crossing gate', 'ivGate')}${row('Nearest train', 'ivTrain')}${row('Trains held', 'ivBlock')}${row('Cars here', 'ivHere')}${row('Congestion', 'ivHeat')}
      <div class="btns" id="iCrossBtns"></div>`;
  }
  inspEl.innerHTML = html;
  const ic = document.getElementById('iIcon');
  if (sel.kind === 'bld') ic.append(icon('b:' + B(sel.id).type));
  else ic.append(icon(sel.kind === 'light' ? 'light' : sel.kind === 'crossing' ? 'gate' : overpass[sel.i] ? 'overpass' : tile[sel.i] === 2 ? 'highway' : oneway[sel.i] ? 'oneway' : walkway[sel.i] ? 'road' : 'country'));
  document.getElementById('iClose').onclick = () => select(null);
  if (sel.kind === 'bld') document.getElementById('iDel').onclick = () => { const b = B(sel.id); if (b) { removeBuilding(b); mapChanged(); } select(null); };
  if (sel.kind === 'light') {
    const L = lights.get(sel.i);
    const bind = (id, key, lab) => { const el = document.getElementById(id); el.oninput = () => { L[key] = +el.value; document.getElementById(lab).textContent = el.value + 's'; }; };
    bind('iNS', 'ns', 'ivNSv'); bind('iEW', 'ew', 'ivEWv'); bind('iOff', 'off', 'ivOffv');
    document.getElementById('iRmLight').onclick = () => { lights.delete(sel.i); select({kind: 'road', i: sel.i}); };
  }
  if (sel.kind === 'road') buildRoadButtons();
  if (sel.kind === 'crossing') buildCrossButtons();
  if (sel.kind === 'bld' && B(sel.id).type === 'billboard') {
    const b = B(sel.id); b.policy ||= {message: 'driving', tone: 'positive'};
    const msg = document.getElementById('billboardPolicy'), tone = document.getElementById('billboardTone');
    msg.value = b.policy.message; tone.value = b.policy.tone;
    msg.onchange = () => { b.policy.message = msg.value; };
    tone.onchange = () => { b.policy.tone = tone.value; };
  }
  updateInspector();
}
function buildRoadButtons() {
  const i = selection.i, box = document.getElementById('iRoadBtns');
  box.innerHTML = '';
  const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { fn(); markTiles([i]); mapChanged(); if (selection) select(lights.has(i) ? {kind: 'light', i} : isRoad(i) ? {kind: 'road', i} : null); }; box.append(b); };
  if (deg[i] >= 3 && !lights.has(i) && !overpass[i]) btn('Add traffic light', () => lights.set(i, {ns: 8, ew: 8, off: 0}));
  if (deg[i] === 4) btn(overpass[i] ? 'Remove overpass' : 'Make overpass', () => { overpass[i] = overpass[i] ? 0 : 1; lights.delete(i); });
  if (tile[i] === 1) {
    btn(walkway[i] ? 'Remove sidewalks' : 'Add sidewalks', () => { walkway[i] = walkway[i] ? 0 : 1; });
    btn(oneway[i] ? 'Rotate one-way ↻' : 'Make one-way', () => { oneway[i] = oneway[i] ? oneway[i] % 4 + 1 : 2; });
    if (oneway[i]) btn('Make two-way', () => { oneway[i] = 0; });
    btn('Upgrade to highway', () => { tile[i] = 2; oneway[i] = 0; walkway[i] = 0; });
  } else btn('Downgrade to street', () => { tile[i] = 1; walkway[i] = 1; });
  const del = document.createElement('button'); del.className = 'danger'; del.textContent = 'Bulldoze';
  del.onclick = () => { tile[i] = 0; oneway[i] = 0; walkway[i] = 0; overpass[i] = 0; lights.delete(i); markTiles([i]); mapChanged(); select(null); };
  box.append(del);
}
// A crossing can only carry a gate where the rails run straight across the
// street, not beside it.
const canGate = i => trackOn[i] && isRoad(i) && bits(track[i]) === 2 && !(cmask[i] & ((track[i] & 1) ? 5 : 10));
function buildCrossButtons() {
  const i = selection.i, box = document.getElementById('iCrossBtns');
  box.innerHTML = '';
  if (canGate(i)) {
    const b = document.createElement('button');
    b.textContent = gates.has(i) ? 'Remove crossing gate' : 'Add crossing gate';
    b.onclick = () => { if (gates.has(i)) gates.delete(i); else gates.add(i); mapChanged(); select({kind: 'crossing', i}); };
    box.append(b);
  } else {
    const p = document.createElement('p'); p.className = 'note'; p.textContent = 'Gates need a straight piece of track crossing the street.'; box.append(p);
  }
  const road = document.createElement('button'); road.textContent = 'Road tools';
  road.onclick = () => select({kind: 'road', i});
  box.append(road);
}
function setT(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
const CATEXTRA = {rural: 'Agriculture', resource: 'Resource', power: 'Power', transit: 'Transit'};
for (const k of Object.keys(CATEXTRA)) if (!CATLABEL[k]) CATLABEL[k] = CATEXTRA[k];
function heatLabel(h) { return h < 0.15 ? 'Free flowing' : h < 0.6 ? 'Light' : h < 1.3 ? 'Busy' : h < 2.2 ? 'Heavy' : 'Jammed'; }
const MOODWORD = {happy: 'happy', ok: 'okay', sad: 'annoyed', angry: 'furious'};
function updateInspector() {
  if (!selection) return;
  if (document.getElementById('taxDlg') && !document.getElementById('taxDlg').classList.contains('hidden')) return;
  const s = selection;
  if (s.kind === 'bld') {
    const b = B(s.id); if (!b) { select(null); return; }
    const d = BT[b.type];
    setT('ivRes', `${b.residents} / ${d.homes}`);
    setT('ivHome', b.people);
    setT('ivSleep', b.asleep);
    setT('ivMood', b.residents ? `${Math.round(b.mood * 100)}% (${MOODWORD[moodFace(b.mood)]})` : '-');
    setT('ivJobs', `${b.workers} / ${d.jobs}`);
    setT('ivPeople', b.people);
    setT('ivCars', `${b.cars} / ${d.cap}${b.cars >= d.cap ? ' FULL' : ''}`);
    const bar = document.getElementById('ivBar');
    if (bar) { const r = Math.min(1, b.cars / (d.cap || 1)); bar.style.width = (r * 100) + '%'; bar.style.background = r >= 1 ? 'var(--bad)' : r >= 0.75 ? 'var(--warn)' : 'var(--good)'; }
    setT('ivRoad', b.road >= 0 ? 'Yes' : b.walk >= 0 ? 'Walk only' : 'None!');
    setT('ivWalk', Math.round(b.ws * 10 / 1.4) / 10 + ' / 10');
    let inc = 0; for (const c of cars) if (c.dest === b.id || c.intent === b.id) inc++;
    setT('ivIncoming', inc);
    if (b.type === 'metro') { let r = 0; for (const p of peds) if (p.mode === 'metro') r++; setT('ivRiders', r); }
    if (b.type === 'airport') setT('ivPlanes', planes.filter(p => p.ap === b.id).length);
    if (b.type === 'dock') setT('ivBoats', boats.length);
    if (b.type === 'port' || b.type === 'riverWharf') setT('ivShips', ships.length);
    setT('ivStock', Math.floor(b.stock || 0));
    if (d.efficiencyBase) setT('ivEfficiency', `${Math.round((b.efficiency || industryEfficiency(b.type, b.x, b.y)) * 100)}%`);
    if (b.type === 'warehouse') {
      const items = Object.entries(b.inventory || {}).filter(([, n]) => n > 0).map(([good, n]) => `${GOOD_LABEL[good] || good.slice(0, 4).toUpperCase()} ${formatQuantity(n)}`);
      setT('ivInventory', `${formatQuantity(warehouseTotal(b))}/${WAREHOUSE_CAP}${items.length ? ' · ' + items.join(' · ') : ''}`);
    }
    const dist = districtAt(b.y * MW + b.x);
    setT('ivDistrict', dist ? dist.name : 'none');
    if (d.homes) {
      setT('ivMoodJob', Math.round(b.moodJob * 100) + '%');
      setT('ivMoodRide', Math.round(b.moodTransport * 100) + '%');
      setT('ivMoodBirth', Math.round(b.moodRepro * 100) + '%');
    }
    if (POWER_REQ[b.type]) {
      setT('ivPower', POWER_REQ[b.type].out + ' MW (not wired up yet)');
      setT('ivPowerNeed', powerReqMet(b.type) ? 'met' : 'missing ' + powerGap(b.type));
    }
  } else if (s.kind === 'light') {
    const L = lights.get(s.i); if (!L) { select(null); return; }
    const nm = ['GREEN', 'YELLOW', 'RED'];
    setT('ivNS', nm[lightState(L, 0)]); setT('ivEW', nm[lightState(L, 1)]);
    setT('ivHeat', heatLabel(heat[s.i]));
  } else if (s.kind === 'crossing') {
    const i = s.i;
    if (!isRoad(i)) { select(null); return; }
    if (!trackOn[i]) { select({kind: 'road', i}); return; }
    setT('ivGate', gates.has(i) ? (railBusyAt(i) || railSoonAt(i) ? 'closed' : 'open') : 'none');
    setT('ivTrain', railBusyAt(i) ? 'passing' : railSoonAt(i) ? 'approaching' : 'clear');
    const block = blockOf[i];
    setT('ivBlock', block && blockBusy(block) ? 'yes' : 'no');
    setT('ivHeat', heatLabel(heat[i]));
    let n = 0; const arr = bucket.get(i); if (arr) n = arr.length; setT('ivHere', n);
  } else if (s.kind === 'road') {
    const i = s.i; if (!isRoad(i)) { select(null); return; }
    const type = overpass[i] ? 'Overpass' : autoOw[i] ? `Highway, 2 lanes ${DIRNAME[autoOw[i]]}` : tile[i] === 2 ? 'Highway' : oneway[i] ? `One-way ${DIRNAME[oneway[i]]}` : walkway[i] ? 'Street with sidewalks' : 'Country road';
    setT('ivType', type + (water[i] ? ' (bridge)' : ''));
    const nm = document.getElementById('ivRoadName'); if (nm) nm.firstChild.textContent = overpass[i] ? 'Overpass' : deg[i] >= 3 ? 'Intersection' : tile[i] === 2 ? 'Highway' : water[i] ? 'Bridge' : 'Road';
    setT('ivDeg', deg[i] >= 3 ? `${deg[i]}-way intersection` : deg[i] + '');
    setT('ivHeat', heatLabel(heat[i]));
    let n = 0; const arr = bucket.get(i); if (arr) n = arr.length; setT('ivHere', n);
  }
}

// =====================================================================
// HUD
// =====================================================================
const gcv = document.getElementById('graph'), gctx = gcv.getContext('2d');
const sunCv = document.getElementById('sun'), sunCtx = sunCv.getContext('2d');
function grade(ti) { const s = 100 - ti * 100; return s >= 88 ? ['A', 'var(--good)'] : s >= 76 ? ['B', '#9be26a'] : s >= 62 ? ['C', 'var(--warn)'] : s >= 48 ? ['D', '#ff9a4d'] : ['F', 'var(--bad)']; }
let hudTimer = 0, hoverTimer = 0, hotTimer = 0, areaTimer = 0;
function hud(dt) {
  hudTimer += dt; hoverTimer += dt; areaTimer += dt;
  if (hoverTimer > 0.1) { hoverTimer = 0; updateHover(); }
  if (overlays.heat && areaTimer > 0.5) { areaTimer = 0; computeArea(); }
  if (hudTimer < 0.25) return;
  hudTimer = 0;
  updateMaterialHUD();
  const topB = document.getElementById('top').getBoundingClientRect().bottom + 10;
  document.getElementById('side').style.top = topB + 'px';
  if (innerWidth > 760) inspEl.style.top = topB + 'px';
  menuEl.style.top = topB - 4 + 'px';
  document.getElementById('toasts').style.top = topB + 'px';
  const bot = document.getElementById('bottom').getBoundingClientRect();
  const congEl = document.getElementById('cong'), zoomEl = document.getElementById('zoom');
  const sideB = document.getElementById('side').getBoundingClientRect();
  if (bot.left < 280) { congEl.style.bottom = 'auto'; congEl.style.top = (innerWidth > 760 ? sideB.bottom + 10 : topB) + 'px'; }
  else { congEl.style.top = 'auto'; congEl.style.bottom = ''; }
  zoomEl.style.bottom = (innerWidth - bot.right < zoomEl.offsetWidth + 20 && !regionView ? innerHeight - bot.top + 8 : 10) + 'px';
  hotTimer += 0.25;
  if (overlays.heat && hotTimer >= 2) { hotTimer = 0; updateHotspots(); }
  computeDistStats();
  setT('mapName', DISTRICTS[camDistrict()]);
  const h = (gameMin / 60) % 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  setT('clockT', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  setT('dayT', `Day ${Math.floor(gameMin / 1440) + 1}`);
  const night = darkness(h) > 0.3;
  sunCtx.clearRect(0, 0, 9, 9);
  sunCtx.fillStyle = night ? '#dfe6ff' : '#ffd23f';
  sunCtx.fillRect(2, 2, 5, 5); sunCtx.fillRect(3, 1, 3, 7); sunCtx.fillRect(1, 3, 7, 3);
  if (night) { sunCtx.fillStyle = '#1b2034'; sunCtx.fillRect(4, 1, 4, 5); }
  let jobs = 0, employed = 0, moodSum = 0, sleep = 0;
  for (const b of buildings.values()) { jobs += BT[b.type].jobs; sleep += b.asleep; }
  for (const a of agents) { if (a.job) employed++; moodSum += a.mood; }
  setT('sPop', agents.length);
  setT('sJobs', `${employed}/${jobs}`);
  let queued = 0; for (const b of buildings.values()) queued += b.queue.length;
  setT('sCars', cars.length + (queued ? ` (+${queued})` : ''));
  const [g, gc] = grade(stats.ti);
  const fl = document.getElementById('sFlow'); fl.textContent = cars.length ? g : '-'; fl.style.color = gc;
  const avg = stats.trips.length ? stats.trips.reduce((s, v) => s + v, 0) / stats.trips.length : 0;
  setT('sTrip', stats.trips.length ? `${Math.round(avg)} min` : '-');
  setT('sWx', weatherNow().name);
  setT('sPow', `${power.capacity}/${power.demand}`);
  setT('gTi', Math.round(stats.ti * 100) + '%');
  setT('gWait', Math.round(stats.wait || 0));
  setT('gFail', stats.frustrated);
  let thru = 0; for (const c of cars) if (c.through) thru++;
  setT('gThru', connections.length >= 2 ? thru : 'no edge roads');
  setT('gHappy', agents.length ? Math.round(moodSum / agents.length * 100) + '%' : '-');
  setT('gSleep', sleep);
  setT('gMoodCity', `job ${Math.round(cityMood.job * 100)} · ride ${Math.round(cityMood.transport * 100)} · birth ${Math.round(cityMood.repro * 100)}`);
  setT('gIncidents', `${incidents.filter(i => i.state !== 'done').length} · ${units.filter(u => u.state !== 'idle').length} out`);
  const sales = document.getElementById('taxSales'), income = document.getElementById('taxIncome');
  if (sales && document.getElementById('taxDlg').classList.contains('hidden')) { sales.value = worldSettings.taxSales || 0; income.value = worldSettings.taxIncome || 0; }
  setT('gAir', `${planes.length} · ${boats.length}`);
  let buses = 0, riders = 0; for (const c of cars) if (c.bus) { buses++; riders += c.riders.length; }
  setT('gTransit', `${buses} · ${riders}`);
  setT('gMetro', `${metros.length} · ${metroRiders()}`);
  let trucks = 0; for (const c of cars) if (c.truck) trucks++;
  setT('gCargo', `${trucks} · ${typeof cargoStats === 'object' ? cargoStats.deliveries : 0}`);
  setT('gShips', `${ships.length} · ${ports.length}`);
  let wagons = 0; for (const t of freight) wagons += t.consist.length;
  setT('gFreight', `${freight.length} · ${wagons} cars${freightLines.length ? ` · ${freightLines.length} L` : ''}`);
  const m = {car: 0, walk: 0, metro: 0, bus: 0}; for (const v of stats.modes) m[v]++;
  document.getElementById('mBus').style.width = (m.bus / (stats.modes.length || 1) * 100) + '%';
  setT('lBus', `bus ${Math.round(m.bus / (stats.modes.length || 1) * 100)}%`);
  const tot = stats.modes.length || 1;
  document.getElementById('mCar').style.width = (stats.modes.length ? m.car / tot * 100 : 100) + '%';
  document.getElementById('mWalk').style.width = (m.walk / tot * 100) + '%';
  document.getElementById('mMetro').style.width = (m.metro / tot * 100) + '%';
  setT('lCar', `car ${Math.round(m.car / tot * 100)}%`); setT('lWalk', `walk ${Math.round(m.walk / tot * 100)}%`); setT('lMetro', `metro ${Math.round(m.metro / tot * 100)}%`);
  gctx.fillStyle = '#10141f'; gctx.fillRect(0, 0, 230, 70);
  gctx.fillStyle = '#1d2438'; for (let y = 17; y < 70; y += 17) gctx.fillRect(0, y, 230, 1);
  const hist = stats.hist, maxC = Math.max(10, ...hist.map(v => v.cars));
  hist.forEach((v, k) => { const ch = Math.round(v.cars / maxC * 66); gctx.fillStyle = '#2f4a78'; gctx.fillRect(k * 2, 70 - ch, 2, ch); });
  hist.forEach((v, k) => { gctx.fillStyle = v.ti < 0.24 ? '#5fdc7a' : v.ti < 0.45 ? '#ffcc4d' : '#ff5d5d'; gctx.fillRect(k * 2, 68 - Math.round(v.ti * 66), 2, 2); });
  updateInspector();
}
function updateHover() {
  if (regionView || !mouse.in || pan || drag || !inb(hoverT.x, hoverT.y)) { hoverEl.classList.add('hidden'); return; }
  const i = hoverT.y * MW + hoverT.x;
  let txt = '';
  if (bldAt[i]) {
    const b = B(bldAt[i]), d = BT[b.type];
    txt = d.name;
    if (d.homes) txt += ` · home ${b.people}/${b.residents}` + (b.residents ? ` · ${MOODWORD[moodFace(b.mood)]} about traffic` : '');
    else if (d.jobs) txt += ` · inside ${b.people}`;
    else if (isLeisure(b.type)) txt += ` · visitors ${b.people}`;
    if (d.cap) txt += ` · parked ${b.cars}/${d.cap}`;
    if (b.road < 0 && b.walk < 0) txt += ' · NO ACCESS';
  } else if (isRoad(i)) {
    txt = (overpass[i] ? 'Overpass' : deg[i] >= 3 ? (lights.has(i) ? 'Signal' : 'Intersection') : trackOn[i] ? 'Level crossing' : tile[i] === 2 ? (autoOw[i] ? 'Highway (2 lanes)' : 'Highway') : water[i] ? 'Bridge' : oneway[i] ? 'One-way' : walkway[i] ? 'Street' : 'Country road') + ' · ' + heatLabel(heat[i]);
    if (connections.includes(i)) txt += ' · leaves the region';
  } else if (tile[i] === 3) txt = 'Footpath';
  else if (tile[i] === 4) txt = 'Plaza';
  if (!txt || curTool !== 'inspect') { hoverEl.classList.add('hidden'); return; }
  hoverEl.textContent = txt;
  hoverEl.classList.remove('hidden');
  hoverEl.style.left = Math.min(innerWidth - hoverEl.offsetWidth - 8, mouse.x + 16) + 'px';
  hoverEl.style.top = (mouse.y + 18) + 'px';
}
