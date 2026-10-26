// Temporary: river generation check across seeds.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9376;
const page = 'file:///' + resolve(process.argv[2] || 'pixelcity.html').split(String.fromCharCode(92)).join('/');
const profile = mkdtempSync(join(tmpdir(), 'pcrv-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1400,900', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function targetWs() { for (let k = 0; k < 80; k++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(150); } throw new Error('no chrome'); }
const ws = new WebSocket(await targetWs());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { res, rej })); };
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err'); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: page });
await sleep(2500);

for (const seed of [777, 12345, 42]) {
  const r = await ev(`(() => {
    menuPreview.stop(); worldSettings = {difficulty:'ideal', placement:'requireEverything', taxSales:0, taxIncome:0};
    generateNewWorld('pregenerated', ${seed}); enterLoadedWorld(); setSpeed(0);
    document.body.style.display = '';
    const stats = (seed) => {
      const w = new Uint8Array(N);
      const gw = new Uint8Array(N), gt = new Uint8Array(N);
      genTerrainInto(seed, gw, gt);
      w.set(gw);
      // pinch: a water tile with land on both sides of one axis
      let pinch = 0, water = 0, thinRivers = 0;
      for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
        const i = y * MW + x; if (!w[i]) continue;
        water++;
        const hLand = !w[i - 1] && !w[i + 1], vLand = !w[i - MW] && !w[i + MW];
        if (hLand || vLand) pinch++;
      }
      // water components and how many reach the border
      const seen = new Uint8Array(N); let lakes = 0, ocean = 0;
      for (let s0 = 0; s0 < N; s0++) {
        if (!w[s0] || seen[s0]) continue;
        let q = [s0], touch = false; seen[s0] = 1;
        for (let h = 0; h < q.length; h++) {
          const u = q[h], x = u % MW, yy = u / MW | 0;
          if (x === 0 || yy === 0 || x === MW - 1 || yy === MH - 1) touch = true;
          for (let d = 1; d <= 4; d++) { const v = nb(u, d); if (v >= 0 && w[v] && !seen[v]) { seen[v] = 1; q.push(v); } }
        }
        if (touch) ocean++; else lakes++;
      }
      return {water, pinch, ocean, lakes};
    };
    const out = stats(${seed});
    // map image from the real world arrays
    updateMini(0, 0, MW - 1, MH - 1);
    out.png = miniCv.toDataURL('image/png');
    out.land = (() => { let n = 0; for (let i = 0; i < N; i++) if (!water[i]) n++; return n; })();
    return out;
  })()`);
  writeFileSync(`tmp/rivers-${seed}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
  delete r.png;
  console.log(seed, JSON.stringify(r));
}
chrome.kill();
process.exit(0);
