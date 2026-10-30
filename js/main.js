// =====================================================================
// Boot
// =====================================================================
addEventListener('resize', resize);
resize();
buildBar();
openCat('roads');
setTool('inspect');
initWorldSlots();
showStartScreen();
initCloud();
setInterval(() => { if (gameActive) saveLocal(true); }, 120000);
addEventListener('pagehide', () => { if (gameActive) saveLocal(true); });

// Fixed timestep: real time fills a bucket at `tps` ticks per second, and every
// whole tick in the bucket is simulated. Rendering uses the leftover fraction to
// interpolate, so motion is smooth and still paced entirely by the tick rate.
let lastT = performance.now(), tickAcc = 0, tickAlpha = 1;
function frame(now) {
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  const inGameMenu = gameActive && document.body.classList.contains('menu-screen');
  if (gameActive || menuPreview.active) {
    if (gameActive && !inGameMenu) { panKeys(dt); panEdge(dt); }
    const running = tps > 0 && ((!inGameMenu && gameActive) || menuPreview.advancing);
    if (running) {
      tickAcc += dt * tps;
      let ticks = Math.floor(tickAcc);
      tickAcc -= ticks;
      if (ticks > MAX_TICKS_PER_FRAME) { ticks = MAX_TICKS_PER_FRAME; tickAcc = 0; }
      for (let k = 0; k < ticks; k++) simulateTick();
      tickAlpha = ticks ? tickAcc : tickAlpha;
    } else tickAlpha = 1;
    render();
    hud(dt);
  }
  audioFrame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
