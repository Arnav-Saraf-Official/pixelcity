// =====================================================================
// Saving: this browser, save files, and share codes
// =====================================================================
const WORLD_INDEX_KEY = SAVE_KEY + '.worlds.v1';
const ACTIVE_WORLD_KEY = SAVE_KEY + '.activeWorld';
const MAX_WORLD_SLOTS = 12;
let worldSlots = [], activeWorldId = null, autosaveWarningShown = false;
const slotStorageKey = id => SAVE_KEY + '.world.' + id;
const validSlotId = id => /^[a-f0-9]{16}$/.test(id);
function cleanWorldSlots(value) {
  if (!value || value.v !== 1 || !Array.isArray(value.slots)) throw new Error('World list data is damaged.');
  const seen = new Set(), slots = [];
  for (const entry of value.slots) {
    if (!entry || !validSlotId(entry.id) || seen.has(entry.id)) continue;
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 32) : '';
    if (!name) continue;
    seen.add(entry.id);
    slots.push({
      id: entry.id,
      name,
      mode: entry.mode === 'survival' ? 'survival' : 'sandbox',
      mapType: ['pregenerated', 'empty', 'imported'].includes(entry.mapType) ? entry.mapType : 'imported',
      seed: Number.isInteger(entry.seed) && entry.seed >= 0 && entry.seed <= 1e9 ? entry.seed : 0,
      createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
      updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0,
    });
    if (slots.length >= MAX_WORLD_SLOTS) break;
  }
  return slots;
}
function persistWorldSlots(slots) {
  localStorage.setItem(WORLD_INDEX_KEY, JSON.stringify({v: 1, slots}));
}
function recoverWorldSlots() {
  const prefix = SAVE_KEY + '.world.', recovered = [];
  for (let i = 0; i < localStorage.length && recovered.length < MAX_WORLD_SLOTS; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (!validSlotId(id)) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (!data || data.v !== 5 || !Number.isInteger(data.seed) || data.seed < 0 || data.seed > 1e9) continue;
      const now = Date.now();
      recovered.push({id, name: `Recovered world ${recovered.length + 1}`, mode: 'sandbox', mapType: 'imported', seed: data.seed, createdAt: now, updatedAt: 0});
    } catch (e) {
      console.warn(`Skipping unreadable saved world ${id}.`, e);
    }
  }
  return recovered;
}
function newWorldSlotId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
}
function initWorldSlots() {
  try {
    const raw = localStorage.getItem(WORLD_INDEX_KEY);
    if (raw) {
      try { worldSlots = cleanWorldSlots(JSON.parse(raw)); }
      catch (e) {
        worldSlots = recoverWorldSlots();
        persistWorldSlots(worldSlots);
        toast(`World list was damaged; recovered ${worldSlots.length} saved world${worldSlots.length === 1 ? '' : 's'}.`);
      }
    } else worldSlots = [];
    activeWorldId = localStorage.getItem(ACTIVE_WORLD_KEY);
    if (!worldSlots.some(slot => slot.id === activeWorldId)) {
      activeWorldId = worldSlots.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id || null;
    }
    if (!worldSlots.length) migrateLegacyWorld();
    if (activeWorldId) localStorage.setItem(ACTIVE_WORLD_KEY, activeWorldId);
  } catch (e) {
    worldSlots = [];
    activeWorldId = null;
    toast(`Couldn't read saved worlds: ${e.message}`);
  }
  return worldSlots;
}
function migrateLegacyWorld() {
  for (const key of [SAVE_KEY, LEGACY_SAVE_KEY]) {
    let raw;
    try { raw = localStorage.getItem(key); }
    catch (e) { toast('Could not read the old local save.'); return; }
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      loadData(data);
      const id = newWorldSlotId(), now = Date.now();
      const slot = {id, name: 'Recovered city', mode: 'sandbox', mapType: 'imported', seed: data.seed, createdAt: now, updatedAt: now};
      const previousActive = localStorage.getItem(ACTIVE_WORLD_KEY);
      try {
        localStorage.setItem(slotStorageKey(id), JSON.stringify(serialize()));
        persistWorldSlots([slot]);
        localStorage.setItem(ACTIVE_WORLD_KEY, id);
      } catch (e) {
        try {
          localStorage.removeItem(slotStorageKey(id));
          persistWorldSlots(worldSlots);
          if (previousActive) localStorage.setItem(ACTIVE_WORLD_KEY, previousActive);
          else localStorage.removeItem(ACTIVE_WORLD_KEY);
        } catch (rollbackError) { console.error('Could not roll back legacy world migration.', rollbackError); }
        throw e;
      }
      worldSlots = [slot];
      activeWorldId = id;
      for (const oldKey of [SAVE_KEY, LEGACY_SAVE_KEY]) {
        try { localStorage.removeItem(oldKey); }
        catch (e) { toast(`World migrated, but the old save copy could not be removed: ${e.message}`); }
      }
      toast('Your existing city was moved into a world slot.');
      return;
    } catch (e) {
      toast(`Couldn't migrate the old local save: ${e.message}`);
      return;
    }
  }
}
function createWorldSlot(name, mode, mapType, data = serialize()) {
  if (worldSlots.length >= MAX_WORLD_SLOTS) { toast(`You can keep up to ${MAX_WORLD_SLOTS} worlds in this browser.`); return null; }
  const id = newWorldSlotId(), now = Date.now();
  const slot = {id, name: String(name || '').trim().slice(0, 32) || 'New World', mode, mapType, seed: data.seed, createdAt: now, updatedAt: now};
  const nextSlots = [...worldSlots, slot];
  try {
    localStorage.setItem(slotStorageKey(id), JSON.stringify(data));
    persistWorldSlots(nextSlots);
    localStorage.setItem(ACTIVE_WORLD_KEY, id);
    worldSlots = nextSlots;
    activeWorldId = id;
    autosaveWarningShown = false;
    return slot;
  } catch (e) {
    try { localStorage.removeItem(slotStorageKey(id)); persistWorldSlots(worldSlots); }
    catch (rollbackError) { console.error('Could not roll back failed world creation.', rollbackError); }
    toast(`Couldn't save the new world: ${e.message}`);
    return null;
  }
}
function openWorldSlot(id) {
  const slot = worldSlots.find(entry => entry.id === id);
  if (!slot) { toast('That world is no longer in the world list.'); return false; }
  const previousWorld = serialize(), previousId = activeWorldId;
  const previousUpdatedAt = slot.updatedAt;
  try {
    const raw = localStorage.getItem(slotStorageKey(id));
    if (!raw) throw new Error('The saved world data is missing.');
    loadData(JSON.parse(raw));
    activeWorldId = id;
    slot.updatedAt = Date.now();
    localStorage.setItem(ACTIVE_WORLD_KEY, id);
    persistWorldSlots(worldSlots);
    autosaveWarningShown = false;
    return true;
  } catch (e) {
    try { loadData(previousWorld); } catch (restoreError) { console.error('Could not restore the previous world after a failed load.', restoreError); }
    activeWorldId = previousId;
    slot.updatedAt = previousUpdatedAt;
    try {
      if (previousId) localStorage.setItem(ACTIVE_WORLD_KEY, previousId);
      else localStorage.removeItem(ACTIVE_WORLD_KEY);
      persistWorldSlots(worldSlots);
    } catch (restoreError) { console.error('Could not restore the active world pointer.', restoreError); }
    toast(`Couldn't open ${slot.name}: ${e.message}`);
    return false;
  }
}
function renameWorldSlot(id, name) {
  const slot = worldSlots.find(entry => entry.id === id), nextName = String(name || '').trim();
  if (!slot) return false;
  if (!nextName || nextName.length > 32) { toast('World names must be 1–32 characters.'); return false; }
  const previous = slot.name;
  slot.name = nextName;
  try { persistWorldSlots(worldSlots); return true; }
  catch (e) { slot.name = previous; toast(`Couldn't rename that world: ${e.message}`); return false; }
}
function deleteWorldSlot(id) {
  const slot = worldSlots.find(entry => entry.id === id);
  if (!slot) return false;
  let saved = null;
  try {
    saved = localStorage.getItem(slotStorageKey(id));
    const nextSlots = worldSlots.filter(entry => entry.id !== id);
    persistWorldSlots(nextSlots);
    localStorage.removeItem(slotStorageKey(id));
    if (activeWorldId === id) {
      localStorage.removeItem(ACTIVE_WORLD_KEY);
    }
    worldSlots = nextSlots;
    if (activeWorldId === id) activeWorldId = null;
    return true;
  } catch (e) {
    try { if (saved !== null) localStorage.setItem(slotStorageKey(id), saved); persistWorldSlots(worldSlots); }
    catch (rollbackError) { console.error('Could not restore deleted world data.', rollbackError); }
    toast(`Couldn't delete that world: ${e.message}`);
    return false;
  }
}
function rle(a) { let s = '', i = 0; while (i < a.length) { const v = a[i]; let j = i + 1; while (j < a.length && a[j] === v) j++; s += String.fromCharCode(48 + v) + (j - i).toString(36) + '.'; i = j; } return s; }
// Water and trees are stored only where they differ from what the seed generates.
function diffEnc(arr, gen, skip) { let s = '', last = 0; for (let i = 0; i < N; i++) { if (skip && skip(i)) continue; if (arr[i] !== gen[i]) { s += (i - last).toString(36) + ':' + arr[i] + ','; last = i; } } return s; }
function listFlags(a) { const out = []; for (let i = 0; i < N; i++) if (a[i]) out.push(i); return out; }
function serialize() {
  const gw = new Uint8Array(N), gt = new Uint8Array(N); genTerrainInto(worldSeed, gw, gt);
  const savedBuildings = [...buildings.values()];
  return {v: 5, seed: worldSeed, t: Math.round(gameMin), settings: {...worldSettings}, tax: {sales: worldSettings.taxSales || 0, income: worldSettings.taxIncome || 0}, resources: {...resources},
    tile: rle(tile), platform: rle(platform), oneway: rle(oneway), overpass: rle(overpass), walkway: rle(walkway), rail: rle(railOn), track: rle(trackOn), track2: rle(trackWide), sig: rle(sigNode),
    water: diffEnc(water, gw), tree: diffEnc(tree, gt, i => tile[i] || bldAt[i]),
    lights: [...lights].map(([i, L]) => [i, L.ns, L.ew, Math.round(L.off)]),
    gates: [...gates], gateOff: listFlags(gateOff),
    b: savedBuildings.map(b => [b.type, b.x, b.y, b.seed >>> 0]),
    state: savedBuildings.map((b, i) => [i, Number.isFinite(b.stock) ? b.stock : null, b.inventory || null, b.byproducts || null, b.policy || null]),
    districts: [...districts.values()].map(d => [d.id, d.name, d.color]),
    dlayer: rle(districtLayer),
    lines: freightLines.map(l => [l.id, l.stops.slice(), l.color]),
    wx: [WEATHER.kind, Math.round(WEATHER.until)],
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
    const m = /^([0-9a-z]{1,6}):(\d{1,2})$/.exec(part);
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
  if (d.gates !== undefined && (!Array.isArray(d.gates) || d.gates.length > N)) throw new Error(BAD);
  if (Array.isArray(d.gates) && d.gates.some(i => !isInt(i, 0, N - 1))) throw new Error(BAD);
  if (d.gateOff !== undefined && (!Array.isArray(d.gateOff) || d.gateOff.length > N)) throw new Error(BAD);
  if (Array.isArray(d.gateOff) && d.gateOff.some(i => !isInt(i, 0, N - 1))) throw new Error(BAD);
  if (d.state !== undefined && (!Array.isArray(d.state) || d.state.length > d.b.length)) throw new Error(BAD);
  if (d.resources !== undefined && (!d.resources || typeof d.resources !== 'object' || Array.isArray(d.resources) || Object.values(d.resources).some(v => !Number.isFinite(v) || v < 0 || v > 1e12))) throw new Error(BAD);
  // rail and track were added after the first v5 saves, so they may be missing:
  // an old region simply has no tunnels or tracks until you draw some
  if (d.rail !== undefined && (typeof d.rail !== 'string' || d.rail.length > 5e6)) throw new Error(BAD);
  if (d.track !== undefined && (typeof d.track !== 'string' || d.track.length > 5e6)) throw new Error(BAD);
  if (d.track2 !== undefined && (typeof d.track2 !== 'string' || d.track2.length > 5e6)) throw new Error(BAD);
  if (d.sig !== undefined && (typeof d.sig !== 'string' || d.sig.length > 5e6)) throw new Error(BAD);
  const nt = new Uint8Array(N), npl = new Uint8Array(N), no = new Uint8Array(N), nov = new Uint8Array(N), nw = new Uint8Array(N), nwa = new Uint8Array(N), ntr = new Uint8Array(N), nra = new Uint8Array(N), ntk = new Uint8Array(N), ntw = new Uint8Array(N), nsig = new Uint8Array(N);
  unrleInto(d.tile, nt, 4);
  if (d.platform !== undefined && typeof d.platform !== 'string') throw new Error(BAD);
  if (typeof d.platform === 'string') unrleInto(d.platform, npl, 3);
  unrleInto(d.oneway, no, 4); unrleInto(d.overpass, nov, 1); unrleInto(d.walkway, nw, 1);
  if (typeof d.rail === 'string') unrleInto(d.rail, nra, 1);
  if (typeof d.track === 'string') unrleInto(d.track, ntk, 1);
  if (typeof d.track2 === 'string') unrleInto(d.track2, ntw, 2);
  if (typeof d.sig === 'string') unrleInto(d.sig, nsig, 1);
  genTerrainInto(d.seed, nwa, ntr); applyDiff(d.water, nwa, 1); applyDiff(d.tree, ntr, TREE_MAXV);
  for (const e of d.b) if (!Array.isArray(e) || !hasType(e[0]) || !isInt(e[1], 0, MW - 1) || !isInt(e[2], 0, MH - 1) || !isInt(e[3], 0, 4294967295)) throw new Error(BAD);
  for (const e of d.lights) if (!Array.isArray(e) || !isInt(e[0], 0, N - 1) || !isInt(e[1], 3, 25) || !isInt(e[2], 3, 25) || !isInt(e[3], 0, 60)) throw new Error(BAD);
  // the save is valid: replace the region
  clearWorld();
  worldSeed = d.seed;
  tile.set(nt); platform.set(npl); oneway.set(no); overpass.set(nov); walkway.set(nw); water.set(nwa); tree.set(ntr); railOn.set(nra); trackOn.set(ntk); trackWide.set(ntw); sigNode.set(nsig);
  // Lanes remembered for a tile that no longer carries track would confuse the
  // linker, so drop them.
  for (let i = 0; i < N; i++) if (!trackOn[i]) trackWide[i] = 0;
  for (let i = 0; i < N; i++) if (tile[i] || water[i] || platform[i]) tree[i] = 0;
  const restoredBuildings = [];
  for (const [type, x, y, seed] of d.b) restoredBuildings.push(canPlace(type, x, y) || canPlaceLoose(type, x, y) ? placeBuilding(type, x, y, seed) : null);
  if (Array.isArray(d.state)) for (const entry of d.state) {
    if (!Array.isArray(entry) || !isInt(entry[0], 0, d.b.length - 1) || entry.length !== 5) throw new Error(BAD);
    const b = restoredBuildings[entry[0]];
    if (!b) continue;
    const [, stock, inventory, byproducts, policy] = entry;
    if (stock !== null && (!Number.isFinite(stock) || stock < 0 || stock > 1e9)) throw new Error(BAD);
    if (stock !== null) b.stock = stock;
    if (inventory !== null) {
      if (b.type !== 'warehouse' || !inventory || typeof inventory !== 'object' || Array.isArray(inventory)) throw new Error(BAD);
      const clean = Object.create(null);
      for (const [good, amount] of Object.entries(inventory)) {
        if (!GOOD_KEYS.includes(good) || !Number.isFinite(amount) || amount < 0 || amount > WAREHOUSE_CAP) throw new Error(BAD);
        clean[good] = amount;
      }
      if (Object.values(clean).reduce((sum, amount) => sum + amount, 0) > WAREHOUSE_CAP) throw new Error(BAD);
      b.inventory = clean;
    }
    if (byproducts !== null) {
      if (!producerOf(b) || !byproducts || typeof byproducts !== 'object' || Array.isArray(byproducts)) throw new Error(BAD);
      const clean = Object.create(null);
      for (const [good, amount] of Object.entries(byproducts)) {
        if (!Object.hasOwn(producerOf(b).byproducts || {}, good) || !Number.isFinite(amount) || amount < 0 || amount > 100) throw new Error(BAD);
        clean[good] = amount;
      }
      b.byproducts = clean;
    }
    if (policy !== null) {
      if (b.type !== 'billboard' || !policy || !['driving', 'tax', 'environment', 'birth', 'health'].includes(policy.message) || !['positive', 'negative'].includes(policy.tone)) throw new Error(BAD);
      b.policy = {message: policy.message, tone: policy.tone};
    }
  }
  if (d.resources) for (const good of Object.keys(resources)) if (Number.isFinite(d.resources[good])) resources[good] = d.resources[good];
  for (const [i, ns, ew, off] of d.lights) lights.set(i, {ns, ew, off});
  if (Array.isArray(d.gates)) for (const i of d.gates) gates.add(i);
  if (Array.isArray(d.gateOff)) for (const i of d.gateOff) gateOff[i] = 1;
  if (typeof d.dlayer === 'string') {
    const nd = new Int32Array(N); unrleInto(d.dlayer, nd, 4);
    districtLayer.set(nd);
  }
  if (Array.isArray(d.districts)) for (const e of d.districts) {
    if (!Array.isArray(e) || !isInt(e[0], 1, 1e6) || typeof e[1] !== 'string' || typeof e[2] !== 'string') continue;
    districts.set(e[0], {id: e[0], name: e[1].slice(0, 24), color: e[2].slice(0, 16), policy: {}});
    nextDid = Math.max(nextDid, e[0] + 1);
  }
  markDistrictsDirty();
  if (Array.isArray(d.wx) && WEATHER_KINDS[d.wx[0]]) { WEATHER.kind = d.wx[0]; WEATHER.until = d.wx[1]; }
  const settings = d.settings || {};
  worldSettings = {
    difficulty: DIFFICULTIES.includes(settings.difficulty) ? settings.difficulty : 'normal',
    placement: PLACEMENT_POLICIES.includes(settings.placement) ? settings.placement : 'requireEverything',
    taxSales: Number.isFinite(settings.taxSales) ? clamp(settings.taxSales, 0, 30) : Number.isFinite(d.tax?.sales) ? clamp(d.tax.sales, 0, 30) : 0,
    taxIncome: Number.isFinite(settings.taxIncome) ? clamp(settings.taxIncome, 0, 50) : Number.isFinite(d.tax?.income) ? clamp(d.tax.income, 0, 50) : 0,
  };
  freightLines = [];
  nextLineId = 1;
  if (Array.isArray(d.lines)) for (const e of d.lines.slice(0, 32)) {
    if (!Array.isArray(e) || !Array.isArray(e[1])) continue;
    const stops = e[1].filter(v => isInt(v, 1, 1e9)).slice(0, 4);
    if (stops.length < 2) continue;
    const id = isInt(e[0], 1, 1e9) ? e[0] : nextLineId;
    if (freightLines.some(l => l.id === id)) continue;
    freightLines.push({id, stops, color: typeof e[2] === 'string' ? e[2].slice(0, 16) : '#f2c14e'});
    nextLineId = Math.max(nextLineId, id + 1);
  }
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
  if (!activeWorldId) { if (!quiet) toast('Create or open a world before saving.'); return false; }
  let slot, oldData, oldIndex, oldActive, oldSeed, oldUpdatedAt;
  try {
    slot = worldSlots.find(entry => entry.id === activeWorldId);
    if (!slot) throw new Error('The active world is missing from the world list.');
    oldData = localStorage.getItem(slotStorageKey(activeWorldId));
    oldIndex = localStorage.getItem(WORLD_INDEX_KEY);
    oldActive = localStorage.getItem(ACTIVE_WORLD_KEY);
    oldSeed = slot.seed;
    oldUpdatedAt = slot.updatedAt;
    localStorage.setItem(slotStorageKey(activeWorldId), JSON.stringify(serialize()));
    slot.seed = worldSeed;
    slot.updatedAt = Date.now();
    persistWorldSlots(worldSlots);
    localStorage.setItem(ACTIVE_WORLD_KEY, activeWorldId);
    autosaveWarningShown = false;
    if (!quiet) toast('Saved in this browser.');
    return true;
  } catch (e) {
    if (slot) {
      if (oldSeed !== undefined) slot.seed = oldSeed;
      if (oldUpdatedAt !== undefined) slot.updatedAt = oldUpdatedAt;
    }
    try {
      if (oldData !== undefined) {
        if (oldData === null) localStorage.removeItem(slotStorageKey(activeWorldId));
        else localStorage.setItem(slotStorageKey(activeWorldId), oldData);
      }
      if (oldIndex !== undefined) {
        if (oldIndex === null) localStorage.removeItem(WORLD_INDEX_KEY);
        else localStorage.setItem(WORLD_INDEX_KEY, oldIndex);
      }
      if (oldActive !== undefined) {
        if (oldActive === null) localStorage.removeItem(ACTIVE_WORLD_KEY);
        else localStorage.setItem(ACTIVE_WORLD_KEY, oldActive);
      }
    } catch (rollbackError) { console.error('Could not roll back a failed world save.', rollbackError); }
    if (!quiet || !autosaveWarningShown) toast(`Couldn't save this world in the browser: ${e.message}`);
    autosaveWarningShown = true;
    return false;
  }
}
function loadLocal(quiet) {
  if (!activeWorldId) { if (!quiet) toast('No active world is open.'); return false; }
  try {
    const raw = localStorage.getItem(slotStorageKey(activeWorldId));
    if (!raw) throw new Error('The saved world data is missing.');
    loadData(JSON.parse(raw));
    if (!quiet) toast('Loaded this world.');
    return true;
  }
  catch (e) { if (!quiet) toast(e.message); return false; }
}
function loadImportedWorld(data) {
  const previousWorld = serialize();
  try {
    loadData(data);
    if (!saveLocal(true)) {
      loadData(previousWorld);
      toast('The imported world was not applied because it could not be saved to this slot.');
      return false;
    }
    return true;
  } catch (e) {
    try { loadData(previousWorld); } catch (restoreError) { console.error('Could not restore the previous world after a failed import.', restoreError); }
    toast(e.message);
    return false;
  }
}
let dlCap = null;
async function downloadSave() {
  const text = await packText(serialize());
  const filename = `pixelcity-day${Math.floor(gameMin / 1440) + 1}.save`;
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
  try { if (!loadImportedWorld(await unpackText(await file.text()))) return; saveEl.classList.add('hidden'); activeCode = null; renderCloud(); toast('Region loaded from the save file.'); }
  catch (err) { toast(err.message); }
};
// Save codes: the whole region, compressed into text you can paste anywhere. No server involved.
async function loadSaveCode(text) {
  try { if (!loadImportedWorld(await unpackText(text))) return; saveEl.classList.add('hidden'); activeCode = null; renderCloud(); toast('Region loaded from the save code.'); }
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
      if (!loadImportedWorld(await unpackText(snap.data().data))) return;
      toast('Loaded the earlier version. Update your code to keep it.');
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
    if (!loadImportedWorld(await unpackText(doc.data))) return;
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
