# Textures

Every sprite outside the terrain field lives in a `.texture` file. Files are
JSON with `//` comments and trailing commas (JSONC). Each sprite holds one or
more painted **designs** and short **conditions** that choose a design for the
parameters the game passes in. `scripts/textures.mjs` compiles them into
`js/textures.generated.js`, which `pixelcity.html` loads before `js/art.js`.

Full reference: [`../TEXTURE_GUIDE.md`](../TEXTURE_GUIDE.md).

```bash
npm run textures                        # rebuild js/textures.generated.js
node scripts/textures.mjs list          # every family and sprite
node scripts/textures.mjs export trees:tree --out pngs/
node scripts/textures.mjs import my.png --into people --name chef
node scripts/textures.mjs pack pngs/ --out textures/props.texture
```

`npm run build` runs the texture build first, so the bundle can never ship art
that disagrees with these files. It also builds the editor used to make them:
`dist/textures/index.html`.

## File shape

```jsonc
{
  "format": "texture/2",
  "name": "trees",              // must match the file name
  "tile": 9,                    // art pixels per tile; gives params tw/th
  "defs": { "leaf": "#2f7d34" },
  "textures": {
    "tree": {
      "size": [9, 9],
      "params": { "v": 1 },
      "default": "pine",
      "designs": {
        "pine": {
          "palette": ["transparent", "#26704a"],
          "rows": [".........", ".........", "........."]
        }
      },
      "conditions": [
        { "when": "v = 1", "design": "pine" }
      ],
      "marks": {}
    }
  }
}
```

Rows are pixel art: one character per pixel, `.` transparent, every other
character an index into `palette`. Conditions are text:

```
m = 5
hw > 0 and ow >= 2
m has 4
bits(m) >= 3
night
```

A swatch is either a colour string, a dynamic value such as
`["param", "color"]`, or a conditional cell with `"when"` and `"else"`. That is
how lane dashes, crosswalk stripes and tinted cars stay one design instead of
needing a picture per parameter combination. No drawing ops, no if/then/else.

## Studio

After `npm run build`, open `dist/textures/index.html` (served at `/textures`).
Paint designs, add variants, edit the conditions panel, place marks, and
download the `.texture` file back into this folder.
