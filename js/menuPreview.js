const menuPreview = (() => {
  let active = false;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

  function start() {
    if (active || gameActive) return;
    generateNewWorld('pregenerated', 6767);
    setSpeed(1);
    active = true;
  }

  function stop() {
    active = false;
  }

  return {
    start,
    stop,
    get active() { return active; },
    get advancing() { return active && !motionPreference.matches; },
  };
})();
