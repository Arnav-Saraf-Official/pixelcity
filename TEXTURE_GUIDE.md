# PixelCity Texture Guide

Everything the game draws — except the terrain field — is generated from files in
`textures/*.texture`. Each file is a small JSON document describing a family of
sprites: either drawn by rules, or blitted from embedded PNGs.

This guide covers the file format, the expression language, every op, how the
game binds to textures, the PNG tooling, and the mistakes that are easy to make.

---

## Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Commands](#2-commands)
3. [File format](#3-file-format)
4. [Textures, size and inheritance](#4-textures-size-and-inheritance)
5. [Parameters](#5-parameters)
6. [Expressions](#6-expressions)
7. [Ops](#7-ops)
8. [Coordinates and marks](#8-coordinates-and-marks)
9. [PNG sprites](#9-png-sprites)
10. [Worked examples](#10-worked-examples)
11. [How the game binds to textures](#11-how-the-game-binds-to-textures)
12. [Validation and debugging](#12-validation-and-debugging)
13. [Gotchas](#13-gotchas)
14. [What is *not* a texture](#14-what-is-not-a-texture)

---

## 1. How it fits together

```
textures/*.texture          hand-edited, JSONC
        │
        │  npm run textures        (scripts/textures.mjs build)
        ▼
js/textures.generated.js    generated, never edit
        │
        │  loaded by pixelcity.html before js/art.js
        ▼
js/texture.js               TEX: parser, expression compiler, op VM, cache
        │
        │  TEX.render / TEX.draw
        ▼
js/art.js                   game state → texture name + params
        │
        ▼
chunk canvases (js/map.js)  one canvas per 40×30 tiles
```

`npm run build` runs the texture build first and then inlines everything into
`dist/index.html`, so a build can never ship art that disagrees with the files.

Art is drawn at **9 pixels per tile** (`T` in `js/core.js`). A 2×2 building is
`18×18` art pixels. The game scales that up; you never author at screen size.

---

## 2. Commands

```bash
npm run textures        # recompile textures/*.texture → js/textures.generated.js
npm run build           # compile textures, then build dist/index.html

node scripts/textures.mjs list                       # every family and texture
node scripts/textures.mjs import my.png \
     --into people --name chef                       # append one PNG to a family
node scripts/textures.mjs pack pngs/ \
     --out textures/props.texture                    # new self-contained family
node scripts/textures.mjs export trees:tree --out pngs/
node scripts/textures.mjs export roads --out pngs/   # a whole family
```

`list`, `import` and `export` only read; `pack` writes one new file. All of them
print what they did. The build is the only thing that writes
`js/textures.generated.js`.

---

## 3. File format

- Files live in `textures/` and end in `.texture` (`textures/trees.texture`).
- The content is **JSONC**: JSON plus `//` line comments, `/* */` block comments
  and trailing commas.
- The file name (without the extension) **must** match the top-level `"name"`.
  The build errors if they differ.

```jsonc
{
  "format": "texture/1",
  "name": "trees",          // must match trees.texture
  "tile": 9,                // art pixels per tile, used for tw/th (default 9)

  "defs": {                 // optional shared constants
    "leaf": "#2f7d34",
    "palette": ["#2f7d34", "#2b6e3a", "#3f8d4a"]
  },

  "textures": {             // one or more named textures
    "tree": { /* ... */ }
  }
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | must be `"texture/1"` |
| `name` | yes | must equal the file name without `.texture` |
| `tile` | no | art pixels per tile; gives params `tw`/`th`. Default `9` |
| `defs` | no | literals shared by every texture in the file |
| `textures` | yes | map of texture name → texture |

`defs` values are plain literals — colours, numbers, lists. They are not
expressions; `["def","name"]` in an op returns the value as-is.

---

## 4. Textures, size and inheritance

```jsonc
"shop": {
  "size": [9, 9],                       // width, height in art pixels
  "params": { "seed": 0 },              // defaults, may be overridden by callers
  "ops": [                              // ordered drawing commands
    { "op": "rect", "x": 0, "y": 0, "w": 9, "h": 9, "color": "#c9c2b0" }
  ]
}
```

| Key | Required | Meaning |
|---|---|---|
| `size` | yes, unless inherited | `[w, h]` in art pixels |
| `params` | no | default parameter values |
| `ops` | yes, unless inherited | drawing commands, executed in order |
| `extends` | no | inherit from another texture |

### `extends`

```jsonc
"pine": {
  "extends": "tree",                    // same file
  "params": { "leaf": "#1f6030" }
}
"sign": {
  "extends": "roads:plaza"              // other family: "family:name"
}
```

Inheritance rules:

- `size` is inherited when not given.
- `ops` are inherited **only** when the child declares no ops. A child that
  declares ops replaces the parent's ops entirely; there is no append.
- Params: caller overrides first, then the child's declared params, then any of
  the parent's that are still missing.

---

## 5. Parameters

Params are the texture's inputs. The game passes them from `js/art.js`; anything
not passed takes its default from the file.

### Resolution order

1. Values passed by the caller.
2. The texture's own `params`, **in declaration order**.
3. The parent's params (for `extends`), again in declaration order.

Because defaults are evaluated in order, later defaults can use earlier ones:

```jsonc
"params": {
  "v": 1,
  "dx": ["if", ["bit", ["param", "v"], 0], 1, -1],   // uses v
  "dy": ["if", ["bit", ["param", "v"], 1], 1, 0]
}
```

A param value that is an array starting with an expression name is an
expression; anything else is a literal.

### Implicit params

Every texture can read these without declaring them:

| Name | Value |
|---|---|
| `w`, `h` | size in art pixels |
| `tw`, `th` | size in tiles (`w / tile`, `h / tile`) |
| `ox`, `oy` | current draw offset (0 at the top level, larger inside `use`) |

### `seed` and randomness

`["rnd"]` returns the next value from a deterministic RNG seeded by the `seed`
param (or `1` if there is no seed). The same seed always produces the same
sprite, which is how every building in the city looks stable but different.

**The sequence is consumed in evaluation order.** Params are evaluated in
declaration order, then ops from top to bottom, each op's fields in source order.
Reordering params or op fields changes which random value each rule receives, so
keep the order when you are only editing geometry or colour.

### Function params

A param may be a function supplied by code. `wet(tx, ty)` is the one in use: the
dock asks whether a tile of its footprint is on water.

```jsonc
{ "op": "if", "test": ["fn", "wet", ["var", "tx"], ["var", "ty"]], "then": [ ... ] }
```

---

## 6. Expressions

Values inside ops are literals or nested arrays. The first element names the
operation:

```jsonc
["+", 3, ["param", "dx"]]          // 3 + dx
["if", ["bit", ["param", "v"], 1], 1, 0]
["shade", ["param", "leaf"], -30]
```

They compile to closures once, at load. There is no `eval`, so a mistake is a
build error rather than arbitrary code.

### Environment forms

| Form | Result |
|---|---|
| `["param", name]` | a param, loop variable, implicit value, or `set` value |
| `["def", name]` | a value from the file's `defs` |
| `["var", name]` | a loop variable bound by `each`/`repeat` |
| `["rnd"]` | next deterministic random number, 0–1 |
| `["fn", name, ...args]` | calls a function param, then a registered capability |

### Operators

| Form | Meaning |
|---|---|
| `["+", a, b, ...]` | sum of all arguments |
| `["*", a, b, ...]` | product of all arguments |
| `["-", a]` / `["-", a, b]` | negate / subtract |
| `["/", a, b]`, `["%", a, b]` | divide / remainder |
| `["<", a, b]`, `["<=", ...]`, `[">", ...]`, `[">=", ...]`, `["==", ...]`, `["!=", ...]` | comparisons |
| `["and", a, b, ...]`, `["or", a, b, ...]`, `["not", a]` | booleans |
| `["if", test, then, else]` | conditional value |
| `["mod", a, b]` | always-positive modulo |
| `["mask", v, m]` | `v & m` |
| `["bit", v, n]` | `(v >> n) & 1` |
| `["bits", m]` | how many of the low four bits are set |
| `["floor", a]`, `["ceil", a]`, `["round", a]`, `["abs", a]` | rounding |
| `["min", ...]`, `["max", ...]` | variadic |
| `["pick", list, r]` | `list[floor(r * len) % len]` |
| `["shade", color, amount]` | shift every RGB channel by `amount` |
| `["mix", a, b, t]` | blend two colours |
| `["at", list, i]` | index a list or string |
| `["len", list]` | length |
| `["range", n]` | `[0, 1, ... n-1]` |
| `["rot", list, k]` | rotate `[x, y, c]` triples 90° × k |
| `["rotx", px, py, d]`, `["roty", px, py, d]` | rotate a point for direction `d` (1 N, 2 E, 3 S, 4 W on a 9×9 tile) |
| `["default", value, fallback]` | `fallback` when `value` is null/undefined |
| `["hash", x, y, s]` | deterministic hash, 0–1 |
| `["noise", x, y, s]` | smooth value noise, 0–1 |

### Literal lists

An array whose first element is **not** an expression name is a literal list:

```jsonc
[0, 2]                                   // a two-element list
[[3, 7], [6, 6], [12, 6]]                // a list of points
["#c0504d", "#d2763a"]                   // a palette
```

That is why a list cannot start with a bare word like `param` or `pick`, and why
palettes are written inline or in `defs`.

---

## 7. Ops

Ops run in order, top to bottom. Later ops paint over earlier ones.

| Op | Fields | Does |
|---|---|---|
| `rect` | `x y w h color` | filled rectangle |
| `pixel` | `x y color` | one pixel |
| `line` | `x1 y1 x2 y2 color` | 1px Bresenham line |
| `png` | `src x y alpha?` | blit an image (see [§9](#9-png-sprites)) |
| `each` | `as in ops` | run `ops` once per item in `in` |
| `repeat` | `as times from? ops` | run `ops` `times` times, step 1 |
| `if` | `test then else` | run one branch |
| `win` | `x y color?` | paint a window **and** record it |
| `park` | `x y v` | record a parking slot (`v`: 1 perpendicular, 0 parallel) |
| `stat` | `x y` | set the status-light position |
| `berth` | `x y` | set the dock mooring tile (tile coords, first wins) |
| `spots` | `of` | replace the queue-point list |
| `spot` | `x y` | append one queue point |
| `mark` | `as of` | record points without painting (`as`: `win`, `park`, `spots`) |
| `use` | `texture file? at params?` | inline another texture at an offset |
| `set` | `as value` | write a param for the remaining ops |
| `call` | `fn args?` | invoke a code capability |

### Control flow

```jsonc
{ "op": "each", "as": "x", "in": [3, 5, 7], "ops": [
  { "op": "win", "x": ["var", "x"], "y": 4 }
] }

{ "op": "repeat", "as": "k", "times": 7, "from": 1, "ops": [
  { "op": "pixel", "x": ["var", "k"], "y": 3, "color": "#fff" }
] }

{ "op": "if", "test": ["<", ["rnd"], 0.6], "then": [ ... ], "else": [ ... ] }
```

`repeat` steps by **1**. There is no step argument set; when you need a stride,
use `each` with an explicit list (`"in": [19, 21, 23, 25]`) or compute the value
from the loop index (`["*", ["var", "k"], 2]`).

`else` is optional.

### `use`

Composes a texture out of others. Coordinates inside the child are offset by
`at`, and offsets accumulate through nested `use`. Marks emitted by the child are
offset too.

```jsonc
{ "op": "use", "file": "trees", "texture": "tree", "at": [10, 0], "params": { "v": 2 } }
```

Omit `file` to use the current family. `params` values are expressions evaluated
in the parent's environment, so a child can be driven by a parent param:

```jsonc
"params": { "m": ["param", "m"], "hw": ["param", "hw"] }
```

### `set` and first-match flags

`set` writes a param for the ops that follow, in the same render only. The dock
uses it to treat only the first dry tile as the crane:

```jsonc
"params": { "crane": false },
"ops": [
  { "op": "if", "test": ["not", ["param", "crane"]], "then": [
    { "op": "set", "as": "crane", "value": true },
    { "op": "rect", "x": 1, "y": 1, "w": 6, "h": 4, "color": "#d8d2c4" }
  ], "else": [ ... ] }
]
```

---

## 8. Coordinates and marks

All op coordinates are **texture-local art pixels**: `(0,0)` is the top-left of
the texture, and drawing outside `size` is clipped by the canvas.

When `js/art.js` draws a building it offsets the returned marks by `ox, oy`, so
declare windows and slots exactly where you painted them.

`TEX.render` returns:

```js
{
  canvas,                                   // or { w, h, data } from renderBuffer
  marks: {
    win:   [[x, y], ...],                   // window pixels
    park:  [[x, y, v], ...],                // parking slots
    stat:  [x, y] | null,                   // status light, 2×1 pixels
    berth: [tx, ty] | null,                 // dock mooring, in TILES
    spots: [[x, y], ...]                    // queue points
  }
}
```

`berth` deliberately uses tile coordinates and ignores offsets, because the
simulation looks up `(building.x + tx, building.y + ty)` in the water map.

What the game does with each mark:

| Mark | Consumer | Effect |
|---|---|---|
| `win` | `js/render.js` | lit windows at night, scaled by how many people are awake |
| `park` | `js/render.js` | draws parked car sprites, orientation from `v` |
| `stat` | `js/render.js` | 2×1 light: grey empty, green, amber, red by occupancy |
| `berth` | `js/simulation.js` | where boats appear at a dock |
| `spots` | `js/render.js` | people queueing at a bus stop or metro station |

`art.js` also builds `order`, a shuffled list of window indices, so lights turn
on in a random order rather than left-to-right.

---

## 9. PNG sprites

PNGs lose nothing: they are decoded to RGBA at build time, so full and partial
alpha survive and composites the same way as drawn art.

There are three workflows.

### 9a. Append a PNG to an existing family

```bash
node scripts/textures.mjs import art/bench.png --into props --name bench
```

This copies the file to `textures/sprites/bench.png`, and inserts:

```jsonc
"bench": {
  "size": [9, 9],
  "params": {},
  "ops": [{ "op": "png", "src": "sprites/bench.png", "x": 0, "y": 0 }]
}
```

`src` is resolved relative to `textures/` (the project root also works). The
build replaces it with an embedded `ref`, so the bundle needs no separate files.

### 9b. Pack PNGs into a new self-contained family

```bash
node scripts/textures.mjs pack art/ --out textures/props.texture
node scripts/textures.mjs pack a.png b.png --out textures/props.texture --force
```

Every PNG (or every `.png` in a folder, recursively) becomes a texture named
after the file, lowercased to `lower_snake_case`. By default the image data is
embedded as a `data:` URI, so the `.texture` file is a complete, portable asset —
no `sprites/` folder needed. Use `--link` instead to reference
`sprites/<file>.png`.

The packer refuses to overwrite an existing file unless you pass `--force`. It
validates the result before writing, so a broken PNG fails loudly.

### 9c. Round-trip: export, edit, re-pack

```bash
node scripts/textures.mjs export props:bench --out pngs/   # write props__bench.png
# edit it in any image editor
node scripts/textures.mjs pack pngs/props__bench.png --out textures/props.texture --force
```

`export` renders the texture through the CPU rasteriser, so it works for
generated art as well as imported bitmaps. Export → pack is pixel-exact,
including translucent pixels.

### `png` op

```jsonc
{ "op": "png", "src": "sprites/bench.png", "x": 0, "y": 0, "alpha": 1 }
```

`src` and both `x`/`y` are required. `alpha` (0–1) multiplies the image's own
alpha, which is handy for ghosts and shadows.

**Caveat:** `png` blits are not tintable. If a sprite must vary by colour at
runtime (cars, shirts), keep it procedural or add a capability. See
[§10e](#10e-add-a-code-capability).

---

## 10. Worked examples

### 10a. Retune existing art (no code)

Change a palette or a rectangle and run `npm run textures`. For example, make
trees lean the other way and use bluer leaves:

```jsonc
// textures/trees.texture
"defs": {
  "leafLight": "#3a6fa0",
  "leafDark": "#2f5c86",
  "leafLightHi": "#5f96c8",
  "leafDarkHi": "#4a7fae"
}
```

Because `tree` derives `dx`/`dy` from `v`, you can also change the lean rule:

```jsonc
"dx": ["if", ["bit", ["param", "v"], 0], -1, 1]   // mirrored
```

### 10b. Add a building type

1. Register it in `js/core.js` (`BT`). Size drives everything else:

```js
cinema: {name:'Cinema', cat:'com', w:2,h:2, homes:0, cap:12, jobs:8,
         desc:'An evening destination.'},
```

2. Add a texture with **size `[w*9, h*9]`** = `[18, 18]` in `textures/buildings.texture`:

```jsonc
"cinema": {
  "size": [18, 18],
  "params": { "seed": 0, "wet": null },
  "ops": [
    { "op": "rect", "x": 0, "y": 0, "w": 18, "h": 18, "color": "#4a4d55" },
    { "op": "rect", "x": 1, "y": 1, "w": 16, "h": 9, "color": "#7a3f4a" },
    { "op": "rect", "x": 3, "y": 3, "w": 12, "h": 4,
      "color": ["pick", ["#e8c55a", "#d9d4e6", "#8fd3ff"], ["rnd"]] },

    { "op": "each", "as": "x", "in": [3, 5, 7, 10, 12, 14], "ops": [
      { "op": "win", "x": ["var", "x"], "y": 9 }] },

    { "op": "rect", "x": 0, "y": 12, "w": 18, "h": 6, "color": "#6f727a" },
    { "op": "each", "as": "y", "in": [13, 15], "ops": [
      { "op": "each", "as": "x", "in": [1, 5, 10, 14], "ops": [
        { "op": "park", "x": ["var", "x"], "y": ["var", "y"], "v": 0 }] }] },

    { "op": "stat", "x": ["-", ["param", "w"], 2], "y": 0 }
  ]
}
```3. Run `npm run build`. Validation checks the file itself (ops, params, defs). It cannot see `BT`, so a missing texture is only noticed when the game first draws that building — you will get `unknown texture "cinema"` in the console. A wrong size also slips through validation and shows up as a misaligned building.

Keep the `stat` op on every building type except `metro`, `park` and `busstop` —
`js/render.js` draws the occupancy light whenever `art.stat` exists.

### 10c. Add a PNG sprite and show it

```bash
node scripts/textures.mjs pack art/bench.png --out textures/props.texture
```

```jsonc
// textures/props.texture
{
  "format": "texture/1",
  "name": "props",
  "tile": 9,
  "textures": {
    "bench": {
      "size": [9, 9],
      "params": {},
      "ops": [{ "op": "png", "src": "data:image/png;base64,...", "x": 0, "y": 0 }]
    }
  }
}
```

To draw it, call the runtime from anywhere after `js/art.js`:

```js
TEX.draw(ctx, 'props', 'bench', x, y, {});
```

A new *name* is not reachable from the game until something calls it. The
existing bindings only sample the names listed in
[§11](#11-how-the-game-binds-to-textures), so wiring a new sprite into the world
is a one-line change there:

```js
function drawPed(c, x, y, color) {
  TEX.draw(c, 'props', 'bench', x, y - 1, {});   // was people:ped
}
```

### 10d. Compose instead of duplicating

`use` keeps shared pieces in one place:

```jsonc
"kiosk": {
  "size": [9, 9],
  "params": { "seed": 0 },
  "ops": [
    { "op": "use", "file": "trees", "texture": "tree", "at": [0, 0], "params": { "v": 4 } },
    { "op": "rect", "x": 1, "y": 4, "w": 7, "h": 4, "color": "#d8d2c4" },
    { "op": "rect", "x": 2, "y": 5, "w": 5, "h": 2, "color": "#3a6f9a" },
    { "op": "mark", "as": "win", "of": [[6, 2], [3, 6]] }
  ]
}
```

### 10e. Add a code capability

When a rule genuinely needs code (game state, maths that would be unreadable as
an expression), register it once and call it from any file:

```js
// js/art.js, after TEX exists
TEX.TEX_OPS.stripes = function (be, env, args, marks) {
  for (let k = 0; k < args.w; k++) {
    be.fillRect(args.x + env.ox + k, args.y + env.oy, 1, args.h,
      args.colors[k % args.colors.length]);
  }
};
```

```jsonc
{ "op": "call", "fn": "stripes",
  "args": { "x": 0, "y": 0, "w": 9, "h": 9, "colors": ["#a9acb3", "#c3c6cd"] } }
```

Arguments are expressions too, so they can read params. A capability receives
`(backend, env, args, marks)`; `backend.fillRect(x, y, w, h, color)` and
`backend.blit(image, x, y, alpha)` work in both the browser and Node.

Adding a new **op keyword** (rather than a capability) means editing `DRAW` in
`js/texture.js`; the validator picks new op names up automatically.

---

## 11. How the game binds to textures

`js/art.js` is the only layer that knows both game state and textures. If you
change a parameter name here, update the matching `.texture` file.

| Function | Samples | Params |
|---|---|---|
| `drawTree(c, x0, y0, v)` | `trees:tree` | `v` |
| `drawRoadTile(c, x0, y0, m, hw, br, ow, sw, ml, ed)` | `roads:bridge` when `br`, else `roads:road` | `m, hw, ow, sw, ml, px, py, ed` |
| `drawDeck(c, x0, y0, hw)` | `roads:deck` | `hw, px` |
| `drawPathTile(c, x0, y0, m, br)` | `roads:path` | `m, br` |
| `drawPlazaTile(c, x0, y0, i)` | `roads:plaza` | `par, deco` |
| `drawBuilding(c, type, ox, oy, seed, wet)` | `buildings:<type>` | `seed, wet` |
| `drawCarSprite(c, x, y, horiz, color)` | `vehicles:car_h` / `car_v` | `color` |
| `drawBoat(c, boat)` | `vehicles:boat_n/e/s/w` | `color` |
| `drawPlane(c, plane, night)` | `vehicles:plane` + `plane_shadow` | `h, night, blink` |
| `drawBus(c, x, y, horiz)` | `vehicles:bus_h` / `bus_v` | — |
| `drawPed(c, x, y, color)` | `people:ped` | `color` |
| `drawFace(c, x, y, kind)` | `people:face` | `kind` |
| `drawRailTile(c, x0, y0, m, kind)` | `underground:rail` / `junction` / `reverse` | `m` |
| `drawStationPad(c, x0, y0)` | `underground:station` | — |
| `drawMetro(c, x, y, horiz)` | `underground:train_h` / `train_v` | — |

`drawRailTile` is the one place where the game chooses the texture rather than the
caller: the rail mask `m` is built by `js/metro.js` from where the stations are, and
the wrapper maps it to a block type — one connection is a **reversing block**, three
or four is a **junction**, anything else is plain running rail. So authoring
`underground.texture` never involves a particular layout; every station the player
places draws from the same four shapes.

Some parameters are computed by the wrapper rather than passed straight through:

- `px`/`py` on roads are `x % 6` / `y % 6`, which keeps dashed lane markings
  continuous across tile borders.
- `par` on plazas is `(x + y) % 4`, and `deco` is
  `hash(tileIndex, 3, 9) < 0.14`, so paving and benches line up with the world.
- `h` on planes is the heading, `0`–`7` (45° steps); `blink` alternates with
  time.
- `drawBuilding` builds a cache key from `seed` plus a bitmask of which footprint
  tiles are water, because `wet` is a function and cannot be stringified.

---

## 12. Validation and debugging

`npm run textures` validates every file and refuses to write the generated file
if anything is wrong. The error names the file, texture and field:

```
texture build failed:
  trees:tree.rect.x: unknown param "dx"
  roads:deck: missing size
  roads:deck.use: unknown texture "props:bench"
```

Addresses are `family:texture.op.field`, with the file name shown without its
`.texture` extension.

| Message | Fix |
|---|---|
| `not valid JSONC — ...` | unbalanced braces or a stray quote |
| `"name" is "x" but the file is "y"` | rename one of them |
| `bad format "..."` | set `"format": "texture/1"` |
| `unknown op "..."` | typo, or the op does not exist |
| `unknown param "..."` | not declared in `params`, not a loop var |
| `unknown def "..."` | missing from `defs` |
| `unknown loop var "..."` | used `["var","k"]` outside its `each`/`repeat` |
| `missing size` / `missing ops` | add them, or `extends` a texture that has them |
| `use of missing texture "..."` | wrong `texture`/`file` |
| `use needs "at"` | add `"at": [x, y]` |
| `png needs "src"` | path or data URI missing |
| `missing sprite "..."` | file not found under `textures/` or the project root |

To see what a rule actually produced:

```bash
node scripts/textures.mjs export buildings:cinema --out _look
```

Open `_look/buildings__cinema.png` in any editor, fix, rebuild, repeat.
`TEX.renderBuffer(file, name, params)` gives the same result in Node if you want
to inspect pixels programmatically.

In the browser, `TEX.docs`, `TEX.images` and `TEX.cacheSize()` are available from
the console.

---

## 13. Gotchas

1. **Random order matters.** `["rnd"]` values are consumed in declaration/evaluation
   order. Reordering params or op fields reshuffles every generated variant.
2. **`repeat` steps by 1.** Use `each` with an explicit list for strides.
3. **Literal lists cannot start with an expression name.** `["pick", ...]` is an
   expression; `["#fff", "#000"]` is a list.
4. **`png` needs `x` and `y`.** Omitting them yields `NaN` coordinates and draws
   nothing.
5. **`use` offsets accumulate**, and marks from the child are offset as well.
6. **`berth` is in tile coordinates** and ignores offsets.
7. **`set` lasts one render.** Every render starts from the declared params.
8. **Function params break default cache keys.** `TEX.render` stringifies params
   and skips functions, so pass an explicit key when the result depends on one
   (as `drawBuilding` does).
9. **Never edit `js/textures.generated.js`.** It is overwritten by every build.
10. **Building texture size must be exactly `BT[type].w * 9` by `BT[type].h * 9`.**
11. **The cache holds 3000 canvases (LRU).** Rarely used variants may be
    re-rendered; that is expected, not a bug.
12. **Rebuild after editing.** The running game reads the generated file, not
    your `.texture` file.

---

## 14. What is *not* a texture

The terrain field stays procedural (`js/map.js`, `buildChunk`). The ground is
2400×1800 tiles of per-pixel noise plus a neighbour-derived shoreline; it is not
a tileset and should not become one.

Also not textures, by design:

- **World geometry and placement rules** (`js/map.js`): connection masks,
  overpasses, which tile is water. Textures only *render* those decisions.
- **Simulation state** (`js/simulation.js`): who is driving, mood, congestion.
- **Traffic lights**, road stubs at the region edge, the congestion overlay and
  the minimap, which are drawn as overlays in `js/render.js`.
- **Toolbar cursors**, which are 9×9 ASCII masks in `js/ui.js`.

Everything that is a sprite — roads, bridges, decks, paths, plazas, trees,
buildings, cars, buses, boats, planes, pedestrians and mood faces — lives in
`textures/`.
