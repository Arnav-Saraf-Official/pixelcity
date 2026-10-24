# PixelCity Texture Guide

Everything the game draws — except the terrain field — comes from files in
`textures/*.texture`. Each file is one **family** of sprites. A sprite is made of
one or more **designs** (complete pictures) and a short list of **conditions**
that choose which design to paint for the parameters the game passes in.

There are no drawing commands and no if/then/else ops. What the game sees is
always a painted picture plus an optional non-visual layer of marks (windows,
parking slots, status lights).

---

## Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Commands](#2-commands)
3. [File shape](#3-file-shape)
4. [Sprites](#4-sprites)
5. [Designs and pixels](#5-designs-and-pixels)
6. [Conditions](#6-conditions)
7. [Swatches](#7-swatches)
8. [Marks](#8-marks)
9. [Texture Studio](#9-texture-studio)
10. [How the game binds to textures](#10-how-the-game-binds-to-textures)
11. [Validation and mistakes](#11-validation-and-mistakes)

---

## 1. How it fits together

```
textures/*.texture          pixel designs + conditions, JSONC
        │
        │  npm run textures
        ▼
js/textures.generated.js    generated, never edit
        │
        │  loaded by pixelcity.html before js/art.js
        ▼
js/texture.js               TEX: parse, compile conditions, paint, cache
        │
        │  TEX.render / TEX.draw
        ▼
js/art.js                   game state → sprite name + params
        │
        ▼
chunk canvases              one canvas per 40×30 tiles
```

`npm run build` compiles the textures first and then builds
`dist/textures/index.html` (the studio) and `dist/index.html` (the game), so a
build can never ship art that disagrees with the files.

Art is drawn at **9 pixels per tile** (`T` in `js/core.js`). A 2×2 building is
`18×18` art pixels. The game scales that up; you never author at screen size.

---

## 2. Commands

```bash
npm run textures        # recompile textures/*.texture → js/textures.generated.js
npm run build           # compile textures, then build dist/

node scripts/textures.mjs list                       # every family, sprite and size
node scripts/textures.mjs import my.png \
     --into people --name chef                        # add a PNG as a sprite
node scripts/textures.mjs pack pngs/ \
     --out textures/props.texture                     # new family from PNGs
node scripts/textures.mjs export trees:tree --out pngs/
node scripts/textures.mjs export roads --out pngs/    # a whole family
```

`import` and `pack` only convert; they do not touch existing art unless you name
an existing family/sprite. `export` writes the design the default parameters
select. The build is the only thing that writes `js/textures.generated.js`.

---

## 3. File shape

Files live in `textures/` and end in `.texture` (`textures/trees.texture`). The
content is **JSONC**: JSON plus `//` comments, `/* */` comments and trailing
commas. The file name without the extension must equal `"name"`; the build
errors if they differ.

```jsonc
{
  "format": "texture/2",
  "name": "trees",              // must match trees.texture
  "tile": 9,                    // art pixels per tile (default 9)

  "defs": {                     // optional shared literals
    "pine": "#26704a",
    "oak": "#4b873b"
  },

  "textures": {
    "tree": { /* sprite */ }
  }
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | must be `"texture/2"` |
| `name` | yes | must equal the file name without `.texture` |
| `tile` | no | art pixels per tile; gives the `tw`/`th` values. Default `9` |
| `defs` | no | literals shared by the sprites in the file |
| `textures` | yes | map of sprite name → sprite |

`defs` values are plain JSON: colours, numbers, lists, or point art. They are
not conditions; swatches can read them with a `def(...)` value.

---

## 4. Sprites

```jsonc
"tree": {
  "size": [9, 9],
  "params": { "v": 1 },
  "default": "pine",
  "designs": {
    "pine": { "palette": ["transparent", "#26704a"], "rows": ["....", "...."] },
    "oak":  { "palette": ["transparent", "#4b873b"], "rows": ["....", "...."] }
  },
  "conditions": [
    { "when": "v = 1", "design": "pine" },
    { "when": "v = 2", "design": "oak" }
  ],
  "marks": {}
}
```

| Field | Required | Meaning |
|---|---|---|
| `size` | yes | `[width, height]` in art pixels |
| `params` | no | default values the game may override |
| `default` | no | design used when no condition matches; first design otherwise |
| `designs` | yes | one or more named pictures |
| `conditions` | no | ordered rules that choose a design |
| `marks` | no | windows, parking slots, status light, berth, spots |

Parameters are plain values (numbers, strings, booleans, `null`, or lists).
The game supplies its own values; the defaults are only what the editor previews
and what a direct `TEX.render` without parameters uses. `seed` is special: if a
sprite declares it, the engine seeds `["rnd"]` and `rnd(p)` from it.

The engine also exposes `x`, `y` (pixel being painted), `seed`, `w`, `h`, `tw`
and `th` to conditions and swatches.

---

## 5. Designs and pixels

A design is two parts:

```jsonc
"base": {
  "palette": ["transparent", "#68ad52", "#3a2a1a"],
  "rows": [
    "111111111",
    "122222221",
    "122222221",
    "111111111",
    "..."
  ]
}
```

`rows` has exactly `size[1]` strings of exactly `size[0]` characters. Each
character is an index into `palette`, using this alphabet:

```
0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&'()*+,-/:;<=>?@[]^_`{|}~
```

`.` is transparent and is the only character that does not need a palette entry.
A palette can hold at most 91 entries. Entry `0` is conventionally
`"transparent"`; pixels using it paint nothing.

---

## 6. Conditions

Conditions are short text. The first matching rule wins; when none match, the
`default` design is drawn.

```jsonc
"conditions": [
  { "when": "m = 1", "design": "north" },
  { "when": "m = 3 or m = 7", "design": "north-east" },
  { "when": "hw > 0 and ow >= 2", "design": "wide" },
  { "when": "bits(m) >= 3", "design": "crossroads" },
  { "when": "night", "design": "lit" }
]
```

### Operators

| Form | Meaning |
|---|---|
| `a = b`, `a != b` | equality (also `==`) |
| `a < b`, `a <= b`, `a > b`, `a >= b` | ordering |
| `a and b`, `a or b`, `not a` | logic (also `&&`, `||`, `!`) |
| `( ... )` | grouping |
| `a has 4` | bit test: `a` has bit `4` set |
| `a in [1, 3, 5]` | value is in the list |
| `a + b`, `a - b`, `a * b`, `a / b`, `a % b` | arithmetic |
| `a & b`, `a \| b` | bitwise and / or |

A bare value is a truth test: `night` means `night` is set, `m` means `m != 0`.

### Functions

| Function | Meaning |
|---|---|
| `bits(v)` | number of set bits |
| `bit(v, n)` | bit `n` of `v` (same as `v has (1 << n)`) |
| `dashx(period, duty, phase)` | lane-dash pattern along x |
| `dashy(period, duty, phase)` | lane-dash pattern along y |
| `grid(period, offset)` | `(x + y + offset) % period = 0` |
| `noise(p, seed)` | seeded speckle at the painted pixel |
| `rnd(p)` | true with probability `p` for this pixel/seed |
| `at(list, i)`, `pick(list, t)`, `default(v, fallback)` | list helpers |
| `floor`, `ceil`, `round`, `abs`, `min`, `max`, `len` | number helpers |
| `def(name)`, `hash()` | family def, deterministic pixel hash |

A function that is not one of these is called on a parameter of the same name.
The dock passes `wet(tx, ty)`, so `not wet(tx, ty)` works in a condition.

### Typical conditions

```
m = 5
m has 4
hw > 0 and ow = 2
ml = 1 or ml = 3
px % 6 < 3
bits(m) >= 3
ed != null
```

---

## 7. Swatches

A palette entry is usually a colour string:

```jsonc
"palette": ["transparent", "#68ad52", "#3a2a1a"]
```

It can also be a **dynamic** value, so one painted pixel can take its colour
from the parameters. Values are small arrays:

| Value | Result |
|---|---|
| `["param", "color"]` | a parameter |
| `["def", "leaf"]` | a family def |
| `["slot", 2]` | an earlier swatch's resolved colour |
| `["shade", value, -30]` | shift each channel |
| `["mix", a, b, 0.5]` | blend two values |
| `["pick", [a, b, c], ["rnd"]]` | seeded random pick |
| `["at", list, i]` | item from a list |
| `["default", value, fallback]` | fallback for `null` |
| `["hash"]` | deterministic pixel hash (0…1) |
| `["choose", condition, a, b]` | conditional value |
| `["+", a, b]`, `["-", …]`, `["*", …]`, `["/", …]`, `["mod", …]` | arithmetic |
| `["bits", v]`, `["mask", a, b]` | bit helpers |

Conditions inside `choose` and in a swatch's `when` use the same text syntax as
sprite conditions.

### Conditional pixels

One swatch can paint only when a condition holds:

```jsonc
{
  "color": "#f4f4f4",
  "when": "x % 6 < 3",
  "else": "transparent"
}
```

`else` is optional. This is how crosswalk stripes, lane dashes and translucent
shadows stay in one design instead of needing a separate picture for every
parameter combination.

### Layered swatches

A swatch may stack colours, each with its own condition:

```jsonc
{
  "layers": [
    { "color": "#8b6a43" },
    { "color": "#00000033", "when": "y > 4" }
  ]
}
```

Layers are composited source-over in order. The studio edits these read-only;
use **Make solid colour** to flatten one and paint it directly.

---

## 8. Marks

Marks are recorded while the design is drawn and returned in texture-local
coordinates. They are how the game knows where windows, parking spaces and dock
berths are without searching pixels.

```jsonc
"marks": {
  "win": [[2, 5], [6, 5]],
  "park": [[1, 7, 0], [5, 7, 0]],
  "spots": [[4, 8]],
  "stat": [7, 0],
  "berth": [3, 2]
}
```

| Key | Shape | Meaning |
|---|---|---|
| `win` | `[[x, y], …]` | window pixels; lit at night |
| `park` | `[[x, y, v], …]` | parking slot; `v` 1 = perpendicular |
| `spots` | `[[x, y], …]` | queue points for buses/metro |
| `stat` | `[x, y]` or `null` | status light |
| `berth` | `[x, y]` or `null` | dock mooring (tile coordinates) |

`js/art.js` offsets the coordinates by the sprite's screen position.

---

## 9. Texture Studio

Open `dist/textures/index.html` after a build (or serve the repo and visit
`/textures`). The studio reads the same files the game ships and downloads a
`.texture` file in exactly the same format.

- **Sprites** — the left pane. Add a blank sprite, import a `.texture`, or turn a
  PNG into a sprite.
- **Designs** — the strip under the canvas. Every design in the sprite is a
  thumbnail. Double-click one to rename it. `+ Design` duplicates the current
  design as a new variant; `From PNG` adds a design from an image.
- **Pixels** — Pencil, Eraser, Fill, Line, Box and Pick. Right-click erases.
  Undo/redo is `Ctrl+Z` / `Ctrl+Y`. The palette strip selects the swatch the
  pencil paints, so painting with a dynamic or conditional swatch preserves it.
- **Swatch** — edit the selected palette entry. Solid colours get a colour
  picker. Dynamic entries show where their colour comes from; **Make solid
  colour** flattens one. **Add condition** turns a solid swatch into a
  conditional one with an `else` colour.
- **Conditions** — the rules panel. Write the condition on the left and pick the
  design it selects on the right. Rules are ordered; use the arrows to reorder.
  The filter box narrows a long list. **Otherwise** picks the fallback design.
- **Preview parameters** — override parameter values to see the rule you are
  editing; it never changes what the game passes in.
- **Marks** — choose the Marker tool, pick a mark type, then click the canvas to
  place or remove one. Marks are drawn as coloured outlines.
- **Save changes** stores edits in this browser only. **Download** writes the
  file; put it back in `textures/` and run `npm run build` to ship it.

No screen in the studio shows raw drawing ops or JSON expressions: everything is
pixels, swatches and dropdowns.

---

## 10. How the game binds to textures

`js/art.js` is the only place that knows game state. It calls:

```js
TEX.draw(ctx, 'roads', 'road', x0, y0, { m, hw, ow, ml, px, py, ed });
TEX.render('buildings', type, { seed, wet }, cacheKey);
TEX.draw(ctx, 'vehicles', 'plane', x, y, { h, night, blink });
```

- `TEX.draw` paints and returns the sprite's marks.
- `TEX.render` returns `{canvas, marks}` and caches by file/sprite/params.
- `TEX.renderDesign` renders one named design regardless of conditions; the
  studio uses it for thumbnails and editing.
- `TEX.pickDesign` says which design the current parameters would choose.

Everything that is a pure function of parameters belongs in the `.texture`
file. Anything that needs game state (a boat under a bridge, a wet dock) stays
in code and is passed as a parameter or a function parameter.

---

## 11. Validation and mistakes

`npm run textures` and `npm run build` reject a file before it ships. The studio
shows the same messages in its error strip. The usual ones:

| Message | Fix |
|---|---|
| `bad format "…"` | set `"format": "texture/2"` |
| `no designs` | give the sprite at least one design |
| `expected N rows` / `row N must be W characters` | pad or trim the pixel rows |
| `uses palette entry "x" which does not exist` | add the swatch or fix the character |
| `unknown def "name"` | add the def to the family, or fix the spelling |
| `unknown name "foo"` | a condition used a parameter the sprite does not declare |
| `condition targets unknown design` | point the rule at an existing design |
| `unknown pixel "…"` | the character is not in the palette alphabet |
| `default design "…" does not exist` | fix `"default"` or add the design |

Order matters in the conditions list: the first matching rule wins. Put specific
rules above broad ones (`m = 5 and hw > 0` before `m = 5`).

A sprite with no conditions simply always draws its `default` design. A sprite
with conditions but no `default` falls back to its first design.
