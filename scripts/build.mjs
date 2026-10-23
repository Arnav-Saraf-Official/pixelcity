import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = resolve(root, 'pixelcity.html');
const outputPath = resolve(root, process.argv[2] || 'dist/index.html');
let html = await readFile(inputPath, 'utf8');

const stylesheetPattern = /<link rel="stylesheet" href="((?!https?:\/\/|\/\/)[^"]+)">/g;
const stylesheetTags = [...html.matchAll(stylesheetPattern)];
if (stylesheetTags.length > 1) {
  throw new Error(`Expected at most one local stylesheet link; found ${stylesheetTags.length}.`);
}
if (stylesheetTags.length === 1) {
  const stylesheetPath = resolve(root, stylesheetTags[0][1]);
  const stylesheet = await readFile(stylesheetPath, 'utf8');
  html = html.replace(
    stylesheetTags[0][0],
    `<style>\n${stylesheet}\n</style>`,
  );
}

const scriptPattern = /<script src="([^"]+)"\s*><\/script>/g;
const scriptTags = [...html.matchAll(scriptPattern)];
if (scriptTags.length > 0) {
  const scripts = await Promise.all(scriptTags.map(async ([, source]) => {
    const scriptPath = resolve(root, source);
    return readFile(scriptPath, 'utf8');
  }));
  let firstScript = true;
  html = html.replace(scriptPattern, () => {
    if (!firstScript) return '';
    firstScript = false;
    return `<script>\n${scripts.join('\n')}\n</script>`;
  });
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, 'utf8');
console.log(`Built ${outputPath}`);
