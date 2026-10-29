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

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const inGameMenu = gameActive && document.body.classList.contains('menu-screen');
  if (gameActive || menuPreview.active) {
    if (gameActive && !inGameMenu) { panKeys(dt); panEdge(dt); }
    const rate = SPEED_RATES[speed] || 0;
    if (rate > 0 && ((!inGameMenu && gameActive) || menuPreview.advancing)) {
      // Everything - the clock, travel, fire spread, spawns - runs on one clock.
      // The frame's simulated seconds are cut into equal steps (never more than
      // SIM_STEPS) so a high speed can leap ahead without stalling the frame.
      const sdt = dt * rate / MIN_PER_SEC;
      const steps = Math.min(SIM_STEPS, Math.max(1, Math.ceil(sdt * 30)));
      for (let k = 0; k < steps; k++) simStep(sdt / steps);
      simSample(sdt);
    }
    render();
    hud(dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
