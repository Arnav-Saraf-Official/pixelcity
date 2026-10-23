'use strict';
// =====================================================================
// Texture Studio
//
// A visual editor for .texture files. The engine (js/texture.js) does the
// real work: this file only builds documents, validates them with
// TEX.validate and renders them with TEX.render. Whatever is downloaded is
// the same JSONC the build would have read from textures/*.texture.
//
// Build: node scripts/build.mjs -> dist/textures/index.html (route /textures)
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    families: Object.create(null),   // family name -> pristine doc
    family: null,
    current: null,
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
        else if (k === 'checked' || k === 'disabled' || k === 'selected') n[k] = !!v;
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
      const n = Number(inp.value);
      if (!Number.isFinite(n) || inp.value === '') { inp.classList.remove('invalid'); onChange(undefined); return; }
      inp.classList.add('valid'); onChange(n);
    };
    inp.addEventListener('change', commit);
    return inp;
  }
  function field(label, control, hint) {
    const wrap = h('div', {class: 'field'}, h('label', null, label), control);
    if (hint) wrap.append(h('div', {class: 'hint'}, hint));
    return wrap;
  }

  // Key/value editor: keys are plain strings, values are expressions.
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
        const row = h('div', {class: 'pair'},
          keyIn,
          exprInput(obj[key], v => {
            if (v === undefined) delete obj[key]; else obj[key] = v;
            onChange();
          }),
          h('button', {class: 'danger', title: 'Remove', onclick: () => { delete obj[key]; onChange(); render(); }}, '✕')
        );
        box.append(row);
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
  function blankDoc(name) {
    return {format: 'texture/1', name, tile: 9, defs: {}, textures: {}};
  }
  function blankTexture() {
    return {size: [9, 9], params: {}, ops: []};
  }
  const familyName = () => (state.family ? state.families[state.family] : null);
  const texDoc = () => {
    const doc = familyName();
    return doc && state.current ? doc.textures[state.current] : null;
  };
  const testKey = () => state.family + '/' + state.current;

  function parseSource(text) {
    return TEX.parse(text);
  }

  // -------------------------------------------------------------------
  // Op schema — mirrors DRAW in js/texture.js
  // -------------------------------------------------------------------
  const OP_FIELDS = {
    rect: ['x', 'y', 'w', 'h', 'color'],
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
  // PNG
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
    for (const fam of Object.keys(state.families)) {
      const walk = (ops) => {
        for (const op of ops || []) {
          if (!op) continue;
          if (op.op === 'png' && typeof op.src === 'string' && op.src.startsWith('data:')) uris.add(op.src);
          if (op.ops) walk(op.ops);
          if (op.then) walk(op.then);
          if (op.else) walk(op.else);
        }
      };
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
          problems.push(fam + ': "' + src + '" is a file path. Preview can only show embedded PNGs — upload it instead.');
        }
      }
      if (op) { resolvePng(op.ops, fam, images, problems); resolvePng(op.then, fam, images, problems); resolvePng(op.else, fam, images, problems); }
    }
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
  // The engine passes those in (art.js hands the dock a real wet mask), so the
  // editor needs a stand-in to preview them.
  function callbackParams(doc, tex) {
    const out = new Set();
    const scan = v => {
      if (Array.isArray(v)) {
        if (v[0] === 'fn' && typeof v[1] === 'string') {
          if (!TEX.TEX_OPS[v[1]]) out.add(v[1]);
        }
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
    if (!doc || !tex) { $('errors').replaceChildren(); return; }
    if (!state.current) return;

    const files = {};
    for (const fam of Object.keys(state.families)) files[fam] = clone(state.families[fam]);
    try {
      errs.push(...TEX.validate(files));
    } catch (e) { errs.push(e.message); }

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
    try {
      rendered = TEX.render(state.family, state.current, testParams(), 'editor' + (state.rev++));
    } catch (e) {
      errs.push(e.message);
    }

    $('errors').replaceChildren(...errs.slice(0, 14).map(e => h('div', {class: 'err'}, e)));
    if (rendered) draw(rendered);
    else { const cv = $('preview'); const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); }

    if (state.current) {
      const n = `${state.family}.texture › ${state.current}`;
      $('stageTitle').textContent = n + '  ·  ' + tex.size[0] + '×' + tex.size[1] + ' px';
    }
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
    // checkerboard so transparency is obvious
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
    const sel = $('familySelect');
    sel.replaceChildren(...Object.keys(state.families).sort().map(f =>
      h('option', {value: f, selected: f === state.family}, f)));
    const doc = familyName();
    const list = $('textureList');
    list.replaceChildren();
    if (!doc) return;
    for (const name of Object.keys(doc.textures)) {
      const d = doc.textures[name];
      const size = d.size ? d.size[0] + '×' + d.size[1] : 'inherited';
      list.append(h('button', {class: name === state.current ? 'on' : '', onclick: () => selectTexture(name)},
        h('span', null, name), h('span', {class: 'meta'}, size)));
    }
    if (!Object.keys(doc.textures).length) list.append(h('small', null, 'No textures yet.'));
  }

  function renderFamilySettings() {
    const doc = familyName(), box = $('familySettings');
    if (!doc) { box.replaceChildren(); return; }
    box.replaceChildren(
      field('file name', textInput(doc.name, v => renameFamily(v)), 'textures/<name>.texture'),
      field('tile', numberInput(doc.tile, v => { if (v) { doc.tile = v; preview(); renderTextureSettings(); } }), 'art pixels per tile (usually 9)'),
      h('div', {class: 'row'}, h('button', {class: 'danger', onclick: deleteFamily}, 'Delete family'))
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
        h('button', {class: 'danger', onclick: () => { delete doc.defs[key]; preview(); renderDefs(); }}, '✕')
      ));
    }
  }

  function renderTextureSettings() {
    const doc = familyName(), tex = texDoc(), box = $('texSettings');
    if (!doc || !tex) { box.replaceChildren(); return; }
    const nameIn = textInput(state.current, v => renameTexture(v));
    const wIn = numberInput(tex.size ? tex.size[0] : undefined, v => { if (!tex.size) tex.size = [9, 9]; if (v) tex.size[0] = v; preview(); });
    const hIn = numberInput(tex.size ? tex.size[1] : undefined, v => { if (!tex.size) tex.size = [9, 9]; if (v) tex.size[1] = v; preview(); });
    box.replaceChildren(
      h('div', {class: 'settings'},
        h('h2', null, 'Texture'),
        field('name', nameIn),
        field('size', h('div', {class: 'row'}, wIn, h('span', null, '×'), hIn), 'omit when inheriting via extends'),
        field('extends', textInput(tex.extends, v => { if (v) tex.extends = v; else delete tex.extends; preview(); }), 'other texture, or "family:name"'),
        h('div', {class: 'row'},
          h('button', {onclick: duplicateTexture}, 'Duplicate'),
          h('button', {class: 'danger', onclick: deleteTexture}, 'Delete'))
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
    if (!Object.keys(params).length) {
      box.append(h('small', null, 'This texture takes no parameters.'));
    }
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

  function selectFamily(fam) {
    if (!state.families[fam]) return;
    state.family = fam;
    const names = Object.keys(state.families[fam].textures);
    state.current = names[0] || null;
    renderAll();
  }
  function selectTexture(name) {
    state.current = name;
    renderAll();
  }
  function renderAll() {
    renderLibrary();
    renderFamilySettings();
    renderTextureSettings();
    renderOps();
    preview();
  }

  // -------------------------------------------------------------------
  // Ops editor
  // -------------------------------------------------------------------
  function renderOps() {
    const tex = texDoc(), box = $('opEditor');
    box.replaceChildren();
    if (!tex) return;
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
      h('button', {onclick: () => {
        ops.push(clone(OP_DEFAULTS[sel.value]));
        refresh(); preview();
      }}, '+ op'));
  }

  function opCard(op, index, arr, refresh) {
    const head = h('header', null,
      h('span', {class: 'kind'}, op.op),
      h('button', {title: 'Move up', onclick: () => { if (index > 0) { [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]; refresh(); preview(); } }}, '↑'),
      h('button', {title: 'Move down', onclick: () => { if (index < arr.length - 1) { [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]]; refresh(); preview(); } }}, '↓'),
      h('button', {title: 'Duplicate', onclick: () => { arr.splice(index + 1, 0, clone(op)); refresh(); preview(); }}, '⧉'),
      h('button', {class: 'danger', title: 'Delete', onclick: () => { arr.splice(index, 1); refresh(); preview(); }}, '✕')
    );
    const body = h('div', {class: 'body'});
    const fields = OP_FIELDS[op.op] || [];
    for (const f of fields) body.append(opField(op, f, refresh));

    if (op.op === 'each' || op.op === 'repeat') {
      op.ops = op.ops || [];
      body.append(h('div', {class: 'sub-label'}, 'inside'), opsEditor(op.ops, refresh));
    } else if (op.op === 'if') {
      op.then = op.then || []; op.else = op.else || [];
      body.append(h('div', {class: 'sub-label'}, 'then'), opsEditor(op.then, refresh));
      body.append(h('div', {class: 'sub-label'}, 'else'), opsEditor(op.else, refresh));
    }
    return h('div', {class: 'op'}, head, body);
  }

  function opField(op, f, refresh) {
    if (f === 'src') return field('png', pngControl(op, refresh));
    if (PAIR_FIELDS.has(f)) {
      op[f] = op[f] || {};
      return field(f, pairsEditor(op[f], () => preview()), f === 'params' ? 'passed to the used texture' : 'arguments for the capability');
    }
    if (RAW_FIELDS.has(f)) {
      return field(f, textInput(op[f], v => {
        if (!v) delete op[f]; else op[f] = v;
        preview(); refresh();
      }));
    }
    if (f === 'of' || f === 'at') {
      return field(f, exprInput(op[f], v => { if (v === undefined) delete op[f]; else op[f] = v; preview(); }), 'a list of points, e.g. [[1,2],[3,4]]');
    }
    if (f === 'alpha') {
      return field(f, exprInput(op[f], v => { if (v === undefined) delete op[f]; else op[f] = v; }), '0–1');
    }
    return field(f, exprInput(op[f], v => { if (v === undefined) delete op[f]; else op[f] = v; preview(); }));
  }

  function pngControl(op, refresh) {
    const box = h('div', {class: 'pngbox'});
    const render = () => {
      box.replaceChildren();
      if (op.src && op.src.startsWith('data:')) {
        const km = Math.round((op.src.length * 3 / 4) / 1024);
        box.append(h('div', {class: 'row'},
          h('img', {class: 'thumb', src: op.src, alt: ''}),
          h('span', {class: 'grow'}, h('small', null, 'embedded · ' + km + ' KB')),
          h('button', {class: 'danger', onclick: () => { delete op.src; render(); preview(); }}, 'Remove')
        ));
      } else if (op.src) {
        box.append(h('div', {class: 'row'}, h('small', null, op.src),
          h('button', {class: 'danger', onclick: () => { delete op.src; render(); preview(); }}, 'Remove')));
      } else {
        box.append(h('small', null, 'No image yet.'));
      }
      const input = h('input', {type: 'file', accept: 'image/png,image/*', hidden: true});
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        try {
          const uri = await readAsDataUri(file);
          await ensureImage(uri);
          op.src = uri;
          render(); preview();
        } catch (e) { status(e.message, 'bad'); }
      });
      box.append(h('button', {type: 'button', onclick: () => input.click()}, op.src ? 'Replace PNG…' : 'Upload PNG…'), input);
    };
    render();
    return box;
  }

  // -------------------------------------------------------------------
  // Item actions
  // -------------------------------------------------------------------
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
      if (doc.textures[name]) { status('A texture called "' + name + '" already exists.', 'bad'); renderTextureSettings(); return; }
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
  }

  function deleteTexture() {
    const doc = familyName();
    if (!doc || !state.current) return;
    if (!confirm('Delete texture "' + state.current + '"?')) return;
    delete doc.textures[state.current];
    state.current = Object.keys(doc.textures)[0] || null;
    renderAll();
  }

  function deleteFamily() {
    if (!state.family) return;
    if (!confirm('Delete the whole family "' + state.family + '"?')) return;
    delete state.families[state.family];
    const fam = Object.keys(state.families)[0];
    if (fam) { state.family = fam; state.current = Object.keys(state.families[fam].textures)[0] || null; renderAll(); }
    else { state.family = null; state.current = null; renderAll(); }
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
        const doc = parseSource(text);
        const fam = (doc.name || file.name.replace(/\.texture$/i, '') || 'imported').replace(/[^a-z0-9_-]/gi, '_');
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
      const base = (file.name || 'sprite').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
      if (!state.family) {
        state.families.props = blankDoc('props');
        state.family = 'props';
        state.current = null;
      }
      const doc = familyName();
      let name = base || 'sprite', k = 1;
      while (doc.textures[name]) name = base + '_' + (++k);
      doc.textures[name] = {size: [img.w, img.h], params: {}, ops: [{op: 'png', src: uri, x: 0, y: 0}]};
      state.current = name;
      renderAll();
      status('Added ' + name + ' (' + img.w + '×' + img.h + ') with an embedded PNG.', 'good');
    } catch (e) { status(e.message, 'bad'); }
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
    status('New family. Add a texture to start painting.', 'good');
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
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); download(); }
  });

  // -------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------
  const sources = window.TEXTURE_SOURCES || {};
  for (const fam of Object.keys(sources)) {
    try {
      const doc = parseSource(sources[fam]);
      doc.name = doc.name || fam;
      state.families[fam] = doc;
    } catch (e) {
      state.errors.push(fam + ': ' + e.message);
    }
  }
  if (!Object.keys(state.families).length) {
    state.families.props = blankDoc('props');
  }
  state.family = Object.keys(state.families).sort()[0];
  state.current = Object.keys(state.families[state.family].textures)[0] || null;
  renderAll();
  ensureAllImages();
  if (!Object.keys(sources).length) {
    status('No texture files were embedded in this build. Import a .texture, or start a new family.', '');
  } else {
    status('Loaded ' + Object.keys(sources).length + ' families from textures/.', 'good');
  }
})();
