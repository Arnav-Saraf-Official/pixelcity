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
    if (speed > 0 && ((!inGameMenu && gameActive) || menuPreview.advancing)) {
      let sdt = dt * speed;
      while (sdt > 1e-6) { const s = Math.min(sdt, 1 / 30); simStep(s); sdt -= s; }
    }
    render();
    hud(dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
