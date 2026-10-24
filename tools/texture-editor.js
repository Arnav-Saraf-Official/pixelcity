'use strict';
// =====================================================================
// Texture Studio — pixel designs and conditionals, no drawing ops.
//
//   designs     complete pictures painted pixel by pixel
//   conditions  short text rules that choose a design for a parameter set
//   swatches    a colour, a colour from a parameter, or a conditional cell
//   marks       the non-visual layer (windows, parking, status light)
//
// The file this downloads is exactly the .texture JSONC the build reads.
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const SAVED_KEY = 'pixelcity.textureStudio.v2';
  const HEADER = [
    '// texture/2 — designs of pixel rows, conditions in short text.',
    '// A condition chooses the design to paint, e.g. "m = 5" or "hw > 0 and night".',
    '// Edit with the Texture Studio (npm run build, then /textures).',
    '',
  ].join('\n');

  const state = {
    families: Object.create(null),
    family: null,
    sprite: null,
    design: null,
    tool: 'pencil',
    swatch: 1,
    group: null,
    zoom: 8,
    grid: true,
    showMarks: true,
    markType: 'win',
    test: Object.create(null),      // "family/sprite" -> {param: value}
    undo: new Map(),                // "family/sprite/design" -> snapshots
    redo: new Map(),
    drag: null,
    last: null,
    rev: 0,
  };
  let bundled = null;
  let validateTimer = null;
  let savedNotice = '';

  // -------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'value') n[k] = v;
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  function clean(v) {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v)) if (k.charCodeAt(0) !== 95) out[k] = clean(v[k]);
      return out;
    }
    return v;
  }
  function status(msg, kind) {
    const s = $('status');
    s.textContent = msg;
    s.className = kind || '';
  }
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const hex2 = v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const alphaHex = a => a >= 255 ? '' : hex2(a);
  function cssColor(r, g, b, a) {
    return a >= 255 ? '#' + hex2(r) + hex2(g) + hex2(b) : `rgba(${r},${g},${b},${Math.round(a / 255 * 1000) / 1000})`;
  }
  function toHexColor(c) {
    if (typeof c !== 'string') return '#ffffff';
    const hex = c.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
      let v = hex[1];
      if (v.length === 3) v = v.split('').map(x => x + x).join('');
      if (v.length === 4) v = v.split('').map(x => x + x).join('');
      return '#' + v.slice(0, 6);
    }
    const m = c.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const p = m[1].split(',').map(Number);
      return '#' + hex2(p[0]) + hex2(p[1]) + hex2(p[2]);
    }
    return '#ffffff';
  }

  // -------------------------------------------------------------------
  // Document access
  // -------------------------------------------------------------------
  const doc = () => state.family ? state.families[state.family] : null;
  const tex = () => {
    const d = doc();
    return d && state.sprite ? d.textures[state.sprite] : null;
  };
  const design = () => {
    const t = tex();
    return t && state.design ? t.designs[state.design] : null;
  };
  const testKey = () => state.family + '/' + state.sprite;
  const testParams = () => Object.assign({}, state.test[testKey()] || {});
  const paramNames = () => Object.keys((tex() && tex().params) || {});
  const designNames = () => Object.keys((tex() && tex().designs) || {});
  const rowChar = (x, y) => {
    const d = design();
    return d && d.rows[y] ? (d.rows[y][x] || '.') : '.';
  };
  function groupDefinitions(t = tex(), create = false) {
    if (!t) return null;
    const designs = Object.values(t.designs || {});
    const hasLegacyGroups = designs.some(d => d.groups && Array.isArray(d.groups.items));
    if (!t.groups && !create && !hasLegacyGroups) return null;
    if (!t.groups || typeof t.groups !== 'object') t.groups = { items: [] };
    if (!Array.isArray(t.groups.items)) t.groups.items = [];

    for (const d of designs) {
      if (!d.groups || !Array.isArray(d.groups.items)) continue;
      const memberships = [];
      for (const item of d.groups.items) {
        if (!t.groups.items.some(group => group.id === item.id)) {
          const { id, name, when, color } = item;
          t.groups.items.push({ id, name, when, color });
        }
        memberships.push({ id: item.id, pixels: Array.isArray(item.pixels) ? item.pixels : [] });
      }
      d.groups.items = memberships;
      if (!Number.isInteger(d.groups.paletteStart)) d.groups.paletteStart = d.palette.length;
    }
    return t.groups;
  }
  function groupData(d = design(), create = false) {
    if (!d) return null;
    if (!d.groups || typeof d.groups !== 'object') {
      if (!create) return null;
      d.groups = { paletteStart: d.palette.length, items: [] };
    }
    if (!Array.isArray(d.groups.items)) d.groups.items = [];
    if (!Number.isInteger(d.groups.paletteStart)) d.groups.paletteStart = d.palette.length;
    for (const item of d.groups.items) if (!Array.isArray(item.pixels)) item.pixels = [];
    return d.groups;
  }
  function groupById(id, d = design()) {
    const definitions = groupDefinitions();
    return definitions && definitions.items.find(item => item.id === id);
  }
  function groupPixels(id, d = design(), create = false) {
    const groups = groupData(d, create);
    if (!groups) return [];
    let membership = groups.items.find(item => item.id === id);
    if (!membership && create) {
      membership = { id, pixels: [] };
      groups.items.push(membership);
    }
    return membership ? membership.pixels : [];
  }
  function rebuildAllGroupPalettes() {
    const t = tex();
    if (!t) return;
    for (const d of Object.values(t.designs)) if (groupData(d)) rebuildGroupPalette(d);
  }
  const swatchChar = () => {
    const d = design();
    if (!d || state.swatch < 0 || state.swatch >= d.palette.length) return '.';
    return TEX.ALPHABET[state.swatch];
  };

  function sync() {
    if (!Object.keys(state.families).length) return;
    TEX.define(state.families);
    if (state.family && state.sprite) TEX.refresh(state.family, state.sprite);
  }
  function validateAll() {
    try { return TEX.validate(state.families); }
    catch (e) { return [e.message]; }
  }
  function ensureSprite(t) {
    if (!t) return;
    t.params = t.params || {};
    t.designs = t.designs || {};
    t.size = t.size || [9, 9];
    t.marks = t.marks || {};
    if (!Object.keys(t.designs).length) {
      t.designs.base = { palette: ['transparent'], rows: Array.from({ length: t.size[1] }, () => '.'.repeat(t.size[0])) };
    }
    if (!t.default || !t.designs[t.default]) t.default = Object.keys(t.designs)[0];
    t.conditions = t.conditions || [];
  }
  function blankTexture(w = 9, hgt = 9) {
    return {
      size: [w, hgt],
      params: {},
      default: 'base',
      designs: { base: { palette: ['transparent'], rows: Array.from({ length: hgt }, () => '.'.repeat(w)) } },
      conditions: [],
      marks: {},
    };
  }
  function blankFamily(name) {
    return { format: TEX.FORMAT, name, tile: 9, defs: {}, textures: Object.create(null) };
  }

  // -------------------------------------------------------------------
  // Validation display
  // -------------------------------------------------------------------
  function renderErrors() {
    const box = $('errors');
    const errs = [...new Set(validateAll())].slice(0, 10);
    box.replaceChildren(...errs.map(e => h('div', { class: 'err' }, e)));
  }
  function scheduleValidate() {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(renderErrors, 140);
  }

  // -------------------------------------------------------------------
  // Canvas
  // -------------------------------------------------------------------
  function renderCanvas() {
    const cv = $('canvas');
    const t = tex(), d = design();
    if (!t || !d) {
      cv.width = 72; cv.height = 72;
      cv.getContext('2d').clearRect(0, 0, 72, 72);
      return;
    }
    const [w, hgt] = t.size;
    const z = state.zoom;
    cv.width = w * z;
    cv.height = hgt * z;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);

    // Checkerboard in screen space so transparent pixels read clearly.
    for (let y = 0; y < cv.height; y += 8) {
      for (let x = 0; x < cv.width; x += 8) {
        g.fillStyle = (((x + y) >> 3) & 1) ? '#1b2233' : '#151a27';
        g.fillRect(x, y, 8, 8);
      }
    }

    let picked = null;
    try {
      sync();
      const r = TEX.renderDesign(state.family, state.sprite, state.design, testParams());
      g.drawImage(r.canvas, 0, 0, cv.width, cv.height);
      picked = TEX.pickDesign(state.family, state.sprite, testParams());
    } catch (e) {
      status('Preview failed: ' + e.message, 'bad');
    }

    if (state.grid && z >= 4) {
      g.strokeStyle = 'rgba(255,255,255,.09)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= w; x++) { g.moveTo(x * z + .5, 0); g.lineTo(x * z + .5, cv.height); }
      for (let y = 0; y <= hgt; y++) { g.moveTo(0, y * z + .5); g.lineTo(cv.width, y * z + .5); }
      g.stroke();
    }

    if (state.showMarks) drawMarks(g, t, z);
    drawGroups(g, d, z);
    updatePickedDesign(picked);
    renderStageTitle(picked);
    renderPreview();
  }

  // The editing canvas always shows the selected design so pixels stay in
  // place. This preview shows what the game would actually draw: the design
  // chosen by the rules, with conditional swatches resolved for test params.
  function renderPreview() {
    const cv = $('previewCanvas'), t = tex();
    if (!cv) return;
    if (!t) {
      cv.width = 1; cv.height = 1;
      $('previewPick').textContent = '';
      return;
    }
    const [w, hgt] = t.size;
    const z = Math.max(2, Math.min(10, Math.floor(110 / Math.max(w, hgt))));
    cv.width = w * z;
    cv.height = hgt * z;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    try {
      sync();
      const r = TEX.render(state.family, state.sprite, testParams());
      g.drawImage(r.canvas, 0, 0, cv.width, cv.height);
      const picked = TEX.pickDesign(state.family, state.sprite, testParams());
      $('previewPick').textContent = '→ ' + picked +
        (picked !== state.design ? ' · editing ' + state.design : '');
      const params = testParams();
      const shown = Object.keys(params).filter(k => typeof params[k] !== 'function');
      cv.title = shown.length ? shown.map(k => k + '=' + params[k]).join(' ') : 'default parameters';
    } catch (e) {
      $('previewPick').textContent = 'preview failed';
      status('Preview failed: ' + e.message, 'bad');
    }
  }

  function drawMarks(g, t, z) {
    const mark = (x, y, color) => {
      g.strokeStyle = color;
      g.lineWidth = 1;
      g.strokeRect(x * z + .5, y * z + .5, Math.max(1, z - 1), Math.max(1, z - 1));
    };
    const m = t.marks || {};
    for (const p of m.win || []) mark(p[0], p[1], 'rgba(255,215,94,.8)');
    for (const p of m.park || []) mark(p[0], p[1], 'rgba(111,179,255,.85)');
    for (const p of m.spots || []) mark(p[0], p[1], 'rgba(95,220,122,.85)');
    if (m.stat) mark(m.stat[0], m.stat[1], 'rgba(255,107,107,.95)');
    if (m.berth) mark(m.berth[0], m.berth[1], 'rgba(219,201,159,.95)');
  }
  function drawGroups(g, d, z) {
    const groups = groupData(d);
    if (!groups) return;
    for (const item of groups.items) {
      const active = item.id === state.group && state.tool === 'group';
      g.strokeStyle = active ? '#ffd75e' : 'rgba(111,179,255,.9)';
      g.fillStyle = active ? 'rgba(255,215,94,.22)' : 'rgba(111,179,255,.14)';
      g.lineWidth = active ? 2 : 1;
      for (const [x, y] of item.pixels || []) {
        if (x < 0 || y < 0 || x >= d.rows[0]?.length || y >= d.rows.length) continue;
        g.fillRect(x * z, y * z, z, z);
        g.strokeRect(x * z + .5, y * z + .5, Math.max(1, z - 1), Math.max(1, z - 1));
      }
    }
  }

  function renderStageTitle(picked) {
    const t = tex();
    if (!t) { $('stageTitle').replaceChildren('—'); return; }
    const params = Object.entries(Object.assign({}, t.params || {}, testParams()))
      .map(([key, value]) => key + '=' + value).join(', ');
    const rules = (t.conditions || []).filter(rule => rule.design === picked).map(rule => rule.when);
    const bits = [
      h('span', null, state.family + '.texture › ' + state.sprite + '  '),
      h('b', null, state.design),
      h('span', null, '  ' + t.size[0] + '×' + t.size[1]),
    ];
    if (picked) {
      bits.push(h('span', { style: 'color:var(--acc)' },
        '  ·  preview: ' + picked +
        (picked !== state.design ? ' (editing ' + state.design + ')' : '') +
        (rules.length ? ' · rules: ' + rules.join(' | ') : ' · fallback')));
    }
    if (params) bits.push(h('span', { style: 'color:var(--dim)' }, '  ·  ' + params));
    $('stageTitle').replaceChildren(...bits);
  }
  function updatePickedDesign(picked) {
    for (const button of $('designStrip').querySelectorAll('.designThumb')) {
      const active = button.dataset.design === picked;
      button.classList.toggle('picked', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
      const tag = button.querySelector('.pickedTag');
      if (tag) tag.hidden = !active;
      const ruleText = button.dataset.rules || 'fallback design';
      button.title = button.dataset.design + ' · ' + ruleText +
        (active ? ' · selected by current preview parameters' : '') +
        ' — double-click to rename';
    }
  }

  // -------------------------------------------------------------------
  // Pixel editing
  // -------------------------------------------------------------------
  function putPixel(x, y, ch) {
    const d = design(), t = tex();
    if (!d || !t || x < 0 || y < 0 || x >= t.size[0] || y >= t.size[1]) return;
    const groups = groupData(d);
    if (groups) {
      for (const item of groups.items) {
        const pixel = item.pixels.find(point => point[0] === x && point[1] === y);
        if (pixel) { pixel[2] = ch; break; }
      }
    }
    const row = (d.rows[y] || '').padEnd(t.size[0], '.');
    if (row[x] === ch) return;
    d.rows[y] = row.slice(0, x) + ch + row.slice(x + 1);
  }
  function fillPixels(x, y) {
    const d = design(), t = tex();
    if (!d || !t) return;
    const target = rowChar(x, y);
    const ch = swatchChar();
    if (target === ch) return;
    const [w, hgt] = t.size;
    const stack = [[x, y]];
    const seen = new Uint8Array(w * hgt);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= w || cy >= hgt) continue;
      const p = cy * w + cx;
      if (seen[p] || rowChar(cx, cy) !== target) continue;
      seen[p] = 1;
      putPixel(cx, cy, ch);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  function toggleGroupPixel(x, y) {
    const d = design(), t = tex(), groups = groupData(d);
    const selected = groupById(state.group, d);
    if (!d || !t || !groups || !selected) {
      status('Create or select a pixel group first.', 'bad');
      return;
    }
    if (x < 0 || y < 0 || x >= t.size[0] || y >= t.size[1]) return;
    const before = clone(groups.items);
    const selectedId = selected.id;
    pushUndo();
    let base = rowChar(x, y);
    let owner = null;
    for (const item of groups.items) {
      const at = item.pixels.findIndex(pixel => pixel[0] === x && pixel[1] === y);
      if (at >= 0) {
        owner = item.id;
        base = item.pixels[at][2] || '.';
        const row = d.rows[y];
        d.rows[y] = row.slice(0, x) + base + row.slice(x + 1);
        item.pixels.splice(at, 1);
        break;
      }
    }
    if (owner !== selectedId) groupPixels(selectedId, d, true).push([x, y, base]);
    if (!rebuildGroupPalette(d)) {
      groups.items = before;
      rebuildGroupPalette(d);
      const stack = state.undo.get(undoKey()) || [];
      stack.pop();
      status('Cannot add this pixel: the group palette is full.', 'bad');
      return;
    }
    renderGroupPanel();
    renderPalette();
    renderCanvas();
    updateThumb();
    scheduleValidate();
  }
  function paintLine(x0, y0, x1, y1, ch) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      putPixel(x0, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function paintRect(x0, y0, x1, y1, ch) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    for (let x = ax; x <= bx; x++) { putPixel(x, ay, ch); putPixel(x, by, ch); }
    for (let y = ay; y <= by; y++) { putPixel(ax, y, ch); putPixel(bx, y, ch); }
  }

  function undoKey() { return testKey() + '/' + state.design; }
  function captureSnapshot(allDesigns = false) {
    const t = tex(), d = design();
    if (!t || !d) return null;
    return {
      design: clone(d),
      designs: allDesigns ? clone(t.designs) : null,
      groups: clone(t.groups),
    };
  }
  function pushUndo(allDesigns = false) {
    const d = design();
    if (!d) return;
    const k = undoKey();
    const stack = state.undo.get(k) || [];
    stack.push(captureSnapshot(allDesigns));
    if (stack.length > 40) stack.shift();
    state.undo.set(k, stack);
    state.redo.delete(k);
  }
  function restore(snapshot) {
    const t = tex();
    if (!t || !state.design) return;
    if (snapshot && snapshot.design) {
      if (snapshot.designs) t.designs = snapshot.designs;
      else t.designs[state.design] = snapshot.design;
      if (snapshot.groups) t.groups = snapshot.groups;
      else delete t.groups;
      rebuildAllGroupPalettes();
    } else t.designs[state.design] = snapshot;
    renderAll();
  }
  function undo() {
    const k = undoKey();
    const stack = state.undo.get(k) || [];
    if (!stack.length) return;
    const snapshot = stack.pop();
    const current = captureSnapshot(!!snapshot.designs);
    const redo = state.redo.get(k) || [];
    redo.push(current);
    state.redo.set(k, redo);
    restore(snapshot);
    status('Undid the last edit.', '');
  }
  function redo() {
    const k = undoKey();
    const stack = state.redo.get(k) || [];
    if (!stack.length) return;
    const snapshot = stack.pop();
    const current = captureSnapshot(!!snapshot.designs);
    const back = state.undo.get(k) || [];
    back.push(current);
    state.undo.set(k, back);
    restore(snapshot);
    status('Redid the edit.', '');
  }

  function canvasCell(e) {
    const cv = $('canvas'), r = cv.getBoundingClientRect();
    const t = tex();
    if (!t) return { x: 0, y: 0 };
    return {
      x: Math.floor((e.clientX - r.left) / r.width * t.size[0]),
      y: Math.floor((e.clientY - r.top) / r.height * t.size[1]),
    };
  }

  function toggleMark(x, y) {
    const t = tex();
    if (!t) return;
    const type = state.markType;
    t.marks = t.marks || {};
    if (type === 'stat' || type === 'berth') {
      const cur = t.marks[type];
      t.marks[type] = cur && cur[0] === x && cur[1] === y ? null : [x, y];
    } else {
      const list = t.marks[type] = t.marks[type] || [];
      const i = list.findIndex(p => p[0] === x && p[1] === y);
      if (i >= 0) list.splice(i, 1);
      else list.push(type === 'park' ? [x, y, 0] : [x, y]);
    }
    renderMarks();
    renderCanvas();
    scheduleValidate();
  }

  // -------------------------------------------------------------------
  // Library + header
  // -------------------------------------------------------------------
  function renderFamilySelect() {
    $('familySelect').replaceChildren(...Object.keys(state.families).sort().map(f =>
      h('option', { value: f, selected: f === state.family }, f)));
  }
  function renderLibrary() {
    const list = $('textureList');
    list.replaceChildren();
    const d = doc();
    $('spriteCount').textContent = d ? plural(Object.keys(d.textures).length, 'sprite', 'sprites') : '';
    if (!d) { list.append(h('small', null, 'No families yet.')); return; }
    for (const name of Object.keys(d.textures)) {
      const t = d.textures[name];
      ensureSprite(t);
      const meta = t.size[0] + '×' + t.size[1] + ' · ' + Object.keys(t.designs).length + 'd';
      list.append(h('div', { class: 'item' },
        h('button', { class: name === state.sprite ? 'on' : '', onclick: () => selectSprite(name) },
          h('span', null, name), h('span', { class: 'meta' }, meta)),
        h('button', { class: 'kill', title: 'Delete ' + name, onclick: e => { e.stopPropagation(); deleteSprite(name); } }, '✕')
      ));
    }
    if (!Object.keys(d.textures).length) list.append(h('small', null, 'No sprites yet. Add one below.'));
  }

  // -------------------------------------------------------------------
  // Design strip
  // -------------------------------------------------------------------
  function renderDesignStrip() {
    const strip = $('designStrip'), t = tex();
    strip.replaceChildren();
    if (!t) { $('designCount').textContent = ''; return; }
    $('designCount').textContent = plural(Object.keys(t.designs).length, 'design', 'designs');
    sync();
    let picked = null;
    try { picked = TEX.pickDesign(state.family, state.sprite, testParams()); }
    catch (e) { /* surfaced by the main preview */ }
    for (const name of Object.keys(t.designs)) {
      const d = t.designs[name];
      const cv = h('canvas');
      cv.width = t.size[0] * 3;
      cv.height = t.size[1] * 3;
      try {
        const r = TEX.renderDesign(state.family, state.sprite, name, testParams());
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(r.canvas, 0, 0, cv.width, cv.height);
      } catch (e) { /* errors are shown in the errors panel */ }
      const rules = (t.conditions || []).filter(c => c.design === name).map(c => c.when);
      const btn = h('button', {
        class: 'designThumb' + (name === state.design ? ' on' : '') + (name === picked ? ' picked' : ''),
        'aria-current': name === picked ? 'true' : 'false',
        'aria-label': name + (name === state.design ? ' · editing' : '') + (name === picked ? ' · preview selected' : ''),
        onclick: () => selectDesign(name),
        ondblclick: () => renameDesign(name),
      }, cv, h('span', null, name), h('small', { class: 'pickedTag', hidden: name !== picked }, 'preview'));
      btn.dataset.design = name;
      btn.dataset.rules = rules.length ? rules.join(' or ') : 'fallback design';
      strip.append(btn);
    }
  }

  function updateThumb() {
    const t = tex();
    if (!t || !state.design) return;
    if (groupData()) rebuildGroupPalette();
    const btn = [...$('designStrip').querySelectorAll('button')].find(b => b.dataset.design === state.design);
    if (!btn) return;
    const cv = btn.querySelector('canvas');
    if (!cv) return;
    sync();
    try {
      const r = TEX.renderDesign(state.family, state.sprite, state.design, testParams());
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(r.canvas, 0, 0, cv.width, cv.height);
    } catch (e) { /* shown elsewhere */ }
  }

  // -------------------------------------------------------------------
  // Palette
  // -------------------------------------------------------------------
  // The toolbar colour is stored in the design palette so normal paint tools
  // can keep writing the texture format's compact palette characters.
  function updatePaintColor() {
    const inp = $('paintColor'), hex = $('paintHex'), preview = $('paintPreview'), d = design();
    if (!inp || !d) return;
    let c = null;
    try { c = TEX.swatchColor(state.family, state.sprite, state.design, state.swatch, testParams()); }
    catch (e) { c = null; }
    const value = toHexColor(c || '#ffffff');
    inp.value = value;
    if (hex) hex.value = value;
    if (preview) preview.style.background = c || 'transparent';
  }
  function applyPaintColor(hex) {
    const d = design();
    if (!d) return;
    const want = TEX.parseColor(hex);
    const same = c => { const p = TEX.parseColor(c); return p[3] === 255 && p[0] === want[0] && p[1] === want[1] && p[2] === want[2]; };
    const groups = groupData(d);
    const baseLength = groups ? groups.paletteStart : d.palette.length;
    let idx = d.palette.slice(0, baseLength).findIndex(entry => typeof entry === 'string' && String(entry).toLowerCase() !== 'transparent' && same(entry));
    if (idx < 0) {
      if (baseLength >= TEX.ALPHABET.length) {
        status('Cannot add this paint colour: the palette is full.', 'bad');
        return;
      }
      d.palette.splice(baseLength, 0, hex);
      if (groups) {
        groups.paletteStart++;
        if (!rebuildGroupPalette(d)) {
          d.palette.splice(baseLength, 1);
          groups.paletteStart--;
          status('Cannot add this paint colour: the group palette is full.', 'bad');
          return;
        }
      }
      idx = baseLength;
    }
    state.swatch = idx;
    renderPalette();
    renderSwatchEditor();
    if (groupData(d)) rebuildGroupPalette(d);
    renderCanvas();
    updateThumb();
    scheduleValidate();
    status('Painting with ' + hex + ' (swatch ' + idx + ').', '');
  }

  function renderPalette() {
    const d = design();
    if (!d) return;
    const groups = groupData(d);
    const baseLength = groups ? groups.paletteStart : d.palette.length;
    if (state.swatch >= baseLength) state.swatch = Math.max(0, baseLength - 1);
    sync();
    updatePaintColor();
  }

  function rebuildGroupPalette(d = design()) {
    const groups = groupData(d, true);
    if (!groups) return false;
    const definitions = groupDefinitions();
    const start = clamp(groups.paletteStart, 0, d.palette.length);
    groups.paletteStart = start;
    const required = groups.items.reduce((sum, item) => {
      const bases = new Set((item.pixels || []).map(pixel => pixel[2] || '.'));
      return sum + bases.size;
    }, 0);
    if (start + required > TEX.ALPHABET.length) return false;

    for (const item of groups.items) {
      for (const [x, y, base] of item.pixels || []) {
        if (y < 0 || y >= d.rows.length || x < 0 || x >= d.rows[y].length) continue;
        const row = d.rows[y];
        d.rows[y] = row.slice(0, x) + (base || '.') + row.slice(x + 1);
      }
    }
    d.palette.splice(start);
    for (const membership of groups.items) {
      const item = definitions.items.find(group => group.id === membership.id);
      if (!item) continue;
      const swatches = new Map();
      for (const [x, y, baseValue] of membership.pixels || []) {
        const base = baseValue || '.';
        let index = swatches.get(base);
        if (index === undefined) {
          index = d.palette.length;
          swatches.set(base, index);
          const source = TEX.ALPHABET.indexOf(base);
          const entry = source >= 0 && source < start ? d.palette[source] : null;
          let baseLayers;
          if (typeof entry === 'string') baseLayers = [{ color: entry }];
          else if (entry && Array.isArray(entry.layers)) baseLayers = clone(entry.layers);
          else if (entry && typeof entry === 'object') {
            baseLayers = [{ color: entry.else === undefined ? 'transparent' : clone(entry.else) }];
            if (entry.color !== undefined) baseLayers.push({ color: clone(entry.color), when: entry.when || 'true' });
          } else baseLayers = [{ color: 'transparent' }];
          d.palette.push({
            layers: baseLayers.concat({ color: item.color || '#ffffff', when: item.when || 'true' }),
          });
        }
        if (y < 0 || y >= d.rows.length || x < 0 || x >= d.rows[y].length) continue;
        const row = d.rows[y];
        d.rows[y] = row.slice(0, x) + TEX.ALPHABET[index] + row.slice(x + 1);
      }
    }
    return true;
  }

  function renderGroupPanel() {
    const box = $('groupPanel'), d = design();
    box.replaceChildren();
    if (!d) return;
    const groups = groupDefinitions() || { items: [] };
    groupData(d);
    const selected = groupById(state.group);
    if (!selected && state.group !== null) state.group = null;
    const list = h('div', { class: 'groupList' },
      ...groups.items.map(item => h('div', { class: 'row' },
        h('button', {
          class: 'groupBtn' + (selected === item ? ' on' : ''),
          'aria-pressed': selected === item,
          onclick: () => {
            state.group = item.id;
            state.tool = 'group';
            renderGroupPanel();
            updateMarkControls();
            renderCanvas();
          },
        }, item.name, h('small', null, groupPixels(item.id, d).length + ' px')),
        h('button', {
          class: 'danger', title: 'Delete ' + item.name, 'aria-label': 'Delete ' + item.name,
          onclick: () => {
            pushUndo(true);
            for (const designData of Object.values(tex().designs)) {
              const groupPixelsHere = groupPixels(item.id, designData);
              for (const [x, y, base] of groupPixelsHere) {
                if (y < 0 || y >= designData.rows.length || x < 0 || x >= designData.rows[y].length) continue;
                const row = designData.rows[y];
                designData.rows[y] = row.slice(0, x) + (base || '.') + row.slice(x + 1);
              }
              const data = groupData(designData);
              if (data) {
                data.items = data.items.filter(group => group.id !== item.id);
                rebuildGroupPalette(designData);
              }
            }
            groups.items = groups.items.filter(group => group.id !== item.id);
            if (state.group === item.id) state.group = groups.items.length ? groups.items[0].id : null;
            renderGroupPanel(); renderPalette(); renderCanvas(); updateThumb(); scheduleValidate();
          },
        }, '×')
      ))
    );
    const head = h('div', { class: 'groupHead' },
      h('b', null, 'Pixel groups'),
      h('small', null, groups.items.length ? 'Groups are shared across designs; each design has its own pixels.' : 'Mark pixels to edit them together.'),
      h('span', { class: 'spacer' }),
      h('button', {
        id: 'addGroup', title: 'Create a new pixel group', 'aria-label': 'Create a new pixel group',
        onclick: () => {
          pushUndo(true);
          const actual = groupDefinitions(tex(), true);
          const n = actual.items.length + 1;
          let name = 'Group ' + n, suffix = n;
          while (actual.items.some(group => group.name === name)) name = 'Group ' + (++suffix);
          const id = actual.items.reduce((max, group) => Math.max(max, Number(group.id) || 0), 0) + 1;
          actual.items.push({ id, name, when: 'true', color: $('paintColor').value || '#ffffff' });
          state.group = id;
          state.tool = 'group';
          renderGroupPanel(); updateMarkControls(); renderCanvas();
        },
      }, '+ Group')
    );
    box.append(head, list);
    if (!selected) {
      box.append(h('div', { class: 'help' }, groups.items.length ? 'Choose a group to edit its condition and pixels for this design.' : 'Create a group to start marking pixels.'));
      return;
    }
    const name = h('input', { type: 'text', value: selected.name, 'aria-label': 'Group name' });
    name.addEventListener('change', () => {
      pushUndo(true);
      selected.name = name.value.trim() || selected.name;
      renderGroupPanel();
    });
    const when = h('input', { type: 'text', value: selected.when || 'true', placeholder: 'e.g. night or m = 2', spellcheck: 'false', 'aria-label': 'Show group color when' });
    const validateWhen = () => {
      const err = TEX.conditionError(when.value.trim() || 'true', paramNames());
      when.classList.toggle('invalid', !!err);
      when.title = err || 'Texture condition';
      return err;
    };
    validateWhen();
    when.addEventListener('change', () => {
      pushUndo(true);
      selected.when = when.value.trim() || 'true';
      validateWhen();
      rebuildAllGroupPalettes();
      renderCanvas(); renderDesignStrip(); updateThumb(); scheduleValidate();
    });
    const color = h('input', { type: 'color', value: toHexColor(selected.color || '#ffffff'), 'aria-label': 'Group color' });
    color.addEventListener('change', () => {
      pushUndo(true);
      selected.color = color.value;
      rebuildAllGroupPalettes();
      renderCanvas(); renderDesignStrip(); updateThumb(); scheduleValidate();
    });
    box.append(h('div', { class: 'groupEdit' },
      h('div', { class: 'groupField' }, h('label', null, 'Name'), name),
      h('div', { class: 'groupField' }, h('label', null, 'Condition'), when, color),
      h('div', { class: 'help' }, plural(groupPixels(selected.id, d).length, 'pixel', 'pixels') + ' in this design'),
      h('div', { class: 'help' }, 'Group pixels use this color when the condition matches; otherwise their original colors show.')
    ));
  }

  function valueLabel(v) {
    if (typeof v === 'string') return 'solid colour';
    if (Array.isArray(v)) {
      const head = v[0];
      return ({
        param: 'from parameter', def: 'from family def', pick: 'random pick from a list',
        shade: 'shade of another swatch', mix: 'mix of two colours', slot: 'earlier swatch',
        choose: 'conditional colour', rnd: 'random colour',
      })[head] || 'computed colour';
    }
    return 'computed colour';
  }

  function renderSwatchEditor() {
    const box = $('swatchEditor'), d = design();
    if (!box) return;
    box.replaceChildren();
    if (!d || !d.palette.length) { $('swatchIndex').textContent = ''; return; }
    if (state.swatch >= d.palette.length) state.swatch = Math.max(0, d.palette.length - 1);
    const i = state.swatch;
    const raw = d.palette[i];
    $('swatchIndex').textContent = '#' + i + ' · ' + TEX.ALPHABET[i];

    let color = null;
    try { color = TEX.swatchColor(state.family, state.sprite, state.design, i, testParams()); }
    catch (e) { color = null; }

    const big = h('div', { class: 'big' }, h('i', null));
    if (color) big.firstElementChild.style.background = color;
    const plain = typeof raw === 'string';
    const simple = !plain && raw && typeof raw === 'object' && !Array.isArray(raw.layers) && typeof raw.color === 'string';
    const info = h('div', null,
      h('b', null, plain ? 'Solid colour' : valueLabel(raw && raw.color !== undefined ? raw.color : raw)),
      plain || simple ? null : h('span', { class: 'badge' }, 'dynamic'),
      !plain && raw && raw.when ? h('span', { class: 'badge cond' }, 'conditional') : null,
      h('div', { class: 'help' }, plain || simple
        ? 'This swatch paints one colour; it may switch on a condition.'
        : 'Driven by ' + valueLabel(raw && raw.color !== undefined ? raw.color : raw) + '. You can make it solid and paint it directly.')
    );
    box.append(h('div', { class: 'swatchInfo' }, big, info));

    if (plain || simple) {
      const current = plain ? raw : raw.color;
      const hex = h('input', { type: 'color', value: toHexColor(current) });
      const text = h('input', { type: 'text', value: current, spellcheck: 'false' });
      const commit = (v) => {
        const d2 = design();
        if (!d2) return;
        if (typeof d2.palette[i] === 'string') d2.palette[i] = v;
        else d2.palette[i].color = v;
        renderCanvas(); renderPalette(); renderDesignStrip(); scheduleValidate();
      };
      hex.addEventListener('input', () => { text.value = hex.value; commit(hex.value); });
      text.addEventListener('change', () => { hex.value = toHexColor(text.value); commit(text.value); });
      box.append(h('div', { class: 'field' }, h('label', null, 'colour'), h('div', { class: 'row' }, hex, text)));

      if (plain) {
        box.append(h('div', { class: 'row', style: 'margin-top:4px' },
          h('button', {
            onclick: () => {
              const d2 = design();
              d2.palette[i] = { color: d2.palette[i], when: 'x = 0', else: 'transparent' };
              renderSwatchEditor(); renderPalette(); renderCanvas(); scheduleValidate();
            }
          }, 'Add condition'),
          h('button', { onclick: () => { d2safe(i, 'transparent'); } }, 'Make transparent')
        ));
      } else {
        const when = h('input', { type: 'text', value: raw.when || '', placeholder: 'e.g. x % 6 < 3', spellcheck: 'false' });
        const elseInp = h('input', { type: 'text', value: raw.else || 'transparent', spellcheck: 'false' });
        const validateWhen = () => {
          const err = when.value.trim() ? TEX.conditionError(when.value, paramNames()) : null;
          when.classList.toggle('invalid', !!err);
          when.title = err || '';
        };
        validateWhen();
        when.addEventListener('input', () => {
          validateWhen();
          const d2 = design();
          if (!d2 || !d2.palette[i] || typeof d2.palette[i] !== 'object') return;
          d2.palette[i].when = when.value.trim() || undefined;
          renderCanvas(); renderPalette(); updateThumb(); scheduleValidate();
        });
        elseInp.addEventListener('change', () => {
          const d2 = design();
          if (!d2 || !d2.palette[i] || typeof d2.palette[i] !== 'object') return;
          d2.palette[i].else = elseInp.value.trim() || 'transparent';
          renderCanvas(); renderPalette(); updateThumb(); scheduleValidate();
        });
        box.append(h('div', { class: 'field' }, h('label', null, 'paints when'), when));
        box.append(h('div', { class: 'field' }, h('label', null, 'otherwise'), elseInp));
        const err = when.value.trim() ? TEX.conditionError(when.value, paramNames()) : null;
        if (err) box.append(h('div', { class: 'err' }, err));
        box.append(h('div', { class: 'row', style: 'margin-top:4px' },
          h('button', {
            onclick: () => {
              const d2 = design();
              d2.palette[i] = typeof d2.palette[i].color === 'string' ? d2.palette[i].color : 'transparent';
              renderSwatchEditor(); renderPalette(); renderCanvas(); scheduleValidate();
            }
          }, 'Remove condition'),
          h('button', { onclick: () => { d2safe(i, 'transparent'); } }, 'Make transparent')
        ));
      }
    } else {
      if (raw && Array.isArray(raw.layers)) {
        box.append(h('div', { class: 'help' }, 'Layered swatch: ' + plural(raw.layers.length, 'layer', 'layers') +
          '. Each layer has its own condition. ' + (raw.layers.map(l => l.when || 'always').join(' · '))));
      } else {
        box.append(h('div', { class: 'help' }, 'This swatch is calculated from parameters or the seed, so it has no single editable colour.'));
      }
      const useColor = h('input', { type: 'color', value: toHexColor(color || '#ffffff') });
      box.append(h('div', { class: 'field' }, h('label', null, 'use colour'),
        h('div', { class: 'row' }, useColor,
          h('button', {
            onclick: () => {
              d2safe(i, useColor.value);
              status('Swatch ' + i + ' is now solid ' + useColor.value + '; parameters no longer tint it.', 'good');
            }
          }, 'Make swatch'))));
      box.append(h('button', {
        onclick: () => {
          let c = null;
          try { c = TEX.swatchColor(state.family, state.sprite, state.design, i, testParams()); } catch (e) { c = null; }
          d2safe(i, c || 'transparent');
          status('Swatch ' + i + ' is now a solid colour; parameters no longer tint it.', 'good');
        }
      }, 'Keep current colour'));
    }
  }
  function d2safe(i, value) {
    const d = design();
    if (!d) return;
    d.palette[i] = value;
    renderSwatchEditor(); renderPalette(); renderCanvas(); renderDesignStrip(); scheduleValidate();
  }

  // -------------------------------------------------------------------
  // Sprite panel
  // -------------------------------------------------------------------
  function renderSpritePanel() {
    const box = $('spritePanel'), t = tex();
    box.replaceChildren();
    if (!t) { box.append(h('p', { class: 'help' }, 'Select a sprite.')); return; }

    const nameIn = h('input', { type: 'text', value: state.sprite, spellcheck: 'false' });
    nameIn.addEventListener('change', () => renameSprite(nameIn.value));

    const wIn = h('input', { type: 'number', min: '1', max: '256', value: t.size[0] });
    const hIn = h('input', { type: 'number', min: '1', max: '256', value: t.size[1] });
    const applySize = () => {
      const w = clamp(Math.round(Number(wIn.value) || t.size[0]), 1, 256);
      const hgt = clamp(Math.round(Number(hIn.value) || t.size[1]), 1, 256);
      resizeSprite(w, hgt);
    };

    const defSel = h('select', {
      onchange: e => { t.default = e.target.value; renderConditions(); renderCanvas(); scheduleValidate(); }
    });
    for (const n of designNames()) defSel.append(h('option', { value: n, selected: n === t.default }, n));

    const paramRows = Object.keys(t.params).map(k => {
      const control = h('input', {
        type: 'text', value: JSON.stringify(t.params[k]), spellcheck: 'false',
        onchange: e => {
          const v = e.target.value.trim();
          let parsed;
          try { parsed = JSON.parse(v); } catch (err) { parsed = v; }
          t.params[k] = parsed;
          renderTestParams(); renderCanvas(); scheduleValidate();
        }
      });
      return h('div', { class: 'paramRow' },
        h('span', { class: 'name', title: k }, k),
        control,
        h('span', { class: 'help' }, ''),
        h('button', { class: 'danger', title: 'Remove param', onclick: () => { delete t.params[k]; renderSpritePanel(); renderTestParams(); renderConditions(); renderCanvas(); scheduleValidate(); } }, '✕')
      );
    });

    const newName = h('input', { type: 'text', placeholder: 'param', spellcheck: 'false', style: 'width:82px' });
    const newValue = h('input', { type: 'text', placeholder: '0', spellcheck: 'false', style: 'width:82px' });
    const addParam = () => {
      const name = newName.value.trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) { status('Parameter names are letters, digits and _ (not starting with a digit).', 'bad'); return; }
      if (name in t.params) { status('Parameter "' + name + '" already exists.', 'bad'); return; }
      let v = newValue.value.trim();
      try { v = JSON.parse(v); } catch (e) { /* keep text */ }
      if (v === '' || v === undefined) v = 0;
      t.params[name] = v;
      renderSpritePanel(); renderTestParams(); renderConditions(); renderCanvas(); scheduleValidate();
    };

    box.append(
      h('div', { class: 'field' }, h('label', null, 'name'), nameIn),
      h('div', { class: 'field' }, h('label', null, 'size'),
        h('div', { class: 'row' }, wIn, h('span', null, '×'), hIn, h('button', { onclick: applySize }, 'Apply'))),
      h('div', { class: 'field' }, h('label', null, 'fallback'), defSel),
      h('details', { class: 'subfold' },
        h('summary', null, 'Parameters (' + Object.keys(t.params).length + ')'),
        h('div', { class: 'paramHead' }, h('span', null, 'name'), h('span', null, 'default'), h('span', null, ''), h('span', null, '')),
        ...paramRows,
        h('div', { class: 'row', style: 'margin-top:4px' }, newName, newValue, h('button', { onclick: addParam }, '+ Param'))
      ),
      h('div', { class: 'help' }, state.sprite + ' has ' + plural(designNames().length, 'design', 'designs') + ', ' +
        plural((t.conditions || []).length, 'rule', 'rules') + ' and ' + plural(Object.keys(t.params).length, 'parameter', 'parameters') + '.')
    );
  }

  // -------------------------------------------------------------------
  // Preview parameters
  // -------------------------------------------------------------------
  function testChanged(live) {
    renderCanvas();
    renderPalette();
    renderSwatchEditor();
    if (!live) renderDesignStrip();
  }

  function renderTestParams() {
    const box = $('testParams'), t = tex();
    box.replaceChildren();
    if (!t) return;
    const keys = paramNames();
    if (!keys.length) { box.append(h('small', { class: 'help' }, 'No parameters.')); return; }
    const values = state.test[testKey()] = state.test[testKey()] || {};
    for (const k of keys) {
      const def = t.params[k];
      const current = values[k] !== undefined ? values[k] : def;
      let inp;
      if (typeof def === 'boolean') {
        inp = h('input', { type: 'checkbox', checked: !!current });
        inp.addEventListener('change', () => {
          values[k] = inp.checked;
          testChanged(false);
        });
      } else if (typeof def === 'number') {
        inp = h('input', { type: 'number', step: 'any', value: String(current), title: 'default ' + def });
        inp.addEventListener('input', () => {
          const n = Number(inp.value);
          if (inp.value.trim() === '' || !Number.isFinite(n)) return;
          values[k] = n;
          testChanged(true);
        });
        inp.addEventListener('change', () => testChanged(false));
      } else {
        inp = h('input', { type: 'text', spellcheck: 'false', value: current == null ? '' : String(current), placeholder: String(def), title: 'default ' + String(def) });
        inp.addEventListener('input', () => {
          const txt = inp.value;
          if (txt === '' || txt === String(def)) delete values[k];
          else values[k] = txt;
          testChanged(true);
        });
        inp.addEventListener('change', () => testChanged(false));
      }
      box.append(h('label', { class: 'testParam', title: k + ' — default ' + String(def) }, h('span', null, k), inp));
    }
  }

  // -------------------------------------------------------------------
  // Conditions
  // -------------------------------------------------------------------
  function renderConditions() {
    const t = tex(), box = $('conditionRows'), names = designNames();
    box.replaceChildren();
    $('conditionCount').textContent = t ? plural((t.conditions || []).length, 'rule', 'rules') : '';
    if (!t) return;
    ensureSprite(t);
    const params = paramNames();
    (t.conditions || []).forEach((rule, i) => {
      const inp = h('input', { type: 'text', value: rule.when || '', spellcheck: 'false', placeholder: 'm = 5', 'data-when': '1' });
      const check = () => {
        const err = TEX.conditionError(inp.value, params);
        inp.classList.toggle('invalid', !!err);
        inp.title = err || '';
        return err;
      };
      check();
      inp.addEventListener('change', () => {
        rule.when = inp.value.trim();
        check();
        renderCanvas();
        scheduleValidate();
      });
      const sel = h('select', { onchange: e => { rule.design = e.target.value; renderCanvas(); scheduleValidate(); } });
      for (const n of names) sel.append(h('option', { value: n, selected: n === rule.design }, n));
      const acts = h('div', { class: 'acts' },
        h('button', { title: 'Move up', disabled: i === 0, onclick: () => moveCondition(i, -1) }, '↑'),
        h('button', { title: 'Move down', disabled: i === t.conditions.length - 1, onclick: () => moveCondition(i, 1) }, '↓'),
        h('button', { class: 'danger', title: 'Delete rule', onclick: () => { t.conditions.splice(i, 1); renderConditions(); renderCanvas(); scheduleValidate(); } }, '✕')
      );
      const row = h('div', { class: 'condRow' }, h('span', { class: 'n' }, i + 1), inp, sel, acts);
      row.dataset.rule = i;
      box.append(row);
    });
    if (!(t.conditions || []).length) box.append(h('small', null, 'No rules yet — every parameter set gets the fallback design.'));

    const fallback = $('conditionFallback');
    fallback.replaceChildren();
    const fsel = h('select', { onchange: e => { t.default = e.target.value; renderCanvas(); scheduleValidate(); } });
    for (const n of names) fsel.append(h('option', { value: n, selected: n === t.default }, n));
    fallback.append(h('div', { class: 'fallbackRow' },
      h('span', { class: 'label' }, 'otherwise →'), fsel, h('span'), h('span')));
    applyConditionFilter();
  }

  function moveCondition(i, delta) {
    const t = tex();
    if (!t) return;
    const j = i + delta;
    if (j < 0 || j >= t.conditions.length) return;
    const [rule] = t.conditions.splice(i, 1);
    t.conditions.splice(j, 0, rule);
    renderConditions();
    renderCanvas();
    scheduleValidate();
  }

  function applyConditionFilter() {
    const q = ($('conditionFilter').value || '').trim().toLowerCase();
    for (const row of $('conditionRows').querySelectorAll('.condRow')) {
      if (!q) { row.hidden = false; continue; }
      const when = (row.querySelector('input')?.value || '').toLowerCase();
      const target = (row.querySelector('select')?.value || '').toLowerCase();
      row.hidden = !when.includes(q) && !target.includes(q);
    }
  }

  // -------------------------------------------------------------------
  // Marks
  // -------------------------------------------------------------------
  function renderMarks() {
    const t = tex(), box = $('markSummary');
    box.replaceChildren();
    if (!t) return;
    const m = t.marks || {};
    const bits = [
      ['windows', (m.win || []).length],
      ['parking', (m.park || []).length],
      ['spots', (m.spots || []).length],
      ['status light', m.stat ? 'yes' : 'no'],
      ['berth', m.berth ? 'yes' : 'no'],
    ];
    box.append(h('div', { class: 'row', style: 'gap:10px' },
      ...bits.map(([k, v]) => h('span', { class: 'help' }, k + ' ', h('b', { style: 'color:var(--txt)' }, String(v))))));
  }

  // -------------------------------------------------------------------
  // Family panel
  // -------------------------------------------------------------------
  function renderFamilyPanel() {
    const box = $('familyPanel'), d = doc();
    box.replaceChildren();
    if (!d) return;
    const nameIn = h('input', { type: 'text', value: state.family, spellcheck: 'false' });
    nameIn.addEventListener('change', () => renameFamily(nameIn.value));
    const tileIn = h('input', { type: 'number', min: '1', max: '64', value: d.tile || 9 });
    tileIn.addEventListener('change', () => { d.tile = clamp(Math.round(Number(tileIn.value) || 9), 1, 64); renderCanvas(); scheduleValidate(); });
    box.append(
      h('div', { class: 'field' }, h('label', null, 'file name'), nameIn),
      h('div', { class: 'field' }, h('label', null, 'tile'), tileIn),
      h('div', { class: 'help' }, plural(Object.keys(d.textures).length, 'sprite', 'sprites') + ' · ' +
        plural(Object.keys(d.defs || {}).length, 'def', 'defs') + ' · format ' + (d.format || '?'))
    );
  }

  // -------------------------------------------------------------------
  // Render orchestration
  // -------------------------------------------------------------------
  function renderAll() {
    const d = doc();
    if (d) {
      ensureSprite(tex());
      if (!state.sprite || !d.textures[state.sprite]) state.sprite = Object.keys(d.textures)[0] || null;
      const t = tex();
      if (t) {
        if (!state.design || !t.designs[state.design]) state.design = t.default || Object.keys(t.designs)[0] || null;
      } else state.design = null;
    }
    renderFamilySelect();
    renderLibrary();
    renderDesignStrip();
    renderPalette();
    renderGroupPanel();
    renderCanvas();
    renderSpritePanel();
    renderTestParams();
    renderConditions();
    renderSwatchEditor();
    renderMarks();
    renderFamilyPanel();
    renderErrors();
    updateMarkControls();
  }

  function updateMarkControls() {
    $('markType').hidden = state.tool !== 'marker';
    for (const b of document.querySelectorAll('#tools button[data-tool]')) b.classList.toggle('on', b.dataset.tool === state.tool);
    $('markType').value = state.markType;
  }

  // -------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------
  function selectFamily(name) {
    if (!name || !state.families[name]) {
      state.family = state.sprite = state.design = null;
      renderAll();
      return;
    }
    state.family = name;
    state.group = null;
    const d = state.families[name];
    state.sprite = Object.keys(d.textures)[0] || null;
    const t = tex();
    if (t) ensureSprite(t);
    state.design = t ? (t.default || Object.keys(t.designs)[0]) : null;
    state.swatch = 1;
    state.undo.clear();
    state.redo.clear();
    renderAll();
  }
  function selectSprite(name) {
    const d = doc();
    if (!d || !d.textures[name]) return;
    state.sprite = name;
    state.group = null;
    const t = d.textures[name];
    ensureSprite(t);
    state.design = t.default || Object.keys(t.designs)[0];
    state.swatch = 1;
    renderAll();
  }
  function selectDesign(name) {
    const t = tex();
    if (!t || !t.designs[name]) return;
    state.design = name;
    if (state.swatch >= t.designs[name].palette.length) state.swatch = Math.max(0, t.designs[name].palette.length - 1);
    renderCanvas();
    renderDesignStrip();
    renderPalette();
    renderGroupPanel();
    renderSwatchEditor();
  }

  // -------------------------------------------------------------------
  // Sprite / design / family operations
  // -------------------------------------------------------------------
  function resizeSprite(w, hgt) {
    const t = tex();
    if (!t) return;
    state.undo.clear();
    state.redo.clear();
    for (const d of Object.values(t.designs)) {
      if (groupData(d)) rebuildGroupPalette(d);
      d.rows = Array.from({ length: hgt }, (_, y) => (d.rows[y] || '').padEnd(w, '.').slice(0, w));
      const groups = groupData(d);
      if (groups) {
        for (const item of groups.items) item.pixels = item.pixels.filter(([x, y]) => x < w && y < hgt);
        rebuildGroupPalette(d);
      }
    }
    t.size = [w, hgt];
    $('zoom').value = state.zoom = fitZoom(w, hgt);
    renderAll();
    status('Resized every design to ' + w + '×' + hgt + '.', 'good');
  }
  function renameSprite(name) {
    const d = doc(), t = tex();
    const next = String(name || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
    if (!t || !next || next === state.sprite) return;
    if (d.textures[next]) { status('A sprite named "' + next + '" already exists.', 'bad'); renderSpritePanel(); return; }
    d.textures[next] = t;
    delete d.textures[state.sprite];
    state.sprite = next;
    renderAll();
    status('Renamed the sprite to ' + next + '.', 'good');
  }
  function renameDesign(name) {
    const t = tex();
    const next = String(name || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
    if (!t || !next || next === state.design) return;
    if (state.design == null) return;
    if (t.designs[next]) { status('A design named "' + next + '" already exists.', 'bad'); return; }
    t.designs[next] = t.designs[state.design];
    delete t.designs[state.design];
    for (const rule of t.conditions || []) if (rule.design === state.design) rule.design = next;
    if (t.default === state.design) t.default = next;
    state.design = next;
    renderAll();
    status('Renamed the design to ' + next + '.', 'good');
  }
  function addDesign() {
    const t = tex(), d = design();
    if (!t || !d) return;
    let n = 2, name = 'variant2';
    while (t.designs[name]) name = 'variant' + (++n);
    t.designs[name] = clone(d);
    state.design = name;
    state.swatch = 1;
    renderAll();
    status('Added ' + name + ' as a copy of the current design.', 'good');
  }
  function deleteDesign() {
    const t = tex();
    if (!t || Object.keys(t.designs).length <= 1) { status('A sprite needs at least one design.', 'bad'); return; }
    if (!confirm('Delete design "' + state.design + '"?')) return;
    delete t.designs[state.design];
    for (const rule of t.conditions || []) if (rule.design === state.design) rule.design = t.default;
    t.conditions = (t.conditions || []).filter(r => t.designs[r.design]);
    if (t.default === state.design) t.default = Object.keys(t.designs)[0];
    state.design = t.default;
    state.swatch = 1;
    renderAll();
  }
  function deleteSprite(name) {
    const d = doc();
    if (!d || !d.textures[name]) return;
    if (!confirm('Delete sprite "' + name + '"?')) return;
    delete d.textures[name];
    if (state.sprite === name) {
      state.sprite = Object.keys(d.textures)[0] || null;
      const t = tex();
      state.design = t ? (t.default || Object.keys(t.designs)[0]) : null;
    }
    renderAll();
  }
  function addBlankSprite() {
    const d = doc();
    if (!d) { status('Create a family first.', 'bad'); return; }
    let name = 'sprite', k = 1;
    while (d.textures[name]) name = 'sprite' + (++k);
    d.textures[name] = blankTexture();
    state.sprite = name;
    state.design = 'base';
    state.swatch = 1;
    renderAll();
    status('Added a blank 9×9 sprite.', 'good');
  }
  function renameFamily(name) {
    const d = doc();
    const next = String(name || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').toLowerCase();
    if (!d || !next || next === state.family) return;
    if (state.families[next]) { status('A family named "' + next + '" already exists.', 'bad'); renderFamilyPanel(); return; }
    d.name = next;
    state.families[next] = d;
    delete state.families[state.family];
    state.family = next;
    renderAll();
  }
  function deleteFamily() {
    if (!state.family) return;
    if (!confirm('Delete family "' + state.family + '"?')) return;
    delete state.families[state.family];
    const first = Object.keys(state.families)[0] || null;
    if (first) selectFamily(first);
    else { state.family = state.sprite = state.design = null; renderAll(); }
  }

  // -------------------------------------------------------------------
  // PNG import
  // -------------------------------------------------------------------
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('That file could not be read.'));
      r.readAsDataURL(file);
    });
  }
  function decodeImage(uri) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        resolve({ data: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height });
      };
      img.onerror = () => reject(new Error('That image could not be decoded.'));
      img.src = uri;
    });
  }
  function designFromImage(img) {
    const palette = ['transparent'];
    const chars = new Map();
    const rows = [];
    for (let y = 0; y < img.h; y++) {
      let row = '';
      for (let x = 0; x < img.w; x++) {
        const o = (y * img.w + x) * 4;
        const a = img.data[o + 3];
        if (!a) { row += '.'; continue; }
        const key = [img.data[o], img.data[o + 1], img.data[o + 2], a].join(',');
        let ch = chars.get(key);
        if (!ch) {
          if (palette.length >= TEX.ALPHABET.length) throw new Error('The image has more than ' + (TEX.ALPHABET.length - 1) + ' colours. Reduce its palette first.');
          palette.push(cssColor(img.data[o], img.data[o + 1], img.data[o + 2], a));
          ch = TEX.ALPHABET[palette.length - 1];
          chars.set(key, ch);
        }
        row += ch;
      }
      rows.push(row);
    }
    return { palette, rows };
  }
  async function spriteFromPng(file) {
    try {
      const img = await decodeImage(await readFile(file));
      const d = doc() || (state.families.props = blankFamily('props'), state.family = 'props', doc());
      const base = (file.name || 'sprite').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase() || 'sprite';
      let name = base, k = 1;
      while (d.textures[name]) name = base + '_' + (++k);
      d.textures[name] = {
        size: [img.w, img.h],
        params: {},
        default: 'base',
        designs: { base: designFromImage(img) },
        conditions: [],
        marks: {},
      };
      state.sprite = name;
      state.design = 'base';
      state.swatch = 1;
      renderAll();
      status('Added ' + name + ' (' + img.w + '×' + img.h + ') from ' + file.name + '.', 'good');
    } catch (e) { status(e.message, 'bad'); }
  }
  async function designFromPng(file) {
    const t = tex();
    if (!t) { status('Select a sprite first.', 'bad'); return; }
    try {
      const img = await decodeImage(await readFile(file));
      const base = (file.name || 'design').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase() || 'design';
      let name = base, k = 1;
      while (t.designs[name]) name = base + '_' + (++k);
      t.designs[name] = designFromImage(img);
      state.design = name;
      state.swatch = 1;
      renderAll();
      status('Added design ' + name + ' (' + img.w + '×' + img.h + ').', 'good');
    } catch (e) { status(e.message, 'bad'); }
  }

  // -------------------------------------------------------------------
  // Import / export
  // -------------------------------------------------------------------
  function serialize(d) {
    return HEADER + TEX.stringify(clean(d)) + '\n';
  }
  function loadSaved() {
    let raw;
    try { raw = localStorage.getItem(SAVED_KEY); }
    catch (e) { savedNotice = 'Could not read browser-saved changes: ' + e.message; return; }
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 2 || !saved.families || typeof saved.families !== 'object') throw new Error('unrecognized saved data');
      state.families = Object.assign(Object.create(null), saved.families);
      savedNotice = 'Loaded browser-saved texture changes.';
    } catch (e) {
      savedNotice = 'Could not load saved changes: ' + e.message;
    }
  }
  function saveChanges() {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify({ version: 2, families: clean(state.families) }));
      status('Saved in this browser only; the files in textures/ are unchanged.', 'good');
    } catch (e) { status('Could not save: ' + e.message, 'bad'); }
  }
  function clearSaved() {
    if (!confirm('Clear browser-saved changes and reload the bundled textures?')) return;
    try { localStorage.removeItem(SAVED_KEY); } catch (e) { status(e.message, 'bad'); return; }
    state.families = Object.assign(Object.create(null), clone(bundled));
    selectFamily(Object.keys(state.families).sort()[0] || null);
    status('Restored the bundled textures.', 'good');
  }
  function download() {
    const d = doc();
    if (!d) return;
    const text = serialize(d);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (d.name || state.family) + '.texture';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    status('Downloaded ' + a.download + ' (' + Math.round(text.length / 1024) + ' KB).', 'good');
  }
  function importText(text, sourceName) {
    const d = TEX.parse(text);
    if (!d || !d.textures) throw new Error('no "textures" object');
    if (d.format !== TEX.FORMAT) throw new Error('expected ' + TEX.FORMAT + ', got ' + (d.format || 'nothing'));
    const fam = (d.name || sourceName.replace(/\.texture$/i, '') || 'imported').replace(/[^A-Za-z0-9_-]/g, '_').toLowerCase();
    d.name = fam;
    state.families[fam] = d;
    selectFamily(fam);
  }
  async function importFiles(files) {
    for (const file of files) {
      try { importText(await file.text(), file.name); status('Imported ' + file.name + '.', 'good'); }
      catch (e) { status('Could not import ' + file.name + ': ' + e.message, 'bad'); }
    }
  }

  // -------------------------------------------------------------------
  // Zoom
  // -------------------------------------------------------------------
  function fitZoom(w, hgt) {
    const avail = Math.max(180, Math.min(520, Math.min(innerWidth * 0.5, innerHeight * 0.45)));
    return clamp(Math.floor(avail / Math.max(w, hgt)), 1, 20);
  }

  // -------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------
  $('familySelect').addEventListener('change', e => selectFamily(e.target.value));
  $('newFamily').addEventListener('click', () => {
    const name = (prompt('Family name (lower_snake_case)', 'props') || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').toLowerCase();
    if (!name) return;
    if (state.families[name]) { status('That family already exists.', 'bad'); return; }
    state.families[name] = blankFamily(name);
    selectFamily(name);
    status('New family. Add a sprite to start painting.', 'good');
  });
  $('addTexForm').addEventListener('submit', e => {
    e.preventDefault();
    const d = doc();
    if (!d) { status('Create a family first.', 'bad'); return; }
    const name = ($('addTexName').value || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
    if (!name) return;
    if (d.textures[name]) { status('"' + name + '" already exists.', 'bad'); return; }
    d.textures[name] = blankTexture();
    $('addTexName').value = '';
    state.sprite = name;
    state.design = 'base';
    state.swatch = 1;
    renderAll();
  });
  $('newBlankSprite').addEventListener('click', addBlankSprite);
  $('newSprite').addEventListener('click', () => $('spriteFile').click());
  $('spriteFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) spriteFromPng(f);
  });
  $('addDesignPng').addEventListener('click', () => $('designFile').click());
  $('designFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) designFromPng(f);
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', e => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length) importFiles(files);
  });
  $('download').addEventListener('click', download);
  $('copy').addEventListener('click', async () => {
    const d = doc();
    if (!d) return;
    try { await navigator.clipboard.writeText(serialize(d)); status('Copied the .texture text.', 'good'); }
    catch (e) { status('Clipboard blocked by the browser. Use Download instead.', 'bad'); }
  });
  $('saveChanges').addEventListener('click', saveChanges);
  $('clearSavedChanges').addEventListener('click', clearSaved);
  $('deleteSprite').addEventListener('click', () => state.sprite && deleteSprite(state.sprite));
  $('deleteFamily').addEventListener('click', deleteFamily);
  $('addDesign').addEventListener('click', addDesign);
  $('delDesign').addEventListener('click', deleteDesign);
  $('addCondition').addEventListener('click', () => {
    const t = tex();
    if (!t) return;
    t.conditions.push({ when: 'true', design: state.design || t.default });
    renderConditions();
    renderCanvas();
    scheduleValidate();
  });
  $('conditionFilter').addEventListener('input', applyConditionFilter);
  $('resetTest').addEventListener('click', () => {
    delete state.test[testKey()];
    renderTestParams();
    renderDesignStrip();
    renderPalette();
    renderSwatchEditor();
    renderCanvas();
  });
  $('clearMarks').addEventListener('click', () => {
    const t = tex();
    if (!t) return;
    t.marks = {};
    renderMarks();
    renderCanvas();
    scheduleValidate();
  });
  $('paintColor').addEventListener('change', e => applyPaintColor(e.target.value));
  $('paintHex').addEventListener('change', e => {
    const text = e.target.value.trim();
    if (!/^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) {
      status('Use a hex colour like #rrggbb.', 'bad');
      updatePaintColor();
      return;
    }
    const hex = toHexColor(text);
    e.target.value = hex;
    $('paintColor').value = hex;
    applyPaintColor(hex);
  });
  $('paintAdd').addEventListener('click', () => applyPaintColor($('paintColor').value));
  $('zoom').addEventListener('input', e => { state.zoom = +e.target.value; renderCanvas(); });
  $('showGrid').addEventListener('change', e => { state.grid = e.target.checked; renderCanvas(); });
  $('showMarks').addEventListener('change', e => { state.showMarks = e.target.checked; renderCanvas(); });
  $('markType').addEventListener('change', e => { state.markType = e.target.value; });
  for (const b of document.querySelectorAll('#tools button[data-tool]')) {
    b.addEventListener('click', () => { state.tool = b.dataset.tool; updateMarkControls(); renderCanvas(); });
  }
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  // Buttons live in <summary> headers; don't let their clicks fold the panel.
  for (const b of document.querySelectorAll('#inspector summary button')) {
    b.addEventListener('click', e => e.stopPropagation());
  }

  const cv = $('canvas');
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointermove', e => {
    const t = tex();
    if (!t) return;
    const c = canvasCell(e);
    $('cursorInfo').textContent = c.x + ',' + c.y + '  ' + rowChar(c.x, c.y) + '  swatch ' + state.swatch;
  });
  cv.addEventListener('pointerdown', e => {
    const t = tex(), d = design();
    if (!t || !d) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const c = canvasCell(e);
    if (state.tool === 'group') { toggleGroupPixel(c.x, c.y); return; }
    if (state.tool === 'pick') {
      const ch = rowChar(c.x, c.y);
      const idx = TEX.ALPHABET.indexOf(ch);
      if (idx >= 0) { state.swatch = idx; renderPalette(); renderSwatchEditor(); }
      return;
    }
    if (state.tool === 'marker') { toggleMark(c.x, c.y); return; }
    pushUndo();
    const erase = e.button === 2 || (e.buttons & 2) === 2;
    const ch = (state.tool === 'eraser' || erase) ? '.' : swatchChar();
    state.drag = { tool: state.tool, ch, x0: c.x, y0: c.y, rows: d.rows.slice() };
    state.last = { x: c.x, y: c.y };
    if (state.tool === 'fill') fillPixels(c.x, c.y);
    else if (state.tool === 'pencil' || state.tool === 'eraser') putPixel(c.x, c.y, ch);
    if (groupData(d)) rebuildGroupPalette(d);
    renderCanvas();
    updateThumb();
  });
  cv.addEventListener('pointermove', e => {
    if (!state.drag) return;
    const d = design();
    if (!d) return;
    const c = canvasCell(e);
    const drag = state.drag;
    if (drag.tool === 'line' || drag.tool === 'rect') {
      d.rows = drag.rows.slice();
      if (drag.tool === 'line') paintLine(drag.x0, drag.y0, c.x, c.y, drag.ch);
      else paintRect(drag.x0, drag.y0, c.x, c.y, drag.ch);
    } else if (drag.tool === 'pencil' || drag.tool === 'eraser') {
      if (state.last && (state.last.x !== c.x || state.last.y !== c.y)) {
        paintLine(state.last.x, state.last.y, c.x, c.y, drag.ch);
      }
      state.last = { x: c.x, y: c.y };
    }
    if (groupData(d)) rebuildGroupPalette(d);
    renderCanvas();
    updateThumb();
  });
  cv.addEventListener('pointerup', () => {
    if (!state.drag) return;
    state.drag = null;
    state.last = null;
    if (groupData()) rebuildGroupPalette();
    renderCanvas();
    updateThumb();
    scheduleValidate();
  });
  cv.addEventListener('pointercancel', () => { state.drag = null; state.last = null; });

  addEventListener('keydown', e => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); download(); return; }
    if (e.key === '[' || e.key === ']') {
      state.zoom = clamp(state.zoom + (e.key === ']' ? 1 : -1), 1, 20);
      $('zoom').value = state.zoom;
      renderCanvas();
      return;
    }
    const tool = { b: 'pencil', e: 'eraser', g: 'fill', l: 'line', r: 'rect', i: 'pick', m: 'marker' }[e.key.toLowerCase()];
    if (tool) { state.tool = tool; updateMarkControls(); }
  });

  // -------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------
  const sources = window.TEXTURE_SOURCES || {};
  for (const fam of Object.keys(sources)) {
    try {
      const d = TEX.parse(sources[fam]);
      if (d.format !== TEX.FORMAT) throw new Error('expected ' + TEX.FORMAT + ', got ' + (d.format || 'nothing'));
      d.name = fam;
      state.families[fam] = d;
    } catch (e) {
      status(fam + ': ' + e.message, 'bad');
    }
  }
  bundled = clone(state.families);
  loadSaved();
  if (!Object.keys(state.families).length) state.families.props = blankFamily('props');
  state.family = Object.keys(state.families).sort()[0] || null;
  const first = state.family ? state.families[state.family] : null;
  state.sprite = first ? Object.keys(first.textures)[0] || null : null;
  const firstTex = tex();
  state.design = firstTex ? (firstTex.default || Object.keys(firstTex.designs)[0]) : null;
  if (firstTex) state.zoom = fitZoom(firstTex.size[0], firstTex.size[1]);
  $('zoom').value = state.zoom;
  renderAll();
  updateMarkControls();

  if (!Object.keys(sources).length) status('No texture files embedded in this build. Import a .texture to begin.', '');
  else status('Loaded ' + plural(Object.keys(sources).length, 'family', 'families') + ' from textures/.', 'good');
  if (savedNotice) status(savedNotice, savedNotice.startsWith('Could not') ? 'bad' : 'good');
})();
