// =====================================================================
// Saving: this browser, save files, and share codes
// =====================================================================
function rle(a) { let s = '', i = 0; while (i < a.length) { const v = a[i]; let j = i + 1; while (j < a.length && a[j] === v) j++; s += String.fromCharCode(48 + v) + (j - i).toString(36) + '.'; i = j; } return s; }
// Water and trees are stored only where they differ from what the seed generates.
function diffEnc(arr, gen, skip) { let s = '', last = 0; for (let i = 0; i < N; i++) { if (skip && skip(i)) continue; if (arr[i] !== gen[i]) { s += (i - last).toString(36) + ':' + arr[i] + ','; last = i; } } return s; }
function serialize() {
  const gw = new Uint8Array(N), gt = new Uint8Array(N); genTerrainInto(worldSeed, gw, gt);
  return {v: 5, seed: worldSeed, t: Math.round(gameMin),
    tile: rle(tile), oneway: rle(oneway), overpass: rle(overpass), walkway: rle(walkway),
    water: diffEnc(water, gw), tree: diffEnc(tree, gt, i => tile[i] || bldAt[i]),
    lights: [...lights].map(([i, L]) => [i, L.ns, L.ew, Math.round(L.off)]),
    b: [...buildings.values()].map(b => [b.type, b.x, b.y, b.seed >>> 0]),
    cam: [Math.round(cam.x), Math.round(cam.y), cam.z]};
}
// Everything loaded from a file or a code is checked before it touches the current region:
// only known building types, coordinates inside the world, values in range, and capped sizes.
const BAD = 'That save is damaged or was changed, so it was not loaded.';
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
function unrleInto(s, arr, maxV) {
  let i = 0, p = 0;
  while (p < s.length) {
    const v = s.charCodeAt(p) - 48, q = s.indexOf('.', p);
    if (v < 0 || v > maxV || q < 0 || q - p > 8) throw new Error(BAD);
    const n = parseInt(s.slice(p + 1, q), 36);
    if (!Number.isInteger(n) || n < 1 || i + n > N || !/^[0-9a-z]+$/.test(s.slice(p + 1, q))) throw new Error(BAD);
    arr.fill(v, i, i + n); i += n; p = q + 1;
  }
  if (i !== N) throw new Error(BAD);
}
function applyDiff(s, arr, maxV) {
  let i = 0;
  for (const part of s.split(',')) {
    if (!part) continue;
    const m = /^([0-9a-z]{1,6}):(\d)$/.exec(part);
    if (!m) throw new Error(BAD);
    i += parseInt(m[1], 36); const v = +m[2];
    if (i >= N || v > maxV) throw new Error(BAD);
    arr[i] = v;
  }
}
function loadData(d) {
  if (!d || typeof d !== 'object' || d.v !== 5) throw new Error('This save comes from a different version of the game.');
  if (!isInt(d.seed, 0, 1e9)) throw new Error(BAD);
  for (const k of ['tile', 'oneway', 'overpass', 'walkway', 'water', 'tree']) if (typeof d[k] !== 'string' || d[k].length > 5e6) throw new Error(BAD);
  if (!Array.isArray(d.b) || d.b.length > 40000 || !Array.isArray(d.lights) || d.lights.length > 40000) throw new Error(BAD);
  const nt = new Uint8Array(N), no = new Uint8Array(N), nov = new Uint8Array(N), nw = new Uint8Array(N), nwa = new Uint8Array(N), ntr = new Uint8Array(N);
  unrleInto(d.tile, nt, 4); unrleInto(d.oneway, no, 4); unrleInto(d.overpass, nov, 1); unrleInto(d.walkway, nw, 1);
  genTerrainInto(d.seed, nwa, ntr); applyDiff(d.water, nwa, 1); applyDiff(d.tree, ntr, 4);
  for (const e of d.b) if (!Array.isArray(e) || !hasType(e[0]) || !isInt(e[1], 0, MW - 1) || !isInt(e[2], 0, MH - 1) || !isInt(e[3], 0, 4294967295)) throw new Error(BAD);
  for (const e of d.lights) if (!Array.isArray(e) || !isInt(e[0], 0, N - 1) || !isInt(e[1], 3, 25) || !isInt(e[2], 3, 25) || !isInt(e[3], 0, 60)) throw new Error(BAD);
  // the save is valid: replace the region
  clearWorld();
  worldSeed = d.seed;
  tile.set(nt); oneway.set(no); overpass.set(nov); walkway.set(nw); water.set(nwa); tree.set(ntr);
  for (let i = 0; i < N; i++) if (tile[i]) tree[i] = 0;
  for (const [type, x, y, seed] of d.b) if (canPlace(type, x, y)) placeBuilding(type, x, y, seed);
  for (const [i, ns, ew, off] of d.lights) lights.set(i, {ns, ew, off});
  gameMin = isInt(d.t, 0, 1e9) ? d.t : 6.5 * 60;
  finishWorld();
  if (Array.isArray(d.cam) && d.cam.length === 3 && d.cam.every(Number.isFinite) && ZOOMS.includes(d.cam[2])) { cam.x = d.cam[0]; cam.y = d.cam[1]; cam.z = d.cam[2]; }
  zoomTo(cam.z, 0, 0);
}
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error(BAD);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
async function packText(obj) {
  const json = JSON.stringify(obj);
  if (typeof CompressionStream === 'function') {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'PTC5.' + b64(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return 'PTC5J.' + b64(new TextEncoder().encode(json));
}
async function unpackText(text) {
  text = String(text || '').trim();
  if (text.length > 4e6) throw new Error('That file is too large to be a PixelCity save.');
  let json;
  if (text.startsWith('PTC5.')) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser can\'t open compressed saves. Try a newer browser.');
    const reader = new Blob([unb64(text.slice(5))]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts = []; let total = 0;
    try {
      for (;;) { const {done, value} = await reader.read(); if (done) break; total += value.length; if (total > 3e7) { reader.cancel(); throw new Error(BAD); } parts.push(value); }
    } catch (e) { throw new Error(BAD); }
    const all = new Uint8Array(total); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
    json = new TextDecoder().decode(all);
  } else if (text.startsWith('PTC5J.')) json = new TextDecoder().decode(unb64(text.slice(6)));
  else throw new Error('That doesn\'t look like a PixelCity save.');
  try { return JSON.parse(json); } catch (e) { throw new Error(BAD); }
}
function saveLocal(quiet) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); if (!quiet) toast('Saved in this browser.'); return true; }
  catch (e) { if (!quiet) toast('This browser blocked saving. Use a save file instead.'); return false; }
}
function loadLocal(quiet) {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY)); } catch (e) { d = null; }
  if (!d) { if (!quiet) toast('No save found in this browser.'); return false; }
  try { loadData(d); if (!quiet) toast('Loaded your last save.'); return true; }
  catch (e) { if (!quiet) toast(e.message); return false; }
}
let dlCap = null;
async function downloadSave() {
  const text = await packText(serialize());
  const filename = `pixelcity-day${Math.floor(gameMin / 1440) + 1}.ptc`;
  if (dlCap) {
    try { await dlCap.save({filename, data: text}); toast('Save file ready.'); } catch (e) { if (e && e.code !== 'cancelled' && e.code !== 'declined') toast('The download didn\'t start. Try again.'); }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Save file downloaded.');
}
document.getElementById('sFileOpen').onchange = async e => {
  const file = e.target.files && e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (file.size > 4e6) { toast('That file is too large to be a PixelCity save.'); return; }
  try { loadData(await unpackText(await file.text())); saveEl.classList.add('hidden'); activeCode = null; renderCloud(); toast('Region loaded from the save file.'); }
  catch (err) { toast(err.message); }
};
// Save codes: the whole region, compressed into text you can paste anywhere. No server involved.
async function loadSaveCode(text) {
  try { loadData(await unpackText(text)); saveEl.classList.add('hidden'); activeCode = null; renderCloud(); toast('Region loaded from the save code.'); }
  catch (err) { toast(err.message); }
}
document.getElementById('sCodeCopy').onclick = async () => {
  const box = document.getElementById('sCodeBox');
  const code = await packText(serialize());
  box.value = code; box.classList.remove('hidden');
  try { await navigator.clipboard.writeText(code); toast(`Save code copied (${Math.round(code.length / 1000)}k characters). Paste it somewhere safe.`); }
  catch (e) { box.focus(); box.select(); toast('Press Ctrl+C to copy the highlighted save code.'); }
};
document.getElementById('sCodeLoad').onclick = () => {
  const text = document.getElementById('sCodeIn').value.trim();
  if (!text) { toast('Paste a save code into the box first.'); return; }
  if (parseCode(text)) { askConfirm('Replace the current region with this code\'s region?', () => openCode(text)); return; }  // a short share code works here too
  if (!text.startsWith('PTC5')) { toast('That doesn\'t look like a save code. Save codes start with PTC5.'); return; }
  askConfirm('Replace the current region with the region in this save code?', () => loadSaveCode(text));
};
document.getElementById('sLocalSave').onclick = () => saveLocal(false);
document.getElementById('sLocalLoad').onclick = () => askConfirm('Replace the current region with your last save in this browser?', () => { if (loadLocal(false)) saveEl.classList.add('hidden'); });
document.getElementById('sFileSave').onclick = () => downloadSave();
document.getElementById('saveClose').onclick = () => saveEl.classList.add('hidden');
function openSaveDlg() { saveEl.classList.remove('hidden'); renderCloud(); }

// Share codes live in this page's shared database. Each player writes only under their own id,
// so a code can be opened by anyone who has it but changed only by the person who made it.
const cloud = {db: null, uid: null, can: null, state: 'checking'};
let activeCode = null, lastCloudWrite = 0;
const MYCODES = SAVE_KEY + '.codes';
const SLOT_RE = /^[a-z0-9]{10}$/, UID_RE = /^[A-Za-z0-9_\-.~:@+]{1,180}$/;
function myCodes() { try { const v = JSON.parse(localStorage.getItem(MYCODES)); return Array.isArray(v) ? v.filter(c => c && typeof c.code === 'string').slice(0, 20) : []; } catch (e) { return []; } }
function rememberCode(code) { try { const list = myCodes().filter(c => c.code !== code); list.unshift({code, at: Date.now()}); localStorage.setItem(MYCODES, JSON.stringify(list.slice(0, 20))); } catch (e) {} }
function parseCode(code) {
  code = String(code || '').trim();
  const slot = code.slice(0, 10), uid = code.slice(10);
  if (!SLOT_RE.test(slot) || !UID_RE.test(uid)) return null;
  return {code, slot, uid, path: `saves/${uid}/${slot}/game`, prev: `saves/${uid}/${slot}/prev`};
}
function newSlot() { const a = new Uint8Array(10); crypto.getRandomValues(a); return [...a].map(v => '0123456789abcdefghijklmnopqrstuvwxyz'[v % 36]).join(''); }
const isMine = p => p && cloud.uid && p.uid === cloud.uid;
function renderCloud() {
  const note = document.getElementById('cloudNote'), body = document.getElementById('cloudBody');
  if (cloud.state !== 'ready') {
    body.classList.add('hidden');
    note.textContent = cloud.state === 'checking' ? 'Checking whether share codes are available…'
      : cloud.state === 'signedout' ? 'Sign in on claude.ai to use share codes. Save files work everywhere.'
      : 'Short share codes work when the game is opened from its claude.ai link. A save code (above) works everywhere.';
    return;
  }
  body.classList.remove('hidden');
  const canWrite = cloud.can !== false;
  note.textContent = canWrite ? 'Make a code to open this region on any device, or to share it with friends.' : 'You can open share codes here. To create your own, ask the page\'s owner for Contributor access, or use a save file.';
  document.getElementById('cCreate').disabled = !canWrite;
  const act = parseCode(activeCode);
  document.getElementById('cUpdate').disabled = !(canWrite && isMine(act));
  document.getElementById('cPrev').disabled = !(canWrite && isMine(act));
  const actEl = document.getElementById('cActive');
  actEl.textContent = act ? (isMine(act) ? 'You are editing your code. Update it to save your progress there.' : 'You opened someone else\'s code. Your changes stay with you until you create your own code.') : '';
  const mine = document.getElementById('cMine'); mine.textContent = '';
  for (const c of myCodes()) {
    const p = parseCode(c.code); if (!isMine(p)) continue;
    const rowEl = document.createElement('div'); rowEl.className = 'codeRow';
    const inp = document.createElement('input'); inp.type = 'text'; inp.readOnly = true; inp.value = c.code; inp.className = 'code'; inp.setAttribute('aria-label', 'Your share code');
    const cp = document.createElement('button'); cp.textContent = 'Copy';
    cp.onclick = () => { navigator.clipboard.writeText(c.code).then(() => toast('Code copied.'), () => { inp.select(); toast('Press Ctrl+C to copy the selected code.'); }); };
    const op = document.createElement('button'); op.textContent = 'Open';
    op.onclick = () => askConfirm('Replace the current region with this code\'s region?', () => openCode(c.code));
    rowEl.append(inp, cp, op); mine.append(rowEl);
  }
}
async function initCloud() {
  if (!window.claude || typeof window.claude.use !== 'function') { cloud.state = 'unavailable'; renderCloud(); return; }
  try {
    const [db, user, dl] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
    dlCap = dl || null;
    if (!db || !user) { cloud.state = db ? 'unavailable' : 'signedout'; renderCloud(); return; }
    const uid = await user.id();
    if (!uid || !UID_RE.test(uid)) { cloud.state = 'signedout'; renderCloud(); return; }
    cloud.db = db; cloud.uid = uid;
    try { cloud.can = await user.can('data.write'); } catch (e) { cloud.can = null; }
    cloud.state = 'ready';
  } catch (e) { cloud.state = 'unavailable'; }
  renderCloud();
}
function cloudBusy() {
  const wait = 15000 - (Date.now() - lastCloudWrite);
  if (wait > 0) { toast(`Please wait ${Math.ceil(wait / 1000)} seconds between cloud saves.`); return true; }
  return false;
}
function cloudError(e) {
  const code = e && e.code;
  if (code === 'invalid_argument') { cloud.can = false; renderCloud(); return 'This page doesn\'t let you create share codes. Use a save file instead.'; }
  if (code === 'quota_exceeded') return 'The share-code storage is full. Use a save file instead.';
  if (code === 'resource_exhausted') return 'Too many saves at once. Wait a moment and try again.';
  return 'Couldn\'t reach the share-code storage. Check your connection and try again.';
}
async function writeSave(p) {
  const text = await packText(serialize());
  if (text.length > 240000) throw {message: 'This region is too big for a share code. Use a save file instead.'};
  lastCloudWrite = Date.now();
  await cloud.db.doc(p.path).set({v: 5, savedAt: new Date().toISOString(), day: Math.floor(gameMin / 1440) + 1, pop: agents.length, data: text});
}
document.getElementById('cCreate').onclick = async () => {
  if (cloud.state !== 'ready' || cloudBusy()) return;
  const p = parseCode(newSlot() + cloud.uid);
  try { await writeSave(p); activeCode = p.code; rememberCode(p.code); renderCloud(); toast('Share code created. Copy it below.'); }
  catch (e) { toast(e.message && !e.code ? e.message : cloudError(e)); }
};
document.getElementById('cUpdate').onclick = async () => {
  const p = parseCode(activeCode);
  if (!isMine(p) || cloudBusy()) return;
  try {
    // keep the previous version so a bad update can be undone
    const cur = await cloud.db.doc(p.path).get();
    if (cur.exists) await cloud.db.doc(p.prev).set(Object.assign({}, cur.data()));
    await writeSave(p); toast('Your share code now has this region.');
  } catch (e) { toast(e.message && !e.code ? e.message : cloudError(e)); }
};
document.getElementById('cPrev').onclick = () => {
  const p = parseCode(activeCode); if (!isMine(p)) return;
  askConfirm('Load the version of your code from before its last update? You can then update the code with it.', async () => {
    try {
      const snap = await cloud.db.doc(p.prev).get();
      if (!snap.exists) { toast('There is no earlier version of this code yet.'); return; }
      loadData(await unpackText(snap.data().data)); toast('Loaded the earlier version. Update your code to keep it.');
    } catch (e) { toast(e.message && !e.code ? e.message : cloudError(e)); }
  });
};
async function openCode(code) {
  const p = parseCode(code);
  if (!p) { toast('That code isn\'t valid. Check that you copied all of it.'); return; }
  if (cloud.state !== 'ready') { renderCloud(); return; }
  try {
    const snap = await cloud.db.doc(p.path).get();
    if (!snap.exists) { toast('No region was found for that code.'); return; }
    const doc = snap.data();
    if (!doc || typeof doc.data !== 'string') throw new Error(BAD);
    loadData(await unpackText(doc.data));
    activeCode = p.code;
    if (isMine(p)) rememberCode(p.code);
    renderCloud();
    saveEl.classList.add('hidden');
    toast(isMine(p) ? 'Opened your region.' : 'Opened a copy of that region. Your changes won\'t affect the original.');
  } catch (e) { toast(e.message && !e.code ? e.message : cloudError(e)); }
}
document.getElementById('cLoad').onclick = () => {
  const code = document.getElementById('cInput').value;
  if (!parseCode(code)) { toast('That code isn\'t valid. Check that you copied all of it.'); return; }
  askConfirm('Replace the current region with this code\'s region?', () => openCode(code));
};
