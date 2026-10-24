'use strict';
// =====================================================================
// Textures: .texture documents (JSONC) -> cached canvases + marks
//
// A document holds a family of named sprites. Each sprite is pixel art:
//
//   designs      one or more complete pictures, painted as rows of
//                characters into a colour palette
//   conditions   rules that choose which design to draw for a given
//                parameter value ("if m has a north arm, use north")
//   marks        the non-visual layer (windows, parking slots, status
//                lights) the game reads back after drawing
//
// Palette entries may be plain colours or dynamic: a colour taken from a
// parameter, a shade of another swatch, or a cell painted only when a
// condition holds (a lane dash, a crosswalk stripe, a wet dock).
// There are no drawing ops and no if/then/else: everything the game sees
// is either painted pixels or a condition on a parameter.
//
// Load order: js/texture.js, js/textures.generated.js, then js/art.js.
// =====================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TEX = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORMAT = 'texture/2';
  const MAX_CACHE = 3000;
  // One character per palette entry in a design's rows. '.' is transparent,
  // so the palette can use every other printable JSON-safe character.
  const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&\'()*+,-/:;<=>?@[]^_`{|}~';
  const TRANSPARENT = '.';

  const docs = Object.create(null);
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
  // Source-over composite, straight alpha. Used by translucent pixels that
  // sit on top of another colour (bridge shadows on asphalt).
  function over(top, bottom) {
    const T = parseColor(top), B = parseColor(bottom);
    const sa = T[3] / 255, da = B[3] / 255, oa = sa + da * (1 - sa);
    if (!oa) return 'transparent';
    return rgbaStr((T[0] * sa + B[0] * da * (1 - sa)) / oa,
      (T[1] * sa + B[1] * da * (1 - sa)) / oa,
      (T[2] * sa + B[2] * da * (1 - sa)) / oa, oa * 255);
  }

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

  // Compact JSON for .texture files: rows and short expressions stay on one
  // line, objects expand. Roads stays reviewable instead of a wall of arrays.
  function formatJson(v, level) {
    const pad = '  '.repeat(level || 0);
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      // Expression trees and pixel rows have no objects: one line keeps them
      // out of the way. Arrays of objects (palette entries, marks) expand.
      const hasObject = v.some(x => x && typeof x === 'object' && !Array.isArray(x));
      if (!hasObject) return JSON.stringify(v);
      return '[\n' + v.map(x => '  '.repeat(level + 1) + formatJson(x, level + 1)).join(',\n') + '\n' + pad + ']';
    }
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    const flat = JSON.stringify(v);
    if (flat.length + (level + 1) * 2 <= 130) return flat;
    return '{\n' + keys.map(k => '  '.repeat(level + 1) + JSON.stringify(k) + ': ' + formatJson(v[k], level + 1)).join(',\n') + '\n' + pad + '}';
  }

  // ---------------------------------------------------------------------
  // Values: what a palette swatch resolves to. Everything here is either a
  // literal or reads a parameter/def; `slot` points at an earlier swatch,
  // so a shade does not consume a random pick a second time.
  // ---------------------------------------------------------------------
  function evalValue(node, env, slots) {
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return node;
    if (node == null) return node;
    if (Array.isArray(node)) {
      const head = node[0];
      if (typeof head !== 'string') return node.map(v => evalValue(v, env, slots));
      const a = k => evalValue(node[k], env, slots);
      switch (head) {
        case 'param': {
          const name = node[1];
          if (Object.prototype.hasOwnProperty.call(env.p, name)) return env.p[name];
          if (name in env) return env[name];
          return undefined;
        }
        case 'def': return env.d[node[1]];
        case 'slot': return slots[node[1]];
        case 'rnd': return env.rng();
        case 'shade': return shade(a(1), a(2));
        case 'mix': return mix(a(1), a(2), a(3));
        case 'pick': {
          const list = a(1), t = a(2);
          if (!Array.isArray(list) || !list.length) return undefined;
          return list[Math.abs(Math.floor(t * list.length)) % list.length];
        }
        case 'at': { const list = a(1); return list == null ? undefined : list[a(2)]; }
        case 'default': { const v = a(1); return v == null ? a(2) : v; }
        case 'choose': return evalCond(node[1], env, slots) ? a(2) : a(3);
        case 'over': return over(a(1), a(2));
        case 'hash': return hash(env.x, env.y, env.seed);
        case '+': return node.slice(1).reduce((s, _, k) => s + a(k + 1), 0);
        case '-': return a(1) - a(2);
        case '*': return node.slice(1).reduce((s, _, k) => s * a(k + 1), 1);
        case '/': return a(1) / a(2);
        case 'mod': return ((a(1) % a(2)) + a(2)) % a(2);
        case 'floor': return Math.floor(a(1));
        case 'ceil': return Math.ceil(a(1));
        case 'round': return Math.round(a(1));
        case 'abs': return Math.abs(a(1));
        case 'min': return Math.min(...node.slice(1).map((_, k) => a(k + 1)));
        case 'max': return Math.max(...node.slice(1).map((_, k) => a(k + 1)));
        case 'len': { const v = a(1); return v == null ? 0 : v.length; }
        case 'mask': return a(1) & a(2);
        case '&': return a(1) & a(2);
        case '|': return a(1) | a(2);
        case 'shift': return a(1) << a(2);
        case 'bits': {
          const n = a(1) | 0;
          return (n & 1) + (n >> 1 & 1) + (n >> 2 & 1) + (n >> 3 & 1);
        }
        default: return node.map(v => evalValue(v, env, slots));
      }
    }
    return node;
  }

  // ---------------------------------------------------------------------
  // Conditions are short text, always about a parameter or a pixel:
  //
  //   m = 5                hw > 0              kind != "sad"
  //   m has 4              bits(m) >= 3        night
  //   m = 1 or m = 2       not wet(tx, ty)     (x + y) % 2 = 0
  //
  // The parser below turns that text into the small AST evalCond reads.
  // ---------------------------------------------------------------------
  const TEX_VALUE_FUNCS = ['at', 'pick', 'default', 'shade', 'mix', 'floor', 'ceil', 'round',
    'abs', 'min', 'max', 'len', 'def', 'slot', 'hash'];
  function evalCond(c, env, slots) {
    if (typeof c === 'string') {
      let ast = COND_CACHE.get(c);
      if (!ast) { ast = parseCondition(c); COND_CACHE.set(c, ast); }
      return evalCond(ast, env, slots);
    }
    if (c === true) return true;
    if (!c || c === false) return false;
    if (!Array.isArray(c)) return !!c;
    const v = k => evalValue(c[k], env, slots);
    switch (c[0]) {
      case 'truthy': return !!v(1);
      case 'has': return ((v(1) | 0) & (v(2) | 0)) !== 0;
      case 'in': { const list = v(2); return Array.isArray(list) && list.indexOf(v(1)) >= 0; }
      case 'eq': return v(1) === v(2);
      case 'ne': return v(1) !== v(2);
      case 'lt': return v(1) < v(2);
      case 'lte': return v(1) <= v(2);
      case 'gt': return v(1) > v(2);
      case 'gte': return v(1) >= v(2);
      case 'bit': return ((v(1) >> v(2)) & 1) === 1;
      case 'bits': {
        const n = (v(1) | 0) & 15, count = (n & 1) + (n >> 1 & 1) + (n >> 2 & 1) + (n >> 3 & 1);
        switch (c[2]) {
          case '>': return count > v(3);
          case '>=': return count >= v(3);
          case '<': return count < v(3);
          case '<=': return count <= v(3);
          case '==': return count === v(3);
          default: return count;
        }
      }
      case 'all': return c.slice(1).every(x => evalCond(x, env, slots));
      case 'any': return c.slice(1).some(x => evalCond(x, env, slots));
      case 'none': return !c.slice(1).some(x => evalCond(x, env, slots));
      case 'call': {
        const fn = env.p[c[1]];
        if (typeof fn !== 'function') return false;
        return !!fn.apply(null, c.slice(2).map((_, k) => v(k + 2)));
      }
      case 'rnd': return hash(env.x, env.y, env.seed ^ 0x5f3759) < v(1);
      case 'dash': {
        const axis = c[1], period = v(2), duty = v(3), phase = v(4) | 0;
        const at = axis === 'y' ? env.y : env.x;
        return ((at + phase) % period + period) % period < duty;
      }
      case 'grid': {
        const period = v(1), offset = v(2) | 0;
        return ((env.x + env.y + offset) % period + period) % period === 0;
      }
      case 'noise': return hash(env.x, env.y, v(2) | 0) < v(1);
      default: throw new Error('unknown condition "' + c[0] + '"');
    }
  }

  // --- condition text parser -------------------------------------------
  const COND_CACHE = new Map();

  function condTokens(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i, dot = false;
        while (j < src.length && /[0-9.]/.test(src[j])) { if (src[j] === '.') { if (dot) break; dot = true; } j++; }
        out.push({ t: 'num', v: Number(src.slice(i, j)) }); i = j; continue;
      }
      if (ch === '"' || ch === "'") {
        let j = i + 1, text = '';
        while (j < src.length && src[j] !== ch) {
          if (src[j] === '\\') { text += src[j + 1] === undefined ? '\\' : src[j + 1]; j += 2; continue; }
          text += src[j++];
        }
        if (src[j] !== ch) throw new Error('unterminated string');
        out.push({ t: 'str', v: text }); i = j + 1; continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
        out.push({ t: 'name', v: src.slice(i, j) }); i = j; continue;
      }
      const two = src.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].indexOf(two) >= 0) { out.push({ t: 'op', v: two }); i += 2; continue; }
      if ('=<>!()[],+-*/%&|'.indexOf(ch) >= 0) { out.push({ t: 'op', v: ch }); i++; continue; }
      throw new Error('unexpected "' + ch + '"');
    }
    out.push({ t: 'end', v: null });
    return out;
  }

  function parseCondition(src) {
    if (typeof src !== 'string') throw new Error('a condition must be text');
    const text = src.trim();
    if (!text) throw new Error('empty condition');
    const tk = condTokens(text);
    let pos = 0;
    const peek = () => tk[pos];
    const take = () => tk[pos++];
    const fail = msg => { throw new Error(msg + ' near "' + (peek().v == null ? 'end' : peek().v) + '"'); };
    const isOp = v => peek().t === 'op' && peek().v === v;
    const isName = v => peek().t === 'name' && peek().v === v;
    function args() {
      const list = [];
      if (isOp(')')) { take(); return list; }
      for (;;) {
        list.push(orExpr());
        if (isOp(',')) { take(); continue; }
        if (isOp(')')) { take(); return list; }
        fail('expected "," or ")"');
      }
    }
    function listLiteral() {
      take(); // [
      const list = [];
      if (isOp(']')) { take(); return list; }
      for (;;) {
        list.push(orExpr());
        if (isOp(',')) { take(); continue; }
        if (isOp(']')) { take(); return list; }
        fail('expected "," or "]"');
      }
    }
    function primary() {
      const t = peek();
      if (t.t === 'num' || t.t === 'str') { take(); return t.v; }
      if (t.t === 'name') {
        take();
        if (t.v === 'true') return true;
        if (t.v === 'false') return false;
        if (t.v === 'null') return null;
        if (isOp('(')) {
          take();
          const a = args();
          switch (t.v) {
            case 'bits': return ['bits', a[0]];
            case 'bit': return ['has', a[0], ['shift', 1, a[1]]];
            case 'dashx': return ['dash', 'x', a[0], a[1], a[2]];
            case 'dashy': return ['dash', 'y', a[0], a[1], a[2]];
            case 'grid': return ['grid', a[0], a[1]];
            case 'noise': return ['noise', a[0], a[1]];
            case 'rnd': return ['rnd', a[0]];
            default:
              if (TEX_VALUE_FUNCS.indexOf(t.v) >= 0) return [t.v, ...a];
              return ['call', t.v, ...a];
          }
        }
        return ['param', t.v];
      }
      if (isOp('(')) { take(); const e = orExpr(); if (!isOp(')')) fail('expected ")"'); take(); return e; }
      if (isOp('[')) return listLiteral();
      if (isOp('-')) { take(); return ['-', 0, unary()]; }
      fail('expected a value');
    }
    function unary() {
      if (isName('not') || isOp('!')) { take(); return ['none', unary()]; }
      return primary();
    }
    function mul() {
      let left = unary();
      for (;;) {
        if (isOp('*') || isOp('/') || isOp('%')) { const op = take().v; left = [op === '%' ? 'mod' : op, left, unary()]; continue; }
        return left;
      }
    }
    function add() {
      let left = mul();
      for (;;) {
        if (isOp('+') || isOp('-')) { const op = take().v; left = [op, left, mul()]; continue; }
        return left;
      }
    }
    function bitAnd() {
      let left = add();
      while (isOp('&')) { take(); left = ['&', left, add()]; }
      return left;
    }
    function bitOr() {
      let left = bitAnd();
      while (isOp('|')) { take(); left = ['|', left, bitAnd()]; }
      return left;
    }
    function compare() {
      const left = bitOr();
      if (isOp('=') || isOp('==')) { take(); return ['eq', left, bitOr()]; }
      if (isOp('!=')) { take(); return ['ne', left, bitOr()]; }
      if (isOp('<')) { take(); return ['lt', left, bitOr()]; }
      if (isOp('<=')) { take(); return ['lte', left, bitOr()]; }
      if (isOp('>')) { take(); return ['gt', left, bitOr()]; }
      if (isOp('>=')) { take(); return ['gte', left, bitOr()]; }
      if (isName('has')) { take(); return ['has', left, bitOr()]; }
      if (isName('in')) {
        take();
        if (!isOp('[')) fail('expected "[" after "in"');
        return ['in', left, listLiteral()];
      }
      return left;
    }
    function notExpr() {
      if (isName('not') || isOp('!')) { take(); return ['none', notExpr()]; }
      return compare();
    }
    function andExpr() {
      let left = notExpr();
      while (isName('and') || isOp('&&')) { take(); left = ['all', left, notExpr()]; }
      return left;
    }
    function orExpr() {
      let left = andExpr();
      while (isName('or') || isOp('||')) { take(); left = ['any', left, andExpr()]; }
      return left;
    }
    const ast = orExpr();
    if (peek().t !== 'end') fail('unexpected token');
    // A bare value is a truth test: `night` means `night` is set.
    const COND_HEADS = ['truthy', 'has', 'in', 'eq', 'ne', 'lt', 'lte', 'gt', 'gte',
      'all', 'any', 'none', 'call', 'rnd', 'dash', 'grid', 'noise'];
    return COND_HEADS.indexOf(ast[0]) >= 0 ? ast : ['truthy', ast];
  }

  function compileCond(c) {
    if (typeof c === 'boolean') return () => c;
    if (typeof c !== 'string') throw new Error('a condition must be text, got ' + JSON.stringify(c));
    let ast = COND_CACHE.get(c);
    if (!ast) { ast = parseCondition(c); COND_CACHE.set(c, ast); }
    return env => evalCond(ast, env, env._slots);
  }

  // Identifiers a condition may read: declared params plus the engine's own
  // pixel and seed values. Exported so the studio can flag typos before save.
  function conditionNames(ast, out = new Set()) {
    if (Array.isArray(ast)) {
      if (ast[0] === 'param' && typeof ast[1] === 'string') out.add(ast[1]);
      else if (ast[0] === 'call' && typeof ast[1] === 'string') out.add(ast[1]);
      else for (const v of ast) conditionNames(v, out);
    }
    return out;
  }

  function conditionError(text, paramNames) {
    let ast;
    try { ast = parseCondition(String(text)); }
    catch (e) { return e.message; }
    const known = new Set(['x', 'y', 'tx', 'ty', 'seed', 'w', 'h'].concat(paramNames || []));
    for (const name of conditionNames(ast)) if (!known.has(name)) return 'unknown name "' + name + '"';
    return null;
  }

  // ---------------------------------------------------------------------
  // Drawing backends
  // ---------------------------------------------------------------------
  function canvasBackend(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    return {
      canvas: cv,
      fillRect(x, y, ww, hh, color) {
        if (color === 'transparent' || ww <= 0 || hh <= 0) return;
        g.fillStyle = color;
        g.fillRect(x, y, ww, hh);
      },
      clearRect(x, y, ww, hh) {
        if (ww <= 0 || hh <= 0) return;
        g.clearRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh));
      }
    };
  }

  // Software rasteriser: same output, no DOM. Used by the CLI so textures
  // can be exported and diffed outside a browser.
  function bufferBackend(w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    // Source-over with straight (non-premultiplied) colour, matching canvas.
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
      clearRect(x, y, ww, hh) {
        if (ww <= 0 || hh <= 0) return;
        const x0 = Math.round(x), y0 = Math.round(y), x1 = x0 + Math.round(ww), y1 = y0 + Math.round(hh);
        for (let yy = Math.max(0, y0); yy < Math.min(h, y1); yy++) for (let xx = Math.max(0, x0); xx < Math.min(w, x1); xx++) {
          const o = (yy * w + xx) * 4;
          data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0;
        }
      }
    };
  }

  // ---------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------
  function define(files) { for (const k of Object.keys(files)) docs[k] = files[k]; }

  function getDef(file, texName) {
    const doc = docs[file];
    if (!doc) throw new Error('unknown texture file "' + file + '"');
    const def = doc.textures && doc.textures[texName];
    if (!def) throw new Error('unknown texture "' + texName + '" in ' + file);
    prep(doc, def, file, texName);
    return { doc, def };
  }

  // The studio mutates a document in place; drop its compiled cache so the
  // next render reads the new palette, rows and conditions.
  function refresh(file, texName) {
    const doc = docs[file];
    const def = doc && doc.textures && doc.textures[texName];
    if (def) def._compiled = false;
  }

  function pickDesign(file, texName, params) {
    const { doc, def } = getDef(file, texName);
    return selectDesign(def, makeEnv(doc, def, params));
  }

  function prep(doc, def, file, name) {
    if (def._compiled) return def;
    def.__id = file + ':' + name;
    def.__file = file;
    def.size = def.size || [9, 9];
    def.params = def.params || {};
    def.designs = def.designs || {};

    const names = Object.keys(def.designs);
    if (!names.length) throw new Error(def.__id + ': no designs');
    def._default = def.default && def.designs[def.default] ? def.default : names[0];
    def._conditions = (def.conditions || []).map(c => ({ when: compileCond(c.when), design: c.design }));
    def._designs = Object.create(null);
    for (const n of names) {
      const d = def.designs[n];
      def._designs[n] = {
        palette: (d.palette || []).map(entry => compilePalette(entry, def.__id + '.' + n)),
        rows: d.rows || []
      };
    }
    def._marks = def.marks || {};
    def._compiled = true;
    return def;
  }

  function compilePalette(raw, where) {
    if (typeof raw === 'string') return { color: () => raw, when: null, elseColor: null };
    if (raw == null) return { color: () => 'transparent', when: null, elseColor: null };
    if (typeof raw !== 'object') throw new Error(where + ': a palette entry must be a colour or an object');
    if (Array.isArray(raw.layers)) {
      return {
        layers: raw.layers.map(l => ({
          color: () => evalValue(l.color, CACHE_ENV, CACHE_SLOTS),
          when: l.when ? compileCond(l.when) : null
        })),
        when: null, elseColor: null
      };
    }
    if (!('color' in raw) && !('when' in raw)) throw new Error(where + ': a palette entry needs "color"');
    return {
      color: () => evalValue(raw.color, CACHE_ENV, CACHE_SLOTS),
      when: raw.when ? compileCond(raw.when) : null,
      elseColor: raw.else !== undefined ? (() => evalValue(raw.else, CACHE_ENV, CACHE_SLOTS)) : null
    };
  }
  // compilePalette build a closure that reads the environment through these
  // slots; they are reassigned for every render, before any swatch is read.
  let CACHE_ENV = null;
  let CACHE_SLOTS = null;

  function makeEnv(doc, def, params) {
    const p = Object.assign({}, def.params);
    if (params) for (const k of Object.keys(params)) if (params[k] !== undefined) p[k] = params[k];
    const seed = p.seed !== undefined ? p.seed | 0 : 1;
    return {
      p, d: doc.defs || {}, x: 0, y: 0,
      seed,
      rng: mulberry(seed),
      w: def.size[0], h: def.size[1],
      tw: def.size[0] / (doc.tile || 9), th: def.size[1] / (doc.tile || 9),
      ox: 0, oy: 0, _slots: []
    };
  }

  function selectDesign(def, env) {
    for (let k = 0; k < def._conditions.length; k++) {
      const c = def._conditions[k];
      if (c.when(env)) return c.design;
    }
    return def._default;
  }

  function renderWith(file, texName, params, be) {
    const { doc, def } = getDef(file, texName);
    const env = makeEnv(doc, def, params);
    return paintDesign(doc, def, selectDesign(def, env), env, be);
  }

  // Render one named design directly. The studio edits a design even when
  // the current test parameters would select a different one.
  function renderDesignWith(file, texName, designName, params, be) {
    const { doc, def } = getDef(file, texName);
    if (!def._designs[designName]) throw new Error(def.__id + ': unknown design "' + designName + '"');
    return paintDesign(doc, def, designName, makeEnv(doc, def, params), be);
  }

  function loadPalette(design) {
    CACHE_SLOTS = [];
    const colors = new Array(design.palette.length);
    const layerColors = new Array(design.palette.length);
    for (let i = 0; i < design.palette.length; i++) {
      const entry = design.palette[i];
      if (entry.layers) {
        layerColors[i] = entry.layers.map(l => l.color());
        colors[i] = layerColors[i][layerColors[i].length - 1];
      } else {
        colors[i] = entry.color();
      }
      CACHE_SLOTS.push(colors[i]);
    }
    return { colors, layerColors };
  }

  // The colour a swatch resolves to at the top-left pixel, for the studio's
  // palette strip. Conditional pixels may differ elsewhere; this is a hint.
  function swatchColor(file, texName, designName, index, params) {
    const { doc, def } = getDef(file, texName);
    const design = def._designs[designName];
    if (!design || !design.palette[index]) return null;
    const env = makeEnv(doc, def, params);
    env.x = 0; env.y = 0;
    const prevEnv = CACHE_ENV, prevSlots = CACHE_SLOTS;
    CACHE_ENV = env;
    const { colors, layerColors } = loadPalette(design);
    const entry = design.palette[index];
    let color;
    if (entry.layers) {
      let acc = null;
      for (let k = 0; k < entry.layers.length; k++) {
        const layer = entry.layers[k];
        if (layer.when && !layer.when(env)) continue;
        const v = layerColors[index][k];
        if (v === 'transparent' || v == null) continue;
        acc = acc == null ? v : over(v, acc);
      }
      color = acc;
    } else if (!entry.when || entry.when(env)) color = colors[index];
    else if (entry.elseColor) color = entry.elseColor();
    CACHE_ENV = prevEnv; CACHE_SLOTS = prevSlots;
    return color || null;
  }

  function paintDesign(doc, def, designName, env, be) {
    const marks = { win: [], park: [], stat: null, berth: null, spots: [], design: null };
    const design = def._designs[designName];
    if (!design) throw new Error(def.__id + ': unknown design "' + designName + '"');
    marks.design = designName;

    // Swatches are resolved once, in palette order, so a random colour pick
    // is consumed once per render and shades of it stay consistent.
    const prevEnv = CACHE_ENV, prevSlots = CACHE_SLOTS;
    CACHE_ENV = env;
    const { colors, layerColors } = loadPalette(design);

    for (let y = 0; y < def.size[1]; y++) {
      const row = design.rows[y] || '';
      for (let x = 0; x < def.size[0]; x++) {
        const ch = row[x];
        if (!ch || ch === TRANSPARENT) continue;
        const idx = ALPHABET.indexOf(ch);
        if (idx < 0) throw new Error(def.__id + '.' + designName + ': unknown pixel "' + ch + '"');
        const entry = design.palette[idx];
        if (!entry) throw new Error(def.__id + '.' + designName + ': pixel "' + ch + '" has no palette entry');
        env.x = x; env.y = y;
        let color;
        if (entry.layers) {
          let acc = null;
          for (let k = 0; k < entry.layers.length; k++) {
            const layer = entry.layers[k];
            if (layer.when && !layer.when(env)) continue;
            const v = layerColors[idx][k];
            if (v === 'transparent' || v == null) continue;
            acc = acc == null ? v : over(v, acc);
          }
          color = acc;
        } else if (!entry.when || entry.when(env)) color = colors[idx];
        else if (entry.elseColor) color = entry.elseColor();
        if (!color || color === 'transparent') continue;
        be.fillRect(x, y, 1, 1, color);
      }
    }
    CACHE_ENV = prevEnv; CACHE_SLOTS = prevSlots;

    const m = def._marks;
    if (m.win) marks.win = m.win.map(p => [p[0], p[1]]);
    if (m.park) marks.park = m.park.map(p => [p[0], p[1], p[2] | 0]);
    if (m.stat) marks.stat = [m.stat[0], m.stat[1]];
    if (m.berth) marks.berth = [m.berth[0], m.berth[1]];
    if (m.spots) marks.spots = m.spots.map(p => [p[0], p[1]]);
    return marks;
  }

  // ---------------------------------------------------------------------
  // Render + cache
  // ---------------------------------------------------------------------
  function stableParams(params) {
    if (!params) return '';
    return Object.keys(params).filter(k => typeof params[k] !== 'function').sort()
      .map(k => k + '=' + JSON.stringify(params[k])).join('&');
  }

  function renderDesign(file, texName, designName, params) {
    const { def } = getDef(file, texName);
    const be = canvasBackend(def.size[0], def.size[1]);
    const marks = renderDesignWith(file, texName, designName, params, be);
    return { canvas: be.canvas, marks };
  }

  function renderDesignBuffer(file, texName, designName, params) {
    const { def } = getDef(file, texName);
    const be = bufferBackend(def.size[0], def.size[1]);
    const marks = renderDesignWith(file, texName, designName, params, be);
    return { w: be.w, h: be.h, data: be.data, marks };
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
  const MARK_KEYS = ['win', 'park', 'stat', 'berth', 'spots'];

  function validate(files) {
    const errs = [];
    for (const file of Object.keys(files)) {
      const doc = files[file];
      if (doc.format !== FORMAT) errs.push(file + ': bad format "' + doc.format + '" (expected "' + FORMAT + '")');
      if (!doc.textures) { errs.push(file + ': no "textures" object'); continue; }
      const defs = doc.defs || {};
      for (const name of Object.keys(doc.textures)) {
        const def = doc.textures[name], where = file + ':' + name;
        if (!Array.isArray(def.size) || def.size.length !== 2) { errs.push(where + ': missing size [w,h]'); continue; }
        const [w, h] = def.size;
        const known = new Set(Object.keys(def.params || {}).concat(['w', 'h', 'tw', 'th']));
        if (!def.designs || !Object.keys(def.designs).length) { errs.push(where + ': no designs'); continue; }
        for (const dn of Object.keys(def.designs)) {
          const d = def.designs[dn], at = where + ':' + dn;
          if (!Array.isArray(d.rows) || d.rows.length !== h) { errs.push(at + ': expected ' + h + ' rows'); continue; }
          if (!Array.isArray(d.palette)) { errs.push(at + ': missing palette'); continue; }
          if (d.palette.length > ALPHABET.length) errs.push(at + ': palette has ' + d.palette.length + ' entries (max ' + ALPHABET.length + ')');
          for (let y = 0; y < h; y++) {
            const row = d.rows[y];
            if (typeof row !== 'string' || row.length !== w) { errs.push(at + ': row ' + y + ' must be ' + w + ' characters'); continue; }
            for (const ch of row) {
              if (ch === TRANSPARENT) continue;
              const idx = ALPHABET.indexOf(ch);
              if (idx < 0) { errs.push(at + ': unknown pixel "' + ch + '"'); break; }
              if (idx >= d.palette.length) { errs.push(at + ': row ' + y + ' uses palette entry "' + ch + '" which does not exist'); break; }
            }
          }
          d.palette.forEach((entry, i) => {
            if (typeof entry === 'string') return;
            if (!entry || typeof entry !== 'object') { errs.push(at + '.palette[' + i + ']: bad entry'); return; }
            if (Array.isArray(entry.layers)) {
              entry.layers.forEach((l, k) => {
                checkValue(l.color, at + '.palette[' + i + '].layers[' + k + '].color', errs, known, defs, i);
                if (l.when !== undefined) checkCond(l.when, at + '.palette[' + i + '].layers[' + k + '].when', errs, known, defs, i);
              });
              return;
            }
            if (!('color' in entry)) errs.push(at + '.palette[' + i + ']: missing color');
            checkValue(entry.color, at + '.palette[' + i + '].color', errs, known, defs, i);
            if (entry.else !== undefined) checkValue(entry.else, at + '.palette[' + i + '].else', errs, known, defs, i);
            if (entry.when !== undefined) checkCond(entry.when, at + '.palette[' + i + '].when', errs, known, defs, i);
          });
        }
        const names = Object.keys(def.designs);
        if (def.default && names.indexOf(def.default) < 0) errs.push(where + ': default design "' + def.default + '" does not exist');
        for (const c of def.conditions || []) {
          if (names.indexOf(c.design) < 0) errs.push(where + ': condition targets unknown design "' + c.design + '"');
          checkCond(c.when, where + '.conditions', errs, known, defs, null);
        }
        for (const key of Object.keys(def.marks || {})) {
          if (MARK_KEYS.indexOf(key) < 0) errs.push(where + '.marks: unknown mark "' + key + '"');
        }
      }
    }
    return errs;
  }

  function checkValue(node, where, errs, known, defs, paletteIndex) {
    if (node == null || typeof node !== 'object' || typeof node === 'string') return;
    if (Array.isArray(node)) {
      const head = node[0];
      if (head === 'choose') {
        checkCond(node[1], where + '.choose', errs, known, defs, paletteIndex);
        for (let k = 2; k < node.length; k++) checkValue(node[k], where, errs, known, defs, paletteIndex);
        return;
      }
      if (head === 'param') {
        if (!known.has(node[1])) errs.push(where + ': unknown param "' + node[1] + '"');
        return;
      }
      if (head === 'def') {
        if (!Object.prototype.hasOwnProperty.call(defs, node[1])) errs.push(where + ': unknown def "' + node[1] + '"');
        return;
      }
      if (head === 'slot') {
        if (paletteIndex == null || node[1] >= paletteIndex) errs.push(where + ': slot ' + node[1] + ' must be an earlier swatch');
        return;
      }
      for (let k = 1; k < node.length; k++) checkValue(node[k], where, errs, known, defs, paletteIndex);
    }
  }

  function checkCond(text, where, errs, known, defs, paletteIndex) {
    const e = conditionError(text, [...known]);
    if (e) errs.push(where + ': ' + e + ' (in "' + text + '")');
  }

  return {
    FORMAT, ALPHABET, docs,
    define, render, renderDesign, renderBuffer, renderDesignBuffer, draw, clear, validate, swatchColor,
    refresh, pickDesign,
    stripJsonc, parse: src => JSON.parse(stripJsonc(src)), stringify: v => formatJson(v, 0),
    shade, mix, over, hash, mulberry, parseColor, getDef,
    parseCondition, conditionError, conditionNames,
    cacheSize: () => cache.size
  };
});
