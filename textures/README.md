# Textures

Every sprite outside the terrain field lives in a `.texture` file. Files are
JSON with `//` comments and trailing commas (JSONC). `scripts/textures.mjs`
compiles them into `js/textures.generated.js`, which `pixelcity.html` loads
before `js/art.js`.

Full reference: [`../TEXTURE_GUIDE.md`](../TEXTURE_GUIDE.md).

```bash
npm run textures                        # rebuild js/textures.generated.js
node scripts/textures.mjs list          # every family and texture
node scripts/textures.mjs export trees:tree --out pngs/
node scripts/textures.mjs import my.png --into people --name chef
node scripts/textures.mjs pack pngs/ --out textures/props.texture
```

`npm run build` runs the texture build first, so the bundle can never ship art
that disagrees with these files.

## File shape

```jsonc
{
  "format": "texture/1",
  "name": "trees",            // must match the file name
  "tile": 9,                  // art pixels per tile; gives params tw/th
  "defs": { "leaf": "#2f7d34", "pal": ["#a", "#b"] },
  "textures": {
    "tree": {
      "size": [9, 9],
      "params": { "v": 1, "dx": ["if", ["bit", ["param", "v"], 0], 1, -1] },
      "ops": [ { "op": "rect", "x": 0, "y": 0, "w": 9, "h": 9, "color": "#000" } ]
    }
  }
}
```

`params` are defaults. Callers may override any of them; defaults are
evaluated in declaration order, so later params can use earlier ones. `seed`
seeds a deterministic RNG (`["rnd"]`), and every texture has `w`, `h`, `tw`,
`th` (pixels and tiles) available as params.

`"extends": "other"` inherits another texture's size, params and ops; declaring
`ops` overrides the parent's ops.

## Expressions

Values in ops are literals or nested arrays. Everything is compiled to a
closure at load time; there is no `eval`.

`+ - * / % < <= > >= == != and or not if mod mask bit bits floor ceil round abs
min max pick shade mix at len range rot rotx roty default hash noise`

Environment forms: `["param", name]`, `["def", name]`, `["var", loopVar]`,
`["rnd"]`, `["fn", name, ...args]` (calls a param that is a function, or a
registered `TEX.OPS` capability).

A plain array whose first element is not one of those names is a literal list
(a palette, a point, `[[x,y,c], ...]`).

## Ops

| op | fields | notes |
|---|---|---|
| `rect` | x y w h color | integer pixels |
| `pixel` | x y color | |
| `line` | x1 y1 x2 y2 color | Bresenham |
| `png` | src x y alpha | `src` is rewritten to an embedded `ref` at build time |
| `each` | as in ops | `in` is any list |
| `repeat` | as times from ops | step is 1 |
| `if` | test then else | |
| `win` | x y color? | paints a window and records it for night lighting |
| `park` | x y v | records a parking slot; `v` 1 = perpendicular |
| `stat` | x y | status light position |
| `berth` | x y | dock mooring tile (tile coords, not pixels) |
| `spots` | of | replaces the queue-point list (metro, bus stop) |
| `spot` | x y | appends one queue point |
| `mark` | as of | records points without painting (`as`: win/park/spots) |
| `use` | texture file? at params? | inlines another texture at an offset |
| `set` | as value | writes a param for later ops (first-match flags) |
| `call` | fn args? | invokes a `TEX_OPS` capability |

Colors accept `#rgb`, `#rrggbb` and `#rrggbbaa`, so translucency works the same
way it does on a canvas. `["shade", color, n]` shifts every channel.

Marks are returned as `{win, park, stat, berth, spots}` in texture-local
coordinates; `js/art.js` offsets them. They drive window lighting, parked cars,
park visitors, dock berths and transit queues.

## Sprites from images

`"png": "sprites/x.png"` is resolved relative to this folder at build time and
embedded as raw RGBA (alpha and partial alpha preserved). `import` copies the
file into `textures/sprites/` and appends a texture that blits it; `export`
writes any texture back out as a PNG so it can be edited and re-imported.

## Rules here or in code?

Keep in the file: anything that is a pure function of params — palettes,
shading, variants, which pixels a sprite is made of.

Keep in code: anything needing game state (`wet` is passed in as a function,
for the dock) or heavier maths. Register it in `TEX_OPS` once and any file can
call it with `{"op": "call", "fn": "name"}` or `["fn", "name", ...]`.
