import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTextures } from './textures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function walk(dir) {
  let names;
  try { names = await readdir(dir); }
  catch (e) { return []; }
  const out = [];
  for (const name of names) {
    const p = join(dir, name);
    const st = await stat(p);
    if (st.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

// Every .texture file, so the editor can open the ones the game already uses.
async function textureSources() {
  const dir = resolve(root, 'textures');
  const files = (await walk(dir)).filter(p => p.endsWith('.texture')).sort();
  const sources = {};
  for (const file of files) {
    const family = relative(dir, file).replace(/\\/g, '/').replace(/\.texture$/, '');
    sources[family] = await readFile(file, 'utf8');
  }
  return sources;
}

async function inlineStyles(html) {
  const pattern = /<link rel="stylesheet" href="((?!https?:\/\/|\/\/)[^"]+)">/g;
  const tags = [...html.matchAll(pattern)];
  if (tags.length > 1) {
    throw new Error(`Expected at most one local stylesheet link; found ${tags.length}.`);
  }
  if (!tags.length) return html;
  const css = await readFile(resolve(root, tags[0][1]), 'utf8');
  return html.replace(tags[0][0], `<style>\n${css}\n</style>`);
}

async function inlineScripts(html) {
  const pattern = /<script src="([^"]+)"\s*><\/script>/g;
  const tags = [...html.matchAll(pattern)];
  if (!tags.length) return html;
  const scripts = await Promise.all(tags.map(async ([, source]) => {
    const path = resolve(root, source);
    return `\n// ---- ${source} ----\n` + await readFile(path, 'utf8');
  }));
  let first = true;
  return html.replace(pattern, () => {
    if (!first) return '';
    first = false;
    return `<script>\n${scripts.join('\n')}\n</script>`;
  });
}

async function buildPage(input, output) {
  let html = await readFile(resolve(root, input), 'utf8');
  html = await inlineStyles(html);
  if (html.includes('<!--TEXTURE_SOURCES-->')) {
    const sources = await textureSources();
    const json = JSON.stringify(sources).replace(/</g, '\\u003c');
    html = html.replace('<!--TEXTURE_SOURCES-->', `<script>window.TEXTURE_SOURCES = ${json};</script>`);
  }
  html = await inlineScripts(html);
  const out = resolve(root, output);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, 'utf8');
  console.log(`Built ${output}`);
}

// Recompile textures/*.texture first so the pages always ship current art.
const tex = buildTextures();
console.log(`textures: ${tex.textures} in ${tex.files} files -> ${relative(root, tex.outFile)}`);

// `node scripts/build.mjs out.html` keeps the old single-file behaviour.
if (process.argv[2]) {
  await buildPage('pixelcity.html', process.argv[2]);
} else {
  await buildPage('pixelcity.html', 'dist/index.html');
  // Directory index so the editor is served at /textures next to the game's index.html.
  await buildPage('textures-editor.html', 'dist/textures/index.html');
}
