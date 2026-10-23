'use strict';
// =====================================================================
// Textures: .texture documents (JSONC) -> cached canvases + marks
//
// A document holds a family of named textures. Each texture is a list of
// ops painting an RGBA image, with values taken from expression trees over
// the texture's params. There is no eval: expressions are nested arrays
// compiled to closures, so a malformed file fails the build, not the game.
//
// Ops that paint are pure functions of (params, defs, rng). Anything that
// needs game state or heavier maths is registered in TEX_OPS and reached
// from a file with { "op": "call", "fn": "name" } or ["fn", "name", ...].
//
// Load order: js/texture.js, js/textures.generated.js, then js/art.js.
// =====================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TEX = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORMAT = 'texture/1';
  const MAX_CACHE = 3000;
  const docs = Object.create(null);
  const images = Object.create(null);
  const cache = new Map();

  // ---------------------------------------------------------------------
  // Random / colour helpers (self-contained so Node can require this file)
  // ---------------------------------------------------------------------
  function hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function parseColor(c) {
    if (typeof c !== 'string') return [255, 0, 255, 255];
    if (c === 'transparent' || c === 'none') return [0, 0, 0, 0];
    if (c.charCodeAt(0) === 35 && c.length >= 4) {
      const h = c.slice(1);
      if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
      if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
      if (h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
    }
    if (c.slice(0, 5) === 'rgba(' || c.slice(0, 4) === 'rgb(') {
      const m = c.match(/[\d.]+/g) || [];
      return [+m[0] | 0, +m[1] | 0, +m[2] | 0, m[3] === undefined ? 255 : Math.round(+m[3] * 255)];
    }
    return [255, 0, 255, 255];
  }
  const hex2 = v => ('0' + clamp(v | 0, 0, 255).toString(16)).slice(-2);
  function rgbaStr(r, g, b, a) {
    return a >= 255 ? '#' + hex2(r) + hex2(g) + hex2(b)
      : 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (Math.round(a) / 255) + ')';
  }
  // Same contract as core.js shade(): shift every channel of a #rrggbb colour.
  function shade(c, amt) {
    const [r, g, b] = parseColor(c);
    return '#' + hex2(r + amt) + hex2(g + amt) + hex2(b + amt);
  }
  function mix(a, b, t) {
    const A = parseColor(a), B = parseColor(b);
    return rgbaStr(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, A[3] + (B[3] - A[3]) * t);
  }
  const rot90 = spr => spr.map(p => [-p[1], p[0], p[2]]);

  // ---------------------------------------------------------------------
  // JSONC: comments and trailing commas, so these files stay readable
  // ---------------------------------------------------------------------
  function stripJsonc(src) {
    let out = '', i = 0;
    const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (ch === '"') {
        out += ch; i++;
        while (i < n) {
          const k = src[i];
          out += k;
          if (k === '\\') { out += src[i + 1] || ''; i += 2; continue; }
          i++;
          if (k === '"') break;
        }
        continue;
      }
      if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      out += ch; i++;
    }
    return out.replace(/,(\s*[}\]])/g, '$1');
  }

  // ---------------------------------------------------------------------
  // Expression compiler
  // ---------------------------------------------------------------------
  const EXPR = {
    '+': a => a.reduce((s, v) => s + v, 0),
    '-': a => a.length > 1 ? a[0] - a[1] : -a[0],
    '*': a => a.reduce((s, v) => s * v, 1),
    '/': a => a[0] / a[1],
    '%': a => a[0] % a[1],
    '<': a => a[0] < a[1],
    '<=': a => a[0] <= a[1],
    '>': a => a[0] > a[1],
    '>=': a => a[0] >= a[1],
    '==': a => a[0] === a[1],
    '!=': a => a[0] !== a[1],
    and: a => a.every(Boolean),
    or: a => a.some(Boolean),
    not: a => !a[0],
    if: a => a[0] ? a[1] : a[2],
    mod: a => ((a[0] % a[1]) + a[1]) % a[1],
    mask: a => a[0] & a[1],
    bit: a => (a[0] >> a[1]) & 1,
    bits: a => (a[0] & 1) + (a[0] >> 1 & 1) + (a[0] >> 2 & 1) + (a[0] >> 3 & 1),
    floor: a => Math.floor(a[0]),
    ceil: a => Math.ceil(a[0]),
    round: a => Math.round(a[0]),
    abs: a => Math.abs(a[0]),
    min: a => Math.min.apply(null, a),
    max: a => Math.max.apply(null, a),
    pick: a => a[0][Math.floor(a[1] * a[0].length) % a[0].length],
    shade: a => shade(a[0], a[1]),
    mix: a => mix(a[0], a[1], a[2]),
    at: a => (a[0] == null ? undefined : a[0][a[1]]),
    len: a => a[0].length,
    range: a => { const r = []; for (let k = 0; k < a[0]; k++) r.push(k); return r; },
    rot: a => { let s = a[0]; for (let k = 0; k < a[1]; k++) s = rot90(s); return s; },
    // point rotation for lane arrows: direction 1=N 2=E 3=S 4=W on a 9x9 tile
    rotx: a => a[2] === 1 ? a[0] : a[2] === 2 ? 8 - a[1] : a[2] === 3 ? 8 - a[0] : a[1],
    roty: a => a[2] === 1 ? a[1] : a[2] === 2 ? a[0] : a[2] === 3 ? 8 - a[1] : 8 - a[0],
    default: a => (a[0] == null ? a[1] : a[0]),
    hash: a => hash(a[0], a[1], a[2]),
    noise: a => vnoise(a[0], a[1], a[2])
  };

  // Heads that read the render environment rather than compute a value.
  // They live outside EXPR because they need the env closure themselves.
  const ENV_HEADS = { param: 1, def: 1, var: 1, rnd: 1, fn: 1 };
  const isExpr = head => typeof head === 'string' &&
    (Object.prototype.hasOwnProperty.call(EXPR, head) || Object.prototype.hasOwnProperty.call(ENV_HEADS, head));

  function compile(node, where) {
    if (Array.isArray(node)) {
      const head = node[0];
      if (isExpr(head)) {
        if (head === 'param') {
          const name = node[1];
          return env => {
            if (Object.prototype.hasOwnProperty.call(env.p, name)) return env.p[name];
            if (name in env.locals) return env.locals[name];
            // implicit locals: w, h, tw, th, ox, oy
            if (name in env && name !== 'p' && name !== 'd' && name !== 'locals' && name !== 'imp') return env[name];
            if (Object.prototype.hasOwnProperty.call(env.imp, name)) return env.imp[name];
            return undefined;
          };
        }
        if (head === 'def') {
          const name = node[1];
          return env => env.d[name];
        }
        if (head === 'var') {
          const name = node[1];
          return env => env.locals[name];
        }
        if (head === 'rnd') return env => env.rng();
        if (head === 'fn') {
          const name = node[1], args = node.slice(2).map(a => compile(a, where));
          return env => {
            const f = env.p[name] || TEX_OPS[name];
            if (typeof f !== 'function') throw new Error('unknown fn "' + name + '" in ' + where);
            return f.apply(null, args.map(g => g(env)));
          };
        }
        const op = EXPR[head];
        const args = node.slice(1).map(a => compile(a, where));
        return env => op(args.map(g => g(env)));
      }
      // a plain literal list (a palette, a point, a list of pixel triples)
      const items = node.map(a => compile(a, where));
      return () => items.map(g => g());
    }
    if (node && typeof node === 'object') {
      const keys = Object.keys(node);
      const fns = keys.map(k => compile(node[k], where));
      return env => { const o = {}; for (let k = 0; k < keys.length; k++) o[keys[k]] = fns[k](env); return o; };
    }
    return () => node;
  }

  // ---------------------------------------------------------------------
  // Drawing backends
  // ---------------------------------------------------------------------
  function canvasBackend(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    const tmp = new Map();
    return {
      canvas: cv,
      fillRect(x, y, ww, hh, color) {
        if (color === 'transparent' || ww <= 0 || hh <= 0) return;
        g.fillStyle = color;
        g.fillRect(x, y, ww, hh);
      },
      blit(img, x, y, alpha) {
        let c = tmp.get(img);
        if (!c) {
          c = document.createElement('canvas');
          c.width = img.w; c.height = img.h;
          const cg = c.getContext('2d');
          cg.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
          tmp.set(img, c);
        }
        if (alpha !== undefined && alpha !== 1) g.globalAlpha = alpha;
        g.drawImage(c, x, y);
        if (alpha !== undefined && alpha !== 1) g.globalAlpha = 1;
      }
    };
  }

  // Software rasteriser: same op semantics, no DOM. Used by the CLI so
  // textures can be exported and diffed outside a browser.
  function bufferBackend(w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    // Source-over with straight (non-premultiplied) colour, matching canvas.
    // Multiplying the source by alpha here instead would darken translucent
    // art, and darken it again every time it is blitted.
    const blend = (x, y, r, g, b, a) => {
      if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
      const o = (y * w + x) * 4;
      const sa = a / 255, da = data[o + 3] / 255, oa = sa + da * (1 - sa);
      if (oa <= 0) { data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0; return; }
      const dk = da * (1 - sa) / oa, sk = sa / oa;
      data[o] = Math.round(r * sk + data[o] * dk);
      data[o + 1] = Math.round(g * sk + data[o + 1] * dk);
      data[o + 2] = Math.round(b * sk + data[o + 2] * dk);
      data[o + 3] = Math.round(oa * 255);
    };
    return {
      canvas: null, data, w, h,
      fillRect(x, y, ww, hh, color) {
        if (color === 'transparent' || ww <= 0 || hh <= 0) return;
        const [r, g, b, a] = parseColor(color);
        const x0 = Math.round(x), y0 = Math.round(y), x1 = x0 + Math.round(ww), y1 = y0 + Math.round(hh);
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) blend(xx, yy, r, g, b, a);
      },
      blit(img, x, y, alpha) {
        const src = img.data, k = alpha === undefined ? 1 : alpha;
        for (let yy = 0; yy < img.h; yy++) for (let xx = 0; xx < img.w; xx++) {
          const o = (yy * img.w + xx) * 4;
          blend(x + xx, y + yy, src[o], src[o + 1], src[o + 2], Math.round(src[o + 3] * k));
        }
      }
    };
  }

  // ---------------------------------------------------------------------
  // Ops. Each receives already-evaluated values; control-flow ops get the
  // compiled child lists plus `run`.
  // ---------------------------------------------------------------------
  const TEX_OPS = Object.create(null);

  const DRAW = {
    rect(a, env, be) { be.fillRect(a.x + env.ox, a.y + env.oy, a.w, a.h, a.color); },
    pixel(a, env, be) { be.fillRect(a.x + env.ox, a.y + env.oy, 1, 1, a.color); },
    line(a, env, be) {
      let x0 = a.x1 + env.ox, y0 = a.y1 + env.oy;
      const x1 = a.x2 + env.ox, y1 = a.y2 + env.oy;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        be.fillRect(x0, y0, 1, 1, a.color);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    png(a, env, be) {
      const img = images[a.ref] || a.image;
      if (!img) throw new Error('missing image ref "' + a.ref + '"');
      be.blit(img, a.x + env.ox, a.y + env.oy, a.alpha);
    },
    each(a, env, be, marks, run) {
      const list = a.in, had = Object.prototype.hasOwnProperty.call(env.locals, a.as);
      if (list == null) return;
      const prev = env.locals[a.as];
      for (let k = 0; k < list.length; k++) { env.locals[a.as] = list[k]; run(a.ops, env, be, marks); }
      if (had) env.locals[a.as] = prev; else delete env.locals[a.as];
    },
    repeat(a, env, be, marks, run) {
      const had = Object.prototype.hasOwnProperty.call(env.locals, a.as);
      const prev = env.locals[a.as], from = a.from || 0;
      for (let k = 0; k < a.times; k++) { env.locals[a.as] = from + k; run(a.ops, env, be, marks); }
      if (had) env.locals[a.as] = prev; else delete env.locals[a.as];
    },
    if(a, env, be, marks, run) {
      if (a.test) { if (a.then) run(a.then, env, be, marks); }
      else if (a.else) run(a.else, env, be, marks);
    },
    win(a, env, be, marks) {
      be.fillRect(a.x + env.ox, a.y + env.oy, 1, 1, a.color || '#2b3a4e');
      marks.win.push([a.x + env.ox, a.y + env.oy]);
    },
    park(a, env, be, marks) { marks.park.push([a.x + env.ox, a.y + env.oy, a.v ? 1 : 0]); },
    stat(a, env, be, marks) { marks.stat = [a.x + env.ox, a.y + env.oy]; },
    berth(a, env, be, marks) { if (!marks.berth) marks.berth = [a.x, a.y]; },
    spot(a, env, be, marks) { marks.spots.push([a.x + env.ox, a.y + env.oy]); },
    // mark only records a point; nothing is painted (visitors/lots/queues)
    mark(a, env, be, marks) {
      const list = a.as === 'park' ? marks.park : a.as === 'spots' ? marks.spots : marks.win;
      for (const p of a.of) list.push([p[0] + env.ox, p[1] + env.oy]);
    },
    spots(a, env, be, marks) { marks.spots = a.of.map(p => [p[0] + env.ox, p[1] + env.oy]); },
    // writes a param for later ops in the same render (first-match flags)
    set(a, env) { env.p[a.as] = a.value; },
    use(a, env, be, marks) {
      const file = a.file || env.__file;
      const sub = getDef(file, a.texture);
      const subEnv = makeEnv(sub.doc, sub.def, a.params || {}, env.__seed);
      subEnv.__file = file;
      subEnv.locals = Object.create(env.locals);
      subEnv.ox = env.ox + a.at[0];
      subEnv.oy = env.oy + a.at[1];
      subEnv.depth = env.depth + 1;
      if (subEnv.depth > 6) throw new Error('texture "use" nested too deeply');
      runOps(sub.def._compiled, subEnv, be, marks);
    },
    call(a, env, be, marks) {
      const f = TEX_OPS[a.fn];
      if (typeof f !== 'function') throw new Error('unknown call fn "' + a.fn + '"');
      f(be, env, a.args || {}, marks);
    }
  };

  function runOps(ops, env, be, marks) {
    for (let k = 0; k < ops.length; k++) {
      const n = ops[k], a = {};
      for (let j = 0; j < n.keys.length; j++) a[n.keys[j]] = n.fns[j](env);
      if (n.ops) a.ops = n.ops;
      if (n.then) a.then = n.then;
      if (n.else) a.else = n.else;
      n.impl(a, env, be, marks, runOps);
    }
  }

  function compileOps(rawOps, def) {
    return rawOps.map(raw => {
      const impl = DRAW[raw.op];
      if (!impl) throw new Error('unknown op "' + raw.op + '" in ' + def.__id);
      const keys = [], fns = [];
      for (const k of Object.keys(raw)) {
        if (k === 'op' || k === 'ops' || k === 'then' || k === 'else') continue;
        keys.push(k);
        fns.push(compile(raw[k], def.__id));
      }
      const node = { impl, keys, fns };
      if (raw.ops) node.ops = compileOps(raw.ops, def);
      if (raw.then) node.then = compileOps(raw.then, def);
      if (raw.else) node.else = compileOps(raw.else, def);
      return node;
    });
  }

  // ---------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------
  function define(files) { for (const k of Object.keys(files)) docs[k] = files[k]; }

  // Images arrive as {w,h,b64} from the build; hand-written code may pass
  // {w,h,data} directly.
  function unpackImage(v) {
    if (v && v.data && typeof v.data.length === 'number') return v;
    const bin = typeof atob === 'function'
      ? atob(v.b64)
      : Buffer.from(v.b64, 'base64').toString('binary');
    const arr = new Uint8ClampedArray(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return { w: v.w, h: v.h, data: arr };
  }
  function defineImages(map) { for (const k of Object.keys(map)) images[k] = unpackImage(map[k]); }

  function getDef(file, texName) {
    const doc = docs[file];
    if (!doc) throw new Error('unknown texture file "' + file + '"');
    const def = doc.textures && doc.textures[texName];
    if (!def) throw new Error('unknown texture "' + texName + '" in ' + file);
    prep(doc, def, file, texName);
    return { doc, def };
  }

  function prep(doc, def, file, name) {
    if (def._compiled) return def;
    def.__id = file + ':' + name;
    def.__file = file;
    if (def.extends) {
      const parts = def.extends.indexOf(':') >= 0 ? def.extends.split(':') : [file, def.extends];
      const parent = getDef(parts[0], parts[1]);
      if (!def.size) def.size = parent.def.size;
      if (!def._parentParams) def._parentParams = parent.def._params;
      if (!def.ops || !def.ops.length) def.ops = parent.def.ops;
    }
    def.size = def.size || [9, 9];
    def._params = compileParams(def.params || {}, def.__id);
    def._compiled = compileOps(def.ops || [], def);
    return def;
  }

  function compileParams(decl, where) {
    const keys = Object.keys(decl);
    return { keys, fns: keys.map(k => compile(decl[k], where)) };
  }

  function makeEnv(doc, def, params, seedOverride) {
    const p = {};
    if (params) for (const k of Object.keys(params)) if (params[k] !== undefined) p[k] = params[k];
    const seed = seedOverride !== undefined ? seedOverride : (p.seed !== undefined ? p.seed | 0 : 1);
    const env = {
      p, d: doc.defs || {}, locals: Object.create(null), imp: Object.create(null),
      rng: mulberry(seed),
      w: def.size[0], h: def.size[1],
      tw: def.size[0] / (doc.tile || 9), th: def.size[1] / (doc.tile || 9),
      ox: 0, oy: 0, depth: 0, __file: def.__file, __seed: seed
    };
    const run = cp => {
      for (let k = 0; k < cp.keys.length; k++) {
        const key = cp.keys[k];
        if (Object.prototype.hasOwnProperty.call(p, key)) continue;
        p[key] = cp.fns[k](env);
      }
    };
    run(def._params);
    if (def._parentParams) run(def._parentParams);
    return env;
  }

  // ---------------------------------------------------------------------
  // Render + cache
  // ---------------------------------------------------------------------
  function stableParams(params) {
    if (!params) return '';
    return Object.keys(params).filter(k => typeof params[k] !== 'function').sort()
      .map(k => k + '=' + JSON.stringify(params[k])).join('&');
  }

  function renderWith(file, texName, params, be) {
    const { doc, def } = getDef(file, texName);
    const env = makeEnv(doc, def, params);
    const marks = { win: [], park: [], stat: null, berth: null, spots: [] };
    runOps(def._compiled, env, be, marks);
    return marks;
  }

  function render(file, texName, params, keySuffix) {
    const { def } = getDef(file, texName);
    const ck = file + '|' + texName + '|' + (keySuffix != null ? keySuffix : stableParams(params));
    const hit = cache.get(ck);
    if (hit) { cache.delete(ck); cache.set(ck, hit); return hit; }
    const be = canvasBackend(def.size[0], def.size[1]);
    const marks = renderWith(file, texName, params, be);
    const out = { canvas: be.canvas, marks };
    cache.set(ck, out);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return out;
  }

  // Deterministic RGBA render with no DOM, for build/export/diff tooling.
  function renderBuffer(file, texName, params) {
    const { def } = getDef(file, texName);
    const be = bufferBackend(def.size[0], def.size[1]);
    const marks = renderWith(file, texName, params, be);
    return { w: be.w, h: be.h, data: be.data, marks };
  }

  function draw(ctx, file, texName, x, y, params, keySuffix) {
    const t = render(file, texName, params, keySuffix);
    ctx.drawImage(t.canvas, x, y);
    return t.marks;
  }

  const clear = () => cache.clear();

  // ---------------------------------------------------------------------
  // Static validation, run by the build so a bad file never ships
  // ---------------------------------------------------------------------
  const OPSET = Object.keys(DRAW);
  const IMPLICIT = ['w', 'h', 'tw', 'th', 'ox', 'oy'];

  function validate(files) {
    const errs = [];
    for (const file of Object.keys(files)) {
      const doc = files[file];
      if (doc.format !== FORMAT) errs.push(file + ': bad format "' + doc.format + '" (expected "' + FORMAT + '")');
      if (!doc.textures) { errs.push(file + ': no "textures" object'); continue; }
      const defs = doc.defs || {};
      for (const name of Object.keys(doc.textures)) {
        const def = doc.textures[name], where = file + ':' + name;
        if (!def.size && !def.extends) errs.push(where + ': missing size');
        if (!def.ops && !def.extends) errs.push(where + ': missing ops');
        const known = new Set(Object.keys(def.params || {}).concat(IMPLICIT));
        for (const k of Object.keys(def.params || {})) checkExpr(def.params[k], where + '.params.' + k, errs, known, defs, new Set());
        checkOps(def.ops || [], where, errs, known, defs, new Set(), files);
      }
    }
    return errs;
  }

  function checkOps(ops, where, errs, known, defs, scope, files) {
    if (!Array.isArray(ops)) { errs.push(where + ': ops is not a list'); return; }
    for (const op of ops) {
      if (!op || typeof op.op !== 'string') { errs.push(where + ': op without a name'); continue; }
      if (OPSET.indexOf(op.op) < 0) { errs.push(where + ': unknown op "' + op.op + '"'); continue; }
      const at = where + '.' + op.op;
      for (const k of Object.keys(op)) {
        if (k === 'op' || k === 'ops' || k === 'then' || k === 'else') continue;
        checkExpr(op[k], at + '.' + k, errs, known, defs, scope);
      }
      if (op.op === 'each' || op.op === 'repeat') {
        if (!op.as) errs.push(at + ': missing "as"');
        if (!Array.isArray(op.ops)) errs.push(at + ': missing "ops"');
        const inner = new Set(scope);
        inner.add(op.as || '_');
        checkOps(op.ops || [], at, errs, known, defs, inner, files);
      } else if (op.op === 'if') {
        checkOps(op.then || [], at + '.then', errs, known, defs, scope, files);
        checkOps(op.else || [], at + '.else', errs, known, defs, scope, files);
      } else if (op.op === 'use') {
        const tf = op.file;
        if (typeof tf === 'string' && (!files[tf] || !files[tf].textures[op.texture])) errs.push(at + ': unknown texture "' + tf + ':' + op.texture + '"');
        if (!Array.isArray(op.at)) errs.push(at + ': use needs "at"');
      } else if (op.op === 'png') {
        // `src` is resolved to `ref` by the build (file path or data URI)
        if (!op.ref && !op.image && !op.src) errs.push(at + ': png needs "src"');
      } else if (op.op === 'call') {
        if (typeof op.fn !== 'string') errs.push(at + ': call needs "fn"');
      }
    }
  }

  function checkExpr(node, where, errs, known, defs, scope) {
    if (Array.isArray(node)) {
      const head = node[0];
      if (isExpr(head)) {
        if (head === 'param') {
          if (!known.has(node[1]) && !scope.has(node[1])) errs.push(where + ': unknown param "' + node[1] + '"');
          return;
        }
        if (head === 'def') {
          if (!Object.prototype.hasOwnProperty.call(defs, node[1])) errs.push(where + ': unknown def "' + node[1] + '"');
          return;
        }
        if (head === 'var') {
          if (!scope.has(node[1]) && !known.has(node[1])) errs.push(where + ': unknown loop var "' + node[1] + '"');
          return;
        }
        for (let k = 1; k < node.length; k++) checkExpr(node[k], where, errs, known, defs, scope);
        return;
      }
      for (const v of node) if (Array.isArray(v)) checkExpr(v, where, errs, known, defs, scope);
    }
  }

  return {
    FORMAT, EXPR, TEX_OPS, docs, images,
    define, defineImages, render, renderBuffer, draw, clear, validate,
    stripJsonc, parse: src => JSON.parse(stripJsonc(src)),
    shade, mix, hash, mulberry, parseColor, getDef,
    cacheSize: () => cache.size
  };
});
