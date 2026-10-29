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
      // The clock advances at the chosen rate, while the world itself is
      // animated at a capped rate so fast-forwarding never tunnels vehicles.
      const physRate = Math.min(rate / MIN_PER_SEC, PHYS_MAX);
      simRate = rate / physRate;
      let sdt = dt * physRate;
      while (sdt > 1e-6) { const s = Math.min(sdt, 1 / 30); simStep(s); sdt -= s; }
      advanceClock(dt * rate);
    }
    render();
    hud(dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
