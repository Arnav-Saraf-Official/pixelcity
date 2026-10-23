'use strict';
// =====================================================================
// Texture Studio
//
// A visual editor for .texture files. The engine (js/texture.js) does the
// real work: this file only builds documents, validates them with
// TEX.validate and renders them with TEX.render. Whatever is downloaded is
// the same JSONC the build would have read from textures/*.texture.
//
// Three ways to make art:
//   1. Ops   — the small drawing commands the game runs at load time.
//   2. Pixels — a grid editor that bakes its canvas into optimized rect ops.
//   3. PNG   — imported images are converted to the same rect ops, so the
//              finished .texture never needs an image file beside it.
//
// Build: node scripts/build.mjs -> dist/textures/index.html (route /textures)
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    families: Object.create(null),   // family name -> doc
    family: null,
    current: null,
    tab: 'sprite',
    test: Object.create(null),       // "family/texture" -> {param: value}
    fnTest: Object.create(null),     // "family/texture" -> {param: "(tx, ty) => true"}
    scale: 5,
    grid: true,
    marks: true,
    errors: [],
    images: new Map(),               // data URI -> {w,h,data}
    rev: 0,
  };

  // -------------------------------------------------------------------
  // DOM helpers
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
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') n[k] = !!v;
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

  // -------------------------------------------------------------------
  // Value inputs
  // -------------------------------------------------------------------
  // A field holds any JSON value: number, string, list or expression.
  function exprInput(value, onChange, placeholder) {
    const inp = h('input', {type: 'text', spellcheck: 'false', placeholder: placeholder || ''});
    inp.value = value === undefined ? '' : JSON.stringify(value);
    const commit = () => {
      const txt = inp.value.trim();
      if (!txt) { inp.classList.remove('invalid'); onChange(undefined); return; }
      try { const v = JSON.parse(txt); inp.classList.remove('invalid'); onChange(v); }
      catch (e) { inp.classList.add('invalid'); status('That value is not valid JSON: ' + e.message, 'bad'); }
    };
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    return inp;
  }
  function textInput(value, onChange, placeholder) {
    const inp = h('input', {type: 'text', spellcheck: 'false', placeholder: placeholder || ''});
    inp.value = value === undefined ? '' : String(value);
    const commit = () => onChange(inp.value.trim());
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    return inp;
  }
  function numberInput(value, onChange, attrs) {
    const inp = h('input', Object.assign({type: 'number', step: '1'}, attrs || {}));
    inp.value = value === undefined ? '' : String(value);
    const commit = () => {
      if (inp.value === '') { inp.classList.remove('invalid'); onChange(undefined); return; }
      const n = Number(inp.value);
      if (!Number.isFinite(n)) { inp.classList.add('invalid'); return; }
      inp.classList.remove('invalid');
      onChange(n);
    };
    inp.addEventListener('change', commit);
    return inp;
  }
  function field(label, control, hint) {
    const wrap = h('div', {class: 'field'}, h('label', null, label), control);
    if (hint) wrap.append(h('div', {class: 'hint'}, hint));
    return wrap;
  }
  function pairsEditor(obj, onChange) {
    const box = h('div', {class: 'pairs'});
    const render = () => {
      box.replaceChildren();
      for (const key of Object.keys(obj)) {
        const keyIn = textInput(key, v => {
          if (v === key) return;
          if (!v) { delete obj[key]; onChange(); render(); return; }
          const old = obj[key];
          delete obj[key]; obj[v] = old;
          onChange(); render();
        });
        box.append(h('div', {class: 'pair'},
          keyIn,
          exprInput(obj[key], v => {
            if (v === undefined) delete obj[key]; else obj[key] = v;
            onChange();
          }),
          h('button', {class: 'danger', title: 'Remove', onclick: () => { delete obj[key]; onChange(); render(); }}, '✕')
        ));
      }
      box.append(h('button', {onclick: () => {
        let n = 'param', k = 1;
        while (Object.prototype.hasOwnProperty.call(obj, n)) n = 'param' + (++k);
        obj[n] = 0; onChange(); render();
      }}, '+ pair'));
    };
    render();
    return box;
  }

  // -------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------
  const blankDoc = name => ({format: 'texture/1', name, tile: 9, defs: {}, textures: {}});
  const blankTexture = (w = 9, hpx = 9) => ({size: [w, hpx], params: {}, ops: []});
  const familyName = () => (state.family ? state.families[state.family] : null);
  const texDoc = () => {
    const doc = familyName();
    return doc && state.current ? doc.textures[state.current] : null;
  };
  const testKey = () => state.family + '/' + state.current;

  // -------------------------------------------------------------------
  // Op schema — mirrors DRAW in js/texture.js
  // -------------------------------------------------------------------
  const OP_FIELDS = {
    rect: ['x', 'y', 'w', 'h', 'color'],
    clear: ['x', 'y', 'w', 'h'],
    pixel: ['x', 'y', 'color'],
    line: ['x1', 'y1', 'x2', 'y2', 'color'],
    png: ['src', 'x', 'y', 'alpha'],
    each: ['as', 'in'],
    repeat: ['as', 'times', 'from'],
    if: ['test'],
    win: ['x', 'y', 'color'],
    park: ['x', 'y', 'v'],
    stat: ['x', 'y'],
    berth: ['x', 'y'],
    spot: ['x', 'y'],
    spots: ['of'],
    mark: ['as', 'of'],
    use: ['texture', 'file', 'at', 'params'],
    set: ['as', 'value'],
    call: ['fn', 'args'],
  };
  const RAW_FIELDS = new Set(['as', 'texture', 'file', 'fn']);
  const PAIR_FIELDS = new Set(['params', 'args']);
  const OP_DEFAULTS = {
    rect: {op: 'rect', x: 0, y: 0, w: 1, h: 1, color: '#ffffff'},
    clear: {op: 'clear', x: 0, y: 0, w: 1, h: 1},
    pixel: {op: 'pixel', x: 0, y: 0, color: '#ffffff'},
    line: {op: 'line', x1: 0, y1: 0, x2: 8, y2: 8, color: '#ffffff'},
    png: {op: 'png', src: '', x: 0, y: 0},
    each: {op: 'each', as: 'i', in: [0, 1], ops: []},
    repeat: {op: 'repeat', as: 'i', times: 4, ops: []},
    if: {op: 'if', test: true, then: [], else: []},
    win: {op: 'win', x: 0, y: 0},
    park: {op: 'park', x: 0, y: 0, v: 0},
    stat: {op: 'stat', x: 0, y: 0},
    berth: {op: 'berth', x: 0, y: 0},
    spot: {op: 'spot', x: 0, y: 0},
    spots: {op: 'spots', of: []},
    mark: {op: 'mark', as: 'win', of: []},
    use: {op: 'use', texture: '', at: [0, 0]},
    set: {op: 'set', as: 'flag', value: true},
    call: {op: 'call', fn: '', args: {}},
  };
  const OP_KINDS = Object.keys(OP_FIELDS);

  // -------------------------------------------------------------------
  // PNG decoding
  // -------------------------------------------------------------------
  function decodeImage(uri) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        resolve({w: cv.width, h: cv.height, data: g.getImageData(0, 0, cv.width, cv.height).data});
      };
      img.onerror = () => reject(new Error('That image could not be decoded.'));
      img.src = uri;
    });
  }
  function readAsDataUri(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('That file could not be read.'));
      r.readAsDataURL(file);
    });
  }
  async function ensureImage(uri) {
    if (!uri || !uri.startsWith('data:')) return null;
    if (state.images.has(uri)) return state.images.get(uri);
    const img = await decodeImage(uri);
    state.images.set(uri, img);
    return img;
  }
  async function ensureAllImages() {
    const uris = new Set();
    const walk = (ops) => {
      for (const op of ops || []) {
        if (!op) continue;
        if (op.op === 'png' && typeof op.src === 'string' && op.src.startsWith('data:')) uris.add(op.src);
        if (op.ops) walk(op.ops);
        if (op.then) walk(op.then);
        if (op.else) walk(op.else);
      }
    };
    for (const fam of Object.keys(state.families)) {
      for (const name of Object.keys(state.families[fam].textures || {})) walk(state.families[fam].textures[name].ops);
    }
    let added = false;
    for (const uri of uris) {
      if (state.images.has(uri)) continue;
      try { await ensureImage(uri); added = true; }
      catch (e) { state.errors.push(e.message); }
    }
    if (added) preview();
  }
  // Turn `src` into the `ref` the engine expects, exactly as the build does.
  function resolvePng(ops, fam, images, problems) {
    for (const op of ops || []) {
      if (op && op.op === 'png' && typeof op.src === 'string') {
        const src = op.src;
        if (src.startsWith('data:')) {
          const key = fam + ':' + (op.name || 'inline') + ':' + src.length + ':' + src.slice(-24);
          const img = state.images.get(src);
          if (img) images[key] = img;
          else problems.push(fam + ': an embedded image is still decoding.');
          delete op.src; op.ref = key;
        } else if (src) {
          problems.push(fam + ': "' + src + '" is a file path. Preview can only show embedded PNGs — bake it to ops or upload the image.');
        }
      }
      if (op) { resolvePng(op.ops, fam, images, problems); resolvePng(op.then, fam, images, problems); resolvePng(op.else, fam, images, problems); }
    }
  }

  // -------------------------------------------------------------------
  // PNG -> optimized rect ops
  //
  // A sprite is split into the fewest axis-aligned rectangles we can find
  // greedily: for each unclaimed pixel, extend right along its colour, then
  // extend down while that whole run matches. Transparent pixels are dropped,
  // so the result is only the art itself. Every rectangle becomes one `rect`
  // op — the same command the hand-written .texture files use, which the
  // engine runs without decoding any image.
  // -------------------------------------------------------------------
  const hex2 = v => v.toString(16).padStart(2, '0');
  function colorString(r, g, b, a) {
    if (a === 255) return '#' + hex2(r) + hex2(g) + hex2(b);
    const alpha = Math.round((a / 255) * 1000) / 1000;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function pixelAt(data, i) {
    const o = i * 4;
    return [data[o], data[o + 1], data[o + 2], data[o + 3]];
  }
  function samePixel(data, i, r, g, b, a) {
    const o = i * 4;
    return data[o] === r && data[o + 1] === g && data[o + 2] === b && data[o + 3] === a;
  }
  function imageToOps(data, w, hpx, ox = 0, oy = 0) {
    const ops = [];
    const seen = new Uint8Array(w * hpx);
    for (let y = 0; y < hpx; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (seen[p]) continue;
        const [r, g, b, a] = pixelAt(data, p);
        if (!a) { seen[p] = 1; continue; }
        let x2 = x;
        while (x2 + 1 < w && !seen[y * w + x2 + 1] && samePixel(data, y * w + x2 + 1, r, g, b, a)) x2++;
        let y2 = y;
        grow: while (y2 + 1 < hpx) {
          for (let xx = x; xx <= x2; xx++) {
            const q = (y2 + 1) * w + xx;
            if (seen[q] || !samePixel(data, q, r, g, b, a)) break grow;
          }
          y2++;
        }
        for (let yy = y; yy <= y2; yy++) for (let xx = x; xx <= x2; xx++) seen[yy * w + xx] = 1;
        ops.push({op: 'rect', x: x + ox, y: y + oy, w: x2 - x + 1, h: y2 - y + 1, color: colorString(r, g, b, a)});
      }
    }
    return ops;
  }
  function opBytes(ops) {
    return JSON.stringify(ops).length;
  }

  async function imageForOp(op) {
    if (!op) return null;
    if (typeof op.src === 'string' && op.src.startsWith('data:')) return ensureImage(op.src);
    if (op.ref && TEX.images && TEX.images[op.ref]) {
      const img = TEX.images[op.ref];
      return {w: img.w, h: img.h, data: img.data};
    }
    return null;
  }
  // Replace PNG ops with rect ops, in place, at any depth.
  async function bakeList(list) {
    let changed = false, count = 0;
    for (let i = 0; i < list.length; i++) {
      const op = list[i];
      if (!op || typeof op !== 'object') continue;
      if (op.op === 'png') {
        const img = await imageForOp(op);
        if (img) {
          const rects = imageToOps(img.data, img.w, img.h, op.x || 0, op.y || 0);
          list.splice(i, 1, ...rects);
          i += rects.length - 1;
          changed = true; count += rects.length;
          continue;
        }
      }
      for (const key of ['ops', 'then', 'else']) {
        if (!Array.isArray(op[key])) continue;
        const res = await bakeList(op[key]);
        changed = changed || res.changed;
        count += res.count;
      }
    }
    return {changed, count};
  }
  async function bakeTexture(tex) {
    const before = opBytes(tex.ops || []);
    const res = await bakeList(tex.ops = tex.ops || []);
    return {changed: res.changed, count: res.count, before, after: opBytes(tex.ops)};
  }
  async function bakeAllPngs() {
    let sprites = 0, rects = 0, before = 0, after = 0;
    for (const fam of Object.keys(state.families)) {
      for (const name of Object.keys(state.families[fam].textures || {})) {
        const tex = state.families[fam].textures[name];
        const res = await bakeTexture(tex);
        if (!res.changed) continue;
        sprites++; rects += res.count; before += res.before; after += res.after;
      }
    }
    if (!sprites) { status('No embedded PNGs to convert. Uploaded PNGs are already baked to rect ops.', ''); return; }
    renderOps(); preview();
    status(`Converted ${plural(sprites, 'sprite', 'sprites')} to ${plural(rects, 'rect op', 'rect ops')} (${Math.round(before / 1024)} → ${Math.round(after / 1024)} KB).`, 'good');
  }

  // -------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------
  // Only overrides the user typed here. Declared defaults are left to the
  // engine: passing an expression back in would evaluate it a second time and
  // consume `rnd` differently from the real render.
  function testParams() {
    const p = Object.assign({}, state.test[testKey()] || {});
    const fns = state.fnTest[testKey()] || {};
    for (const k of Object.keys(fns)) {
      const src = (fns[k] || '').trim();
      if (!src) continue;
      let fn;
      try { fn = new Function('"use strict"; return (' + src + ');')(); }
      catch (e) { throw new Error('callback ' + k + ': ' + e.message); }
      if (typeof fn !== 'function') throw new Error('callback ' + k + ' is not a function');
      p[k] = fn;
    }
    return p;
  }
  // Parameters the texture calls as functions, e.g. `["fn", "wet", ...]`.
  function callbackParams(doc, tex) {
    const out = new Set();
    const scan = v => {
      if (Array.isArray(v)) {
        if (v[0] === 'fn' && typeof v[1] === 'string' && !TEX.TEX_OPS[v[1]]) out.add(v[1]);
        for (const a of v) scan(a);
      } else if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) scan(v[k]);
      }
    };
    scan(tex.ops || []);
    return [...out];
  }

  function preview() {
    const doc = familyName();
    const tex = texDoc();
    const errs = [];
    const marksEl = $('markList');
    if (!doc || !tex || !state.current) {
      $('errors').replaceChildren();
      $('markList').replaceChildren(h('span', null, 'Nothing recorded.'));
      return;
    }

    const files = {};
    for (const fam of Object.keys(state.families)) files[fam] = clone(state.families[fam]);
    try { errs.push(...TEX.validate(files)); }
    catch (e) { errs.push(e.message); }

    const problems = [];
    const images = {};
    for (const fam of Object.keys(files)) {
      for (const n of Object.keys(files[fam].textures || {})) resolvePng(files[fam].textures[n].ops, fam, images, problems);
    }
    errs.push(...problems);

    TEX.defineImages(images);
    TEX.define(files);
    TEX.clear();

    let rendered = null;
    try { rendered = TEX.render(state.family, state.current, testParams(), 'editor' + (state.rev++)); }
    catch (e) { errs.push(e.message); }

    $('errors').replaceChildren(...[...new Set(errs)].slice(0, 14).map(e => h('div', {class: 'err'}, e)));
    if (rendered) draw(rendered);
    else { const cv = $('preview'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }

    $('stageTitle').textContent = `${state.family}.texture › ${state.current}  ·  ${tex.size[0]}×${tex.size[1]} px`;

    marksEl.replaceChildren();
    if (rendered) {
      const m = rendered.marks;
      const bits = [
        ['windows', m.win.length], ['parking', m.park.length],
        ['spots', m.spots.length], ['status light', m.stat ? 'yes' : 'no'],
        ['berth', m.berth ? m.berth.join(',') : 'none'],
      ];
      for (const [k, v] of bits) marksEl.append(h('span', null, k + ' ', h('b', null, String(v))));
    } else marksEl.append(h('span', null, 'Nothing recorded.'));

    if (!errs.length) status('Valid. ' + $('stageTitle').textContent, 'good');
  }

  function draw(t) {
    const cv = $('preview'), g = cv.getContext('2d');
    const s = state.scale;
    cv.width = t.canvas.width * s; cv.height = t.canvas.height * s;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < cv.height; y += s) {
      for (let x = 0; x < cv.width; x += s) {
        g.fillStyle = (((x / s) + (y / s)) & 1) ? '#1b2233' : '#151a27';
        g.fillRect(x, y, s, s);
      }
    }
    g.drawImage(t.canvas, 0, 0, cv.width, cv.height);
    if (state.grid && s >= 3) {
      g.strokeStyle = 'rgba(255,255,255,.07)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= t.canvas.width; x++) { g.moveTo(x * s + .5, 0); g.lineTo(x * s + .5, cv.height); }
      for (let y = 0; y <= t.canvas.height; y++) { g.moveTo(0, y * s + .5); g.lineTo(cv.width, y * s + .5); }
      g.stroke();
    }
    if (state.marks) {
      const dot = (x, y, col) => {
        g.strokeStyle = col; g.lineWidth = 1;
        g.strokeRect(x * s + .5, y * s + .5, Math.max(1, s - 1), Math.max(1, s - 1));
      };
      for (const p of t.marks.win) dot(p[0], p[1], 'rgba(255,215,94,.65)');
      for (const p of t.marks.park) dot(p[0], p[1], 'rgba(111,179,255,.75)');
      for (const p of t.marks.spots) dot(p[0], p[1], 'rgba(95,220,122,.75)');
      if (t.marks.stat) dot(t.marks.stat[0], t.marks.stat[1], 'rgba(255,107,107,.9)');
      if (t.marks.berth) dot(t.marks.berth[0], t.marks.berth[1], 'rgba(219,201,159,.9)');
    }
  }

  // -------------------------------------------------------------------
  // Library
  // -------------------------------------------------------------------
  function renderLibrary() {
    $('familySelect').replaceChildren(...Object.keys(state.families).sort().map(f =>
      h('option', {value: f, selected: f === state.family}, f)));

    const doc = familyName();
    const list = $('textureList');
    list.replaceChildren();
    if (!doc) { list.append(h('small', null, 'No families yet.')); return; }
    for (const name of Object.keys(doc.textures)) {
      const tex = doc.textures[name];
      const size = tex.size ? tex.size[0] + '×' + tex.size[1] : 'inherited';
      const open = h('button', {class: name === state.current ? 'on' : '', onclick: () => selectTexture(name)},
        h('span', null, name), h('span', {class: 'meta'}, size));
      const kill = h('button', {class: 'kill', title: `Delete ${name}`, 'aria-label': `Delete ${name}`, onclick: e => {
        e.stopPropagation();
        deleteTexture(name);
      }}, '✕');
      list.append(h('div', {class: 'item'}, open, kill));
    }
    if (!Object.keys(doc.textures).length) list.append(h('small', null, 'No sprites yet. Add one below.'));
  }

  // -------------------------------------------------------------------
  // Tabs
  // -------------------------------------------------------------------
  function setTab(tab) {
    state.tab = tab;
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const id of ['sprite', 'pixels', 'ops', 'family']) $('tab-' + id).classList.toggle('hidden', id !== tab);
    if (tab === 'pixels') edRender();
  }

  // -------------------------------------------------------------------
  // Sprite tab
  // -------------------------------------------------------------------
  function renderTextureSettings() {
    const doc = familyName(), tex = texDoc(), box = $('texSettings');
    if (!doc || !tex) {
      box.replaceChildren(h('p', {class: 'help'}, 'Create or select a sprite to edit it.'));
      return;
    }
    const nameIn = textInput(state.current, v => renameTexture(v));
    const wIn = numberInput(tex.size ? tex.size[0] : undefined, v => { if (!tex.size) tex.size = [9, 9]; if (v) tex.size[0] = v; preview(); });
    const hIn = numberInput(tex.size ? tex.size[1] : undefined, v => { if (!tex.size) tex.size = [9, 9]; if (v) tex.size[1] = v; preview(); });
    const ops = tex.ops || [];
    const pngs = (function countPngs(list) {
      let n = 0;
      for (const op of list || []) {
        if (!op) continue;
        if (op.op === 'png') n++;
        if (op.ops) n += countPngs(op.ops);
        if (op.then) n += countPngs(op.then);
        if (op.else) n += countPngs(op.else);
      }
      return n;
    })(ops);
    box.replaceChildren(
      h('div', {class: 'settings'},
        h('h2', null, 'Sprite'),
        field('name', nameIn),
        field('size', h('div', {class: 'row'}, wIn, h('span', null, '×'), hIn), 'omit when inheriting via extends'),
        field('extends', textInput(tex.extends, v => { if (v) tex.extends = v; else delete tex.extends; preview(); }), 'other texture, or "family:name"'),
        h('small', null, `${plural(ops.length, 'top-level op', 'top-level ops')} · ${Math.round(opBytes(ops) / 1024 * 10) / 10} KB${pngs ? ` · ${plural(pngs, 'PNG', 'PNGs')}` : ''}`)
      ),
      h('div', {class: 'row'},
        h('button', {onclick: duplicateTexture}, 'Duplicate'),
        h('button', {onclick: () => { setTab('pixels'); edLoadSprite(); }}, 'Edit pixels'),
        pngs ? h('button', {onclick: async () => {
          const res = await bakeTexture(tex);
          renderOps(); renderTextureSettings(); preview();
          status(`Baked ${plural(res.count, 'rect op', 'rect ops')} from PNGs.`, 'good');
        }}, 'Bake PNGs') : null,
        h('button', {class: 'danger', onclick: () => deleteTexture(state.current)}, 'Delete')
      ),
      h('div', {class: 'row'},
        h('button', {onclick: () => { tex.ops = []; renderOps(); renderTextureSettings(); preview(); status('Cleared every op in this sprite.', ''); }}, 'Clear ops'),
        h('button', {onclick: () => { setTab('pixels'); edClear(); }}, 'New in pixel editor')
      ),
      h('div', {class: 'settings'},
        h('h2', null, 'Params'),
        h('div', {class: 'pairs'}, pairsEditor(tex.params = tex.params || {}, () => { preview(); renderParamForm(); })),
        h('small', null, 'Defaults are evaluated top to bottom, so a param may use the ones above it.')
      )
    );
    renderParamForm();
  }

  function renderParamForm() {
    const tex = texDoc(), box = $('paramForm');
    box.replaceChildren();
    if (!tex) return;
    const values = state.test[testKey()] = state.test[testKey()] || {};
    const params = tex.params || {};
    if (!Object.keys(params).length) box.append(h('small', null, 'This texture takes no parameters.'));
    for (const k of Object.keys(params)) {
      const inp = exprInput(k in values ? values[k] : undefined, v => {
        if (v === undefined) delete values[k]; else values[k] = v;
        preview();
      });
      inp.placeholder = JSON.stringify(params[k]);
      box.append(field(k, inp, 'default ' + JSON.stringify(params[k])));
    }
    const cb = callbackParams(familyName(), tex);
    if (cb.length) {
      const fnValues = state.fnTest[testKey()] = state.fnTest[testKey()] || {};
      box.append(h('h3', null, 'Test callbacks'));
      for (const name of cb) {
        box.append(field('fn ' + name, textInput(fnValues[name] || '', v => {
          if (v) fnValues[name] = v; else delete fnValues[name];
          preview();
        }, '(tx, ty) => true'), 'JS arrow function used in place of the one the game supplies'));
      }
    }
    box.append(h('div', {class: 'field'}, h('label', null, 'implicit'),
      h('small', null, 'w h tw th ox oy'), h('small', {class: 'hint'}, 'supplied by the engine')));
  }

  // -------------------------------------------------------------------
  // Family tab
  // -------------------------------------------------------------------
  function renderFamilySettings() {
    const doc = familyName(), box = $('familySettings');
    if (!doc) { box.replaceChildren(h('p', {class: 'help'}, 'No family selected.')); renderDefs(); return; }
    box.replaceChildren(
      h('div', {class: 'settings'},
        h('h2', null, 'Family'),
        field('file name', textInput(doc.name, v => renameFamily(v)), 'textures/<name>.texture'),
        field('tile', numberInput(doc.tile, v => { if (v) { doc.tile = v; preview(); } }), 'art pixels per tile (usually 9)'),
        h('div', {class: 'row'},
          h('button', {onclick: bakeAllPngs}, 'Bake all PNGs'),
          h('button', {class: 'danger', onclick: deleteFamily}, 'Delete family')
        )
      )
    );
    renderDefs();
  }
  function renderDefs() {
    const doc = familyName(), box = $('defsEditor');
    box.replaceChildren();
    if (!doc) return;
    doc.defs = doc.defs || {};
    for (const key of Object.keys(doc.defs)) {
      box.append(h('div', {class: 'pair'},
        textInput(key, v => {
          if (!v || v === key) return;
          const val = doc.defs[key]; delete doc.defs[key]; doc.defs[v] = val;
          preview(); renderDefs();
        }),
        exprInput(doc.defs[key], v => { if (v === undefined) delete doc.defs[key]; else doc.defs[key] = v; preview(); }),
        h('button', {class: 'danger', title: 'Delete def', onclick: () => { delete doc.defs[key]; preview(); renderDefs(); }}, '✕')
      ));
    }
  }

  // -------------------------------------------------------------------
  // Ops tab
  // -------------------------------------------------------------------
  function renderOps() {
    const tex = texDoc(), box = $('opEditor');
    box.replaceChildren();
    if (!tex) { box.append(h('p', {class: 'help'}, 'Select a sprite to edit its ops.')); return; }
    tex.ops = tex.ops || [];
    box.append(opsEditor(tex.ops, renderOps));
  }
  function opsEditor(ops, refresh) {
    const box = h('div', {class: 'ops'});
    for (let i = 0; i < ops.length; i++) box.append(opCard(ops[i], i, ops, refresh));
    box.append(addOpRow(ops, refresh));
    return box;
  }
  function addOpRow(ops, refresh) {
    const sel = h('select', null, ...OP_KINDS.map(k => h('option', {value: k}, k)));
    return h('div', {class: 'addop'}, sel,
      h('button', {onclick: () => { ops.push(clone(OP_DEFAULTS[sel.value])); refresh(); preview(); }}, '+ op'));
  }
  function opCard(op, index, arr, refresh) {
    const body = h('div', {class: 'body'});
    for (const f of OP_FIELDS[op.op] || []) body.append(opField(op, f, refresh, index, arr));
    if (op.op === 'each' || op.op === 'repeat') {
      op.ops = op.ops || [];
      body.append(h('div', {class: 'sub-label'}, 'inside'), opsEditor(op.ops, refresh));
    } else if (op.op === 'if') {
      op.then = op.then || []; op.else = op.else || [];
      body.append(h('div', {class: 'sub-label'}, 'then'), opsEditor(op.then, refresh));
      body.append(h('div', {class: 'sub-label'}, 'else'), opsEditor(op.else, refresh));
    }
    return h('div', {class: 'op'},
      h('header', null,
        h('span', {class: 'kind'}, op.op),
        h('button', {title: 'Move up', onclick: () => { if (index > 0) { [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]; refresh(); preview(); } }}, '↑'),
        h('button', {title: 'Move down', onclick: () => { if (index < arr.length - 1) { [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]]; refresh(); preview(); } }}, '↓'),
        h('button', {title: 'Duplicate', onclick: () => { arr.splice(index + 1, 0, clone(op)); refresh(); preview(); }}, '⧉'),
        h('button', {class: 'danger', title: 'Delete', onclick: () => { arr.splice(index, 1); refresh(); preview(); }}, '✕')
      ),
      body
    );
  }
  function opField(op, f, refresh, index, arr) {
    if (f === 'src') return field('png', pngControl(op, index, arr, refresh));
    if (PAIR_FIELDS.has(f)) {
      op[f] = op[f] || {};
      return field(f, pairsEditor(op[f], () => preview()), f === 'params' ? 'passed to the used texture' : 'arguments for the capability');
    }
    if (RAW_FIELDS.has(f)) {
      return field(f, textInput(op[f], v => {
        if (!v) delete op[f]; else op[f] = v;
        preview();
        if (f === 'texture' || f === 'file') refresh();
      }));
    }
    if (f === 'of' || f === 'at') {
      return field(f, exprInput(op[f], v => { if (v === undefined) delete op[f]; else op[f] = v; preview(); }), 'a list of points, e.g. [[1,2],[3,4]]');
    }
    if (f === 'alpha') {
      return field(f, exprInput(op[f], v => {
        if (v === undefined) delete op[f]; else op[f] = v;
        preview();
      }), '0–1');
    }
    return field(f, exprInput(op[f], v => { if (v === undefined) delete op[f]; else op[f] = v; preview(); }));
  }
  // Every PNG that enters the studio becomes rect ops. An uploaded image is
  // rasterized and spliced in place of this op; a legacy `png` op that is
  // already embedded can be converted the same way.
  function pngControl(op, index, arr, refresh) {
    const box = h('div', {class: 'pngbox'});
    const replaceWithRects = (img) => {
      if (!img) { status('That PNG has not finished decoding.', 'bad'); return false; }
      if (!Array.isArray(arr) || !Number.isInteger(index)) {
        status('This PNG is nested; use “Bake PNGs” on the sprite instead.', 'bad');
        return false;
      }
      const rects = imageToOps(img.data, img.w, img.h, op.x || 0, op.y || 0);
      arr.splice(index, 1, ...rects);
      refresh(); preview();
      status(`Converted the PNG to ${plural(rects.length, 'rect op', 'rect ops')} (${Math.round(opBytes(rects) / 1024 * 10) / 10} KB).`, 'good');
      return true;
    };
    const render = () => {
      box.replaceChildren();
      if (op.src) {
        const km = op.src.startsWith('data:') ? ' · ' + Math.round((op.src.length * 3 / 4) / 1024) + ' KB' : '';
        box.append(h('div', {class: 'row'},
          op.src.startsWith('data:') ? h('img', {class: 'thumb', src: op.src, alt: ''}) : null,
          h('span', {class: 'grow'}, h('small', null, (op.src.startsWith('data:') ? 'embedded PNG' : op.src) + km)),
          h('button', {class: 'danger', onclick: () => { delete op.src; render(); preview(); }}, 'Remove')
        ));
        box.append(h('div', {class: 'row'},
          h('button', {class: 'primary', onclick: async () => replaceWithRects(await imageForOp(op))}, 'Convert to rects')
        ));
        box.append(h('small', null, 'New uploads skip this step — they arrive as rect ops.'));
      } else {
        box.append(h('small', null, 'No image yet. Uploading converts it to rect ops.'));
      }
      const input = h('input', {type: 'file', accept: 'image/png,image/*', hidden: true});
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        try {
          const uri = await readAsDataUri(file);
          const img = await ensureImage(uri);
          if (img && replaceWithRects(img)) return;
        } catch (e) { status(e.message, 'bad'); }
        render();
      });
      box.append(h('button', {type: 'button', onclick: () => input.click()}, op.src ? 'Replace PNG → rects' : 'Upload PNG → rects'), input);
    };
    render();
    return box;
  }

  // -------------------------------------------------------------------
  // Selection and item actions
  // -------------------------------------------------------------------
  function selectFamily(fam) {
    if (!state.families[fam]) return;
    state.family = fam;
    const names = Object.keys(state.families[fam].textures);
    state.current = names[0] || null;
    renderAll();
  }
  function selectTexture(name) {
    if (!familyName() || !familyName().textures[name]) return;
    state.current = name;
    renderAll();
  }
  function renderAll() {
    renderLibrary();
    renderTextureSettings();
    renderFamilySettings();
    renderOps();
    setTab(state.tab);
    preview();
    edRender();
  }

  function renameFamily(raw) {
    const name = String(raw || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
    const doc = familyName();
    if (!doc) return;
    if (!name) { renderFamilySettings(); return; }
    if (name !== state.family) {
      if (state.families[name]) { status('A family called "' + name + '" already exists.', 'bad'); renderFamilySettings(); return; }
      delete state.families[state.family];
      state.families[name] = doc;
      doc.name = name;
      state.family = name;
    }
    renderAll();
  }
  function renameTexture(raw) {
    const doc = familyName();
    if (!doc) return;
    const name = String(raw || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
    if (!name) { renderTextureSettings(); return; }
    if (name !== state.current) {
      if (doc.textures[name]) { status('A sprite called "' + name + '" already exists.', 'bad'); renderTextureSettings(); return; }
      const t = doc.textures[state.current];
      delete doc.textures[state.current];
      doc.textures[name] = t;
      state.current = name;
    }
    renderAll();
  }
  function duplicateTexture() {
    const doc = familyName(), tex = texDoc();
    if (!doc || !tex) return;
    let n = state.current + '_copy', k = 1;
    while (doc.textures[n]) n = state.current + '_copy' + (++k);
    doc.textures[n] = clone(tex);
    state.current = n;
    renderAll();
    status('Duplicated as ' + n + '.', 'good');
  }
  function deleteTexture(name = state.current) {
    const doc = familyName();
    if (!doc || !name || !doc.textures[name]) return;
    if (!confirm('Delete sprite "' + name + '"? This cannot be undone.')) return;
    delete doc.textures[name];
    if (state.current === name) state.current = Object.keys(doc.textures)[0] || null;
    edClearBuffer();
    renderAll();
    status('Deleted ' + name + '.', '');
  }
  function deleteFamily() {
    if (!state.family) return;
    if (!confirm('Delete the whole family "' + state.family + '"? This cannot be undone.')) return;
    delete state.families[state.family];
    const fam = Object.keys(state.families)[0];
    state.family = fam || null;
    state.current = fam ? Object.keys(state.families[fam].textures)[0] || null : null;
    edClearBuffer();
    renderAll();
  }
  function addBlankSprite() {
    const doc = familyName();
    if (!doc) { status('Create a family first.', 'bad'); return; }
    let name = 'sprite', k = 1;
    while (doc.textures[name]) name = 'sprite' + (++k);
    doc.textures[name] = blankTexture();
    state.current = name;
    renderAll();
    setTab('pixels');
    edClear();
    status('New 9×9 sprite. Draw, then Apply to sprite.', 'good');
  }

  // -------------------------------------------------------------------
  // Import / export
  // -------------------------------------------------------------------
  function toJSONC(doc) {
    const body = JSON.stringify(clean(doc), null, 2);
    if (body.length <= 2) return '{}\n';
    return '{\n  // written by Texture Studio — JSONC: comments and trailing commas are allowed\n' + body.slice(2) + '\n';
  }
  function download() {
    const doc = familyName();
    if (!doc) return;
    const text = toJSONC(doc);
    const blob = new Blob([text], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (doc.name || state.family) + '.texture';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    status('Downloaded ' + a.download + ' (' + Math.round(text.length / 1024) + ' KB).', 'good');
  }
  async function importFiles(files) {
    for (const file of files) {
      try {
        const text = await file.text();
        const doc = TEX.parse(text);
        if (!doc || typeof doc !== 'object' || !doc.textures) throw new Error('no "textures" object');
        const fam = (doc.name || file.name.replace(/\.texture$/i, '') || 'imported').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        doc.name = fam;
        state.families[fam] = doc;
        state.family = fam;
        state.current = Object.keys(doc.textures)[0] || null;
        renderAll();
        status('Imported ' + file.name + '.', 'good');
      } catch (e) {
        status('Could not import ' + file.name + ': ' + e.message, 'bad');
      }
    }
    ensureAllImages();
  }
  async function newSprite(file) {
    try {
      const uri = await readAsDataUri(file);
      const img = await ensureImage(uri);
      const base = (file.name || 'sprite').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_').toLowerCase() || 'sprite';
      if (!state.family) { state.families.props = blankDoc('props'); state.family = 'props'; }
      const doc = familyName();
      let name = base, k = 1;
      while (doc.textures[name]) name = base + '_' + (++k);
      const ops = imageToOps(img.data, img.w, img.h);
      doc.textures[name] = {size: [img.w, img.h], params: {}, ops};
      state.current = name;
      renderAll();
      status(`Added ${name} (${img.w}×${img.h}) as ${plural(ops.length, 'rect op', 'rect ops')}, ${Math.round(opBytes(ops) / 1024 * 10) / 10} KB.`, 'good');
    } catch (e) { status(e.message, 'bad'); }
  }

  // ===================================================================
  // Pixel editor
  // ===================================================================
  const ED = {
    data: null, w: 0, h: 0, base: null, baseW: 0, baseH: 0, zoom: 8, tool: 'pencil', size: 1,
    color: {r: 255, g: 255, b: 255, a: 255},
    undo: [], redo: [], recent: [],
    start: null, snapshot: null, strokeErase: false,
  };
  const ED_LIMIT = 24;

  const edIdx = (x, y) => (y * ED.w + x) * 4;
  function edEnsure(w, hpx) {
    w = Math.max(1, Math.min(256, Math.round(w)));
    hpx = Math.max(1, Math.min(256, Math.round(hpx)));
    if (ED.data && ED.w === w && ED.h === hpx) return;
    const next = new Uint8ClampedArray(w * hpx * 4);
    if (ED.data) {
      const cw = Math.min(w, ED.w), ch = Math.min(hpx, ED.h);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const from = (y * ED.w + x) * 4, to = (y * w + x) * 4;
        next[to] = ED.data[from]; next[to + 1] = ED.data[from + 1];
        next[to + 2] = ED.data[from + 2]; next[to + 3] = ED.data[from + 3];
      }
    }
    ED.data = next; ED.w = w; ED.h = hpx;
    ED.undo = []; ED.redo = [];
    $('edW').value = w; $('edH').value = hpx;
  }
  function edClearBuffer() {
    ED.data = null; ED.base = null; ED.undo = []; ED.redo = [];
    $('edLoad').disabled = false;
  }
  function edClear() {
    const tex = texDoc();
    const w = tex && tex.size ? tex.size[0] : 9;
    const hpx = tex && tex.size ? tex.size[1] : 9;
    ED.data = new Uint8ClampedArray(w * hpx * 4);
    ED.w = w; ED.h = hpx;
    ED.base = null;
    ED.undo = []; ED.redo = [];
    $('edW').value = w; $('edH').value = hpx;
    edRender();
    status(`Cleared a ${w}×${hpx} canvas.`, '');
  }
  function edLoadSprite() {
    if (!state.current) { status('Select a sprite first.', 'bad'); return; }
    try {
      const t = TEX.render(state.family, state.current, testParams(), 'edload' + (state.rev++));
      const g = t.canvas.getContext('2d');
      const img = g.getImageData(0, 0, t.canvas.width, t.canvas.height);
      ED.w = img.width; ED.h = img.height;
      ED.data = new Uint8ClampedArray(img.data);
      ED.base = new Uint8ClampedArray(img.data);
      ED.baseW = ED.w; ED.baseH = ED.h;
      ED.undo = []; ED.redo = [];
      $('edW').value = ED.w; $('edH').value = ED.h;
      edFitZoom();
      edRender();
      status(`Loaded ${state.current} (${ED.w}×${ED.h}) into the pixel editor.`, 'good');
    } catch (e) { status('Could not load the sprite: ' + e.message, 'bad'); }
  }
  function edFitZoom() {
    const avail = Math.max(120, Math.min(360, innerWidth * 0.3));
    ED.zoom = Math.max(1, Math.min(24, Math.floor(avail / Math.max(ED.w, ED.h))));
    $('edZoom').value = ED.zoom;
  }
  function edPushUndo() {
    if (!ED.data) return;
    ED.undo.push(new Uint8ClampedArray(ED.data));
    if (ED.undo.length > ED_LIMIT) ED.undo.shift();
    ED.redo.length = 0;
  }
  function edUndo() {
    if (!ED.undo.length) return;
    ED.redo.push(new Uint8ClampedArray(ED.data));
    ED.data = ED.undo.pop();
    edRender();
  }
  function edRedo() {
    if (!ED.redo.length) return;
    ED.undo.push(new Uint8ClampedArray(ED.data));
    ED.data = ED.redo.pop();
    edRender();
  }

  function edSet(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= ED.w || y >= ED.h) return;
    const o = edIdx(x, y);
    ED.data[o] = r; ED.data[o + 1] = g; ED.data[o + 2] = b; ED.data[o + 3] = a;
  }
  function edStamp(x, y, erase) {
    const {r, g, b, a} = ED.color;
    const half = (ED.size - 1) >> 1;
    for (let dy = 0; dy < ED.size; dy++) for (let dx = 0; dx < ED.size; dx++) {
      const px = x - half + dx, py = y - half + dy;
      if (ED.tool === 'dither' && !erase) {
        if (((px + py) & 1) !== 0) continue;
        edSet(px, py, r, g, b, a);
      } else if (ED.tool === 'eraser' || erase) edSet(px, py, 0, 0, 0, 0);
      else edSet(px, py, r, g, b, a);
    }
  }
  function edFill(x, y, erase) {
    if (x < 0 || y < 0 || x >= ED.w || y >= ED.h) return;
    const o = edIdx(x, y);
    const target = [ED.data[o], ED.data[o + 1], ED.data[o + 2], ED.data[o + 3]];
    const {r, g, b, a} = erase ? {r: 0, g: 0, b: 0, a: 0} : ED.color;
    if (target[0] === r && target[1] === g && target[2] === b && target[3] === a) return;
    const stack = [[x, y]];
    const seen = new Uint8Array(ED.w * ED.h);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= ED.w || cy >= ED.h) continue;
      const p = cy * ED.w + cx;
      if (seen[p]) continue;
      const q = p * 4;
      if (ED.data[q] !== target[0] || ED.data[q + 1] !== target[1] || ED.data[q + 2] !== target[2] || ED.data[q + 3] !== target[3]) continue;
      seen[p] = 1;
      ED.data[q] = r; ED.data[q + 1] = g; ED.data[q + 2] = b; ED.data[q + 3] = a;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  function edLine(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      edStamp(x0, y0, ED.strokeErase);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function edRect(x0, y0, x1, y1, outline) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const {r, g, b, a} = ED.color;
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
      if (outline && x !== ax && x !== bx && y !== ay && y !== by) continue;
      if (ED.strokeErase) edSet(x, y, 0, 0, 0, 0);
      else edSet(x, y, r, g, b, a);
    }
  }
  function edPick(x, y) {
    if (x < 0 || y < 0 || x >= ED.w || y >= ED.h) return;
    const o = edIdx(x, y);
    ED.color = {r: ED.data[o], g: ED.data[o + 1], b: ED.data[o + 2], a: ED.data[o + 3]};
    edSyncColor();
    status(`Picked rgba(${ED.color.r},${ED.color.g},${ED.color.b},${ED.color.a}).`, '');
  }
  function edSyncColor() {
    const {r, g, b, a} = ED.color;
    const hex = '#' + hex2(r) + hex2(g) + hex2(b);
    $('edColor').value = hex;
    $('edAlpha').value = a;
    $('edAlphaValue').textContent = a;
    $('edHex').value = a === 255 ? hex : hex + hex2(a);
    $('edSwatch').firstElementChild.style.background = `rgba(${r},${g},${b},${a / 255})`;
  }
  function edParseHex(text) {
    const m = /^#?([0-9a-f]{3,8})$/i.exec(String(text || '').trim());
    if (!m) return false;
    let v = m[1];
    if (v.length === 3) v = v.split('').map(c => c + c).join('');
    if (v.length === 4) v = v.split('').map(c => c + c).join('');
    if (v.length !== 6 && v.length !== 8) return false;
    ED.color = {
      r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16),
      a: v.length === 8 ? parseInt(v.slice(6, 8), 16) : 255,
    };
    edSyncColor();
    return true;
  }
  function edRememberColor() {
    const c = Object.assign({}, ED.color);
    const key = colorString(c.r, c.g, c.b, c.a);
    ED.recent = ED.recent.filter(o => colorString(o.r, o.g, o.b, o.a) !== key);
    ED.recent.unshift(c);
    ED.recent = ED.recent.slice(0, 16);
    edRenderRecent();
  }
  function edRenderRecent() {
    const box = $('edRecent');
    box.replaceChildren(...ED.recent.map(c => {
      const css = colorString(c.r, c.g, c.b, c.a);
      return h('button', {title: css, style: `background:${css}`, onclick: () => {
        ED.color = Object.assign({}, c);
        edSyncColor();
      }});
    }));
  }

  function edRender() {
    const cv = $('pixelCanvas');
    if (!ED.data) {
      cv.width = 90; cv.height = 90;
      const g = cv.getContext('2d');
      g.clearRect(0, 0, 90, 90);
      return;
    }
    const z = ED.zoom;
    cv.width = ED.w * z; cv.height = ED.h * z;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < cv.height; y += z) for (let x = 0; x < cv.width; x += z) {
      g.fillStyle = (((x / z) + (y / z)) & 1) ? '#1b2233' : '#151a27';
      g.fillRect(x, y, z, z);
    }
    const tmp = document.createElement('canvas');
    tmp.width = ED.w; tmp.height = ED.h;
    const tg = tmp.getContext('2d');
    const img = tg.createImageData(ED.w, ED.h);
    img.data.set(ED.data);
    tg.putImageData(img, 0, 0);
    g.drawImage(tmp, 0, 0, cv.width, cv.height);
    if (z >= 6) {
      g.strokeStyle = 'rgba(255,255,255,.08)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= ED.w; x++) { g.moveTo(x * z + .5, 0); g.lineTo(x * z + .5, cv.height); }
      for (let y = 0; y <= ED.h; y++) { g.moveTo(0, y * z + .5); g.lineTo(cv.width, y * z + .5); }
      g.stroke();
    }
  }

  function edCell(e) {
    const cv = $('pixelCanvas');
    const r = cv.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - r.left) / r.width * ED.w),
      y: Math.floor((e.clientY - r.top) / r.height * ED.h),
    };
  }
  // Only the pixels that differ from the render the canvas was loaded from.
  // Erasures become `clear` ops, so an op tree full of ifs can be patched
  // without being flattened.
  function patchFromBase(data, w, h, base, bw, bh) {
    const add = new Uint8ClampedArray(w * h * 4);
    const cut = new Uint8ClampedArray(w * h * 4);
    const same = (i, r, g, b, a) => {
      if (!base || i >= bw * bh) return false;
      const o = i * 4;
      return base[o] === r && base[o + 1] === g && base[o + 2] === b && base[o + 3] === a;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
      if (same(i, r, g, b, a)) continue;
      if (a === 0) { cut[o] = cut[o + 1] = cut[o + 2] = cut[o + 3] = 255; }
      else { add[o] = r; add[o + 1] = g; add[o + 2] = b; add[o + 3] = a; }
    }
    const clears = imageToOps(cut, w, h).map(op => ({op: 'clear', x: op.x, y: op.y, w: op.w, h: op.h}));
    return [...clears, ...imageToOps(add, w, h)];
  }
  function edApply() {
    const tex = texDoc();
    if (!tex) { status('Select a sprite first.', 'bad'); return; }
    if (!ED.data) { status('Load or clear a canvas first.', 'bad'); return; }
    const mode = ($('edApplyMode') && $('edApplyMode').value) || 'patch';
    const flat = imageToOps(ED.data, ED.w, ED.h);
    tex.size = [ED.w, ED.h];
    let applied = flat, how = 'replaced';
    if (mode === 'patch') {
      if (!ED.base) { status('Use “Ops → pixels” first so there is a baseline to patch.', 'bad'); return; }
      const patch = patchFromBase(ED.data, ED.w, ED.h, ED.base, ED.baseW, ED.baseH);
      if (!patch.length) { status('No pixels changed, so the ops were left alone.', ''); return; }
      tex.ops = [...(tex.ops || []), ...patch];
      applied = patch; how = 'patched';
    } else {
      tex.ops = flat;
    }
    ED.base = new Uint8ClampedArray(ED.data); ED.baseW = ED.w; ED.baseH = ED.h;
    renderOps(); renderTextureSettings(); renderLibrary(); preview();
    status(`${how} ${ED.w}×${ED.h} with ${plural(applied.length, 'op', 'ops')} (${Math.round(opBytes(applied) / 1024 * 10) / 10} KB).`, 'good');
  }

  // -------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------
  $('familySelect').addEventListener('change', e => selectFamily(e.target.value));
  $('newFamily').addEventListener('click', () => {
    let name = 'props', k = 1;
    while (state.families[name]) name = 'family' + (++k);
    state.families[name] = blankDoc(name);
    state.family = name;
    state.current = null;
    renderAll();
    status('New family. Add a sprite to start painting.', 'good');
  });
  $('addTexForm').addEventListener('submit', e => {
    e.preventDefault();
    const doc = familyName();
    if (!doc) { status('Create or import a family first.', 'bad'); return; }
    const input = $('addTexName');
    const name = (input.value || '').trim().replace(/[^A-Za-z0-9_]/g, '_') || 'texture';
    if (doc.textures[name]) { status('"' + name + '" already exists.', 'bad'); return; }
    doc.textures[name] = blankTexture();
    state.current = name;
    input.value = '';
    renderAll();
  });
  $('newBlankSprite').addEventListener('click', addBlankSprite);
  $('opToPixels').addEventListener('click', () => { edLoadSprite(); setTab('pixels'); });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', e => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length) importFiles(files);
  });
  $('newSprite').addEventListener('click', () => $('spriteFile').click());
  $('spriteFile').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) newSprite(file);
  });
  $('bakeAll').addEventListener('click', bakeAllPngs);
  $('download').addEventListener('click', download);
  $('copy').addEventListener('click', async () => {
    const doc = familyName();
    if (!doc) return;
    try { await navigator.clipboard.writeText(toJSONC(doc)); status('Copied the .texture text.', 'good'); }
    catch (e) { status('Clipboard blocked by the browser. Use Download instead.', 'bad'); }
  });
  $('zoom').addEventListener('input', e => { state.scale = +e.target.value; preview(); });
  $('showGrid').addEventListener('change', e => { state.grid = e.target.checked; preview(); });
  $('showMarks').addEventListener('change', e => { state.marks = e.target.checked; preview(); });
  $('addDef').addEventListener('click', () => {
    const doc = familyName();
    if (!doc) return;
    doc.defs = doc.defs || {};
    let n = 'def', k = 1;
    while (Object.prototype.hasOwnProperty.call(doc.defs, n)) n = 'def' + (++k);
    doc.defs[n] = '#ffffff';
    renderDefs(); preview();
  });
  for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => setTab(b.dataset.tab));

  // Pixel editor wiring
  for (const b of document.querySelectorAll('#edTools button')) b.addEventListener('click', () => {
    ED.tool = b.dataset.tool;
    for (const o of document.querySelectorAll('#edTools button')) o.classList.toggle('on', o === b);
  });
  $('edColor').addEventListener('input', e => edParseHex(e.target.value));
  $('edHex').addEventListener('change', e => { if (!edParseHex(e.target.value)) status('Use #rgb, #rrggbb or #rrggbbaa.', 'bad'); });
  $('edAlpha').addEventListener('input', e => {
    ED.color.a = +e.target.value;
    $('edAlphaValue').textContent = ED.color.a;
    edSyncColor();
  });
  $('edSize').addEventListener('input', e => { ED.size = +e.target.value; $('edSizeValue').textContent = ED.size; });
  $('edAddSwatch').addEventListener('click', edRememberColor);
  $('edUndo').addEventListener('click', edUndo);
  $('edRedo').addEventListener('click', edRedo);
  $('edLoad').addEventListener('click', edLoadSprite);
  $('edClear').addEventListener('click', edClear);
  $('edApply').addEventListener('click', edApply);
  $('edResize').addEventListener('click', () => {
    const w = Math.round(Number($('edW').value)), hpx = Math.round(Number($('edH').value));
    if (!Number.isFinite(w) || !Number.isFinite(hpx) || w < 1 || hpx < 1 || w > 256 || hpx > 256) {
      status('Sizes go from 1 to 256.', 'bad'); return;
    }
    if (!ED.data) ED.data = new Uint8ClampedArray(w * hpx * 4);
    edEnsure(w, hpx);
    edFitZoom();
    edRender();
  });
  $('edZoom').addEventListener('input', e => { ED.zoom = +e.target.value; edRender(); });

  const pcv = $('pixelCanvas');
  pcv.addEventListener('contextmenu', e => e.preventDefault());
  pcv.addEventListener('pointerdown', e => {
    if (!ED.data) { status('Click “Load sprite” or “Clear” to start a canvas.', 'bad'); return; }
    e.preventDefault();
    pcv.setPointerCapture(e.pointerId);
    const c = edCell(e);
    if (ED.tool === 'pick') { edPick(c.x, c.y); return; }
    ED.strokeErase = e.button === 2 || e.buttons === 2;
    edPushUndo();
    ED.start = {x: c.x, y: c.y};
    ED.moved = false;
    ED.snapshot = new Uint8ClampedArray(ED.data);
    if (ED.tool === 'fill') { edFill(c.x, c.y, ED.strokeErase); edRender(); }
    else if (ED.tool === 'line' || ED.tool === 'rect' || ED.tool === 'frame') { /* wait for move */ }
    else edStamp(c.x, c.y, ED.strokeErase);
    edRender();
  });
  pcv.addEventListener('pointermove', e => {
    if (!ED.start || !ED.data) return;
    const c = edCell(e);
    if (c.x !== ED.start.x || c.y !== ED.start.y) ED.moved = true;
    if (ED.tool === 'line' || ED.tool === 'rect' || ED.tool === 'frame') {
      ED.data.set(ED.snapshot);
      if (ED.tool === 'line') edLine(ED.start.x, ED.start.y, c.x, c.y);
      else edRect(ED.start.x, ED.start.y, c.x, c.y, ED.tool === 'frame');
    } else if (ED.tool !== 'fill') {
      const last = ED.last || ED.start;
      if (last.x !== c.x || last.y !== c.y) edLine(last.x, last.y, c.x, c.y);
      ED.last = c;
    }
    edRender();
  });
  pcv.addEventListener('pointerup', () => {
    if (ED.start && !ED.moved && (ED.tool === 'line' || ED.tool === 'rect' || ED.tool === 'frame')) {
      ED.data.set(ED.snapshot);
      if (ED.tool === 'line') edStamp(ED.start.x, ED.start.y, ED.strokeErase);
      else edRect(ED.start.x, ED.start.y, ED.start.x, ED.start.y, ED.tool === 'frame');
    }
    edRender();
    ED.start = null; ED.snapshot = null; ED.last = null; ED.moved = false;
  });
  pcv.addEventListener('pointercancel', () => { ED.start = null; ED.snapshot = null; ED.last = null; ED.moved = false; });

  addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) edRedo(); else edUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); edRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); download(); return; }
    if (state.tab !== 'pixels') return;
    const k = e.key.toLowerCase();
    const tool = {b: 'pencil', e: 'eraser', d: 'dither', g: 'fill', l: 'line', r: 'rect', f: 'frame', i: 'pick'}[k];
    if (!tool) return;
    ED.tool = tool;
    for (const b of document.querySelectorAll('#edTools button')) b.classList.toggle('on', b.dataset.tool === tool);
  });

  // -------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------
  const sources = window.TEXTURE_SOURCES || {};
  for (const fam of Object.keys(sources)) {
    try {
      const doc = TEX.parse(sources[fam]);
      doc.name = doc.name || fam;
      state.families[fam] = doc;
    } catch (e) {
      state.errors.push(fam + ': ' + e.message);
    }
  }
  if (!Object.keys(state.families).length) state.families.props = blankDoc('props');
  state.family = Object.keys(state.families).sort()[0];
  state.current = Object.keys(state.families[state.family].textures)[0] || null;
  edSyncColor();
  edRenderRecent();
  renderAll();
  ensureAllImages();

  if (!Object.keys(sources).length) {
    status('No texture files were embedded in this build. Import a .texture, or start a new family.', '');
  } else {
    status('Loaded ' + plural(Object.keys(sources).length, 'family', 'families') + ' from textures/.', 'good');
  }
})();
