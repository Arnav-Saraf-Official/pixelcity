// One-off: build plane_shadow heading designs from the plane's own silhouettes.
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'textures/vehicles.texture';
let src = readFileSync(P, 'utf8');

const rowsFor = name => {
  const start = src.indexOf(`"${name}": {`);
  const block = src.slice(start, src.indexOf('"conditions"', start));
  const out = {};
  for (let k = 0; k < 8; k++) {
    const m = new RegExp(`"h${k}": \\{[\\s\\S]*?"rows": \\[([^\\]]*)\\]`).exec(block);
    if (!m) throw new Error('no rows for h' + k);
    out[k] = JSON.parse('[' + m[1] + ']');
  }
  return out;
};

const plane = rowsFor('plane');
const shadowRows = k => plane[k].map(r => [...r].map(ch => ch === '.' ? '.' : '1').join(''));

const designs = [];
for (let k = 0; k < 8; k++) {
  const rows = shadowRows(k).map(r => JSON.stringify(r)).join(',\n              ');
  designs.push(`        "h${k}": {
          "palette": ["transparent","#0f141c"],
          "rows": [${rows}]
        }`);
}
const conditions = [];
for (let k = 1; k < 8; k++) conditions.push(`        {"when":"h = ${k}","design":"h${k}"}`);

const block = `    "plane_shadow": {
      "size": [9,9],
      "params": {"h":0},
      "designs": {
${designs.join(',\n')}
      },
      "marks": {},
      "default": "h0",
      "conditions": [
${conditions.join(',\n')}
      ]
    },`;

const start = src.indexOf('    "plane_shadow": {');
if (start < 0) throw new Error('no plane_shadow block');
const endMark = '\n    // What a downed aircraft leaves behind';
const end = src.indexOf(endMark, start);
if (end < 0) throw new Error('no end marker');
src = src.slice(0, start) + block + src.slice(end);
writeFileSync(P, src);
console.log(shadowRows(0).join('\n'));
console.log('---');
console.log(shadowRows(2).join('\n'));
