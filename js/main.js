// =====================================================================
// Boot
// =====================================================================
addEventListener('resize', resize);
resize();
buildBar();
openCat('roads');
setTool('inspect');
if (!loadLocal(true)) genDemo();
initCloud();
let seenHelp = false;
try { seenHelp = localStorage.getItem(SAVE_KEY + '.help') === '1'; localStorage.setItem(SAVE_KEY + '.help', '1'); } catch (e) {}
if (!seenHelp) helpEl.classList.remove('hidden');
setInterval(() => saveLocal(true), 120000);
addEventListener('pagehide', () => saveLocal(true));

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  panKeys(dt);
  if (speed > 0) { let sdt = dt * speed; while (sdt > 1e-6) { const s = Math.min(sdt, 1 / 30); simStep(s); sdt -= s; } }
  render();
  hud(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
