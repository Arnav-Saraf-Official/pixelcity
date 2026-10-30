'use strict';
// =====================================================================
// Sound: a background-music toggle and a live city soundscape
// =====================================================================
// Music streams Eric Skiff's Resistor Anthems (CC BY 3.0) from the Internet
// Archive copy of the release, so no audio files are bundled. The effects are
// synthesised with WebAudio noise and oscillators: no assets, and the traffic
// sounds pan and quiet down with where the camera is. Weather is audible at
// every zoom level; individual vehicles only while the view is close enough to
// pick them out, so a city seen from the region overview is not a wall of noise.
const MUSIC_KEY = SAVE_KEY + '.music';
const MUSIC_BASE = 'https://archive.org/download/Resistor_Anthems-9016/';
const MUSIC_TRACKS = [
  {name: 'A Night of Dizzy Spells', file: 'Eric_Skiff_-_01_-_A_Night_Of_Dizzy_Spells.mp3'},
  {name: 'Underclocked', file: 'Eric_Skiff_-_02_-_Underclocked_underunderclocked_mix.mp3'},
  {name: 'Chibi Ninja', file: 'Eric_Skiff_-_03_-_Chibi_Ninja.mp3'},
  {name: 'All of Us', file: 'Eric_Skiff_-_04_-_All_of_Us.mp3'},
  {name: 'Come and Find Me', file: 'Eric_Skiff_-_05_-_Come_and_Find_Me.mp3'},
  {name: 'Searching', file: 'Eric_Skiff_-_06_-_Searching.mp3'},
  {name: "We're the Resistors", file: 'Eric_Skiff_-_07_-_Were_the_Resistors.mp3'},
  {name: 'Ascending', file: 'Eric_Skiff_-_08_-_Ascending.mp3'},
  {name: 'Come and Find Me (B mix)', file: 'Eric_Skiff_-_09_-_Come_and_Find_Me_-_B_mix.mp3'},
  {name: 'Arpanauts', file: 'Eric_Skiff_-_10_-_Arpanauts.mp3'},
];

const music = {
  el: new Audio(),
  i: 0,
  enabled: true,
  failures: 0,        // consecutive load errors, so an offline session stops retrying
  started: false,
};
music.el.preload = 'none';
music.el.volume = 0.42;

const musicChipEl = document.getElementById('musicChip');
const musicStateEl = document.getElementById('musicState');
const sfxChipEl = document.getElementById('sfxChip');
const sfxStateEl = document.getElementById('sfxState');

// A saved preference is one boolean and the track it was on. Older saves wrote a
// volume and a mute flag; a muted player counts as switched off.
function musicLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(MUSIC_KEY));
    if (!saved || typeof saved !== 'object') return;
    if (typeof saved.enabled === 'boolean') music.enabled = saved.enabled;
    if (saved.muted === true || saved.volume === 0) music.enabled = false;
    if (Number.isInteger(saved.track) && saved.track >= 0 && saved.track < MUSIC_TRACKS.length) music.i = saved.track;
  } catch (e) { /* a broken preference just means the defaults */ }
}
function musicSave() {
  try { localStorage.setItem(MUSIC_KEY, JSON.stringify({enabled: music.enabled, track: music.i})); } catch (e) { /* private mode */ }
}
function musicRender() {
  const on = music.enabled && music.started && !music.el.paused;
  musicChipEl.classList.toggle('on', !!on);
  musicChipEl.title = music.enabled ? `Music on · ${MUSIC_TRACKS[music.i].name} · Eric Skiff, Resistor Anthems (CC BY 3.0)` : 'Music off';
  if (musicStateEl) musicStateEl.textContent = music.enabled ? 'Music on' : 'Music off';
}
function musicPlay(i) {
  if (!music.enabled) return;
  music.i = ((i % MUSIC_TRACKS.length) + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
  music.el.src = MUSIC_BASE + MUSIC_TRACKS[music.i].file;
  music.started = true;
  const p = music.el.play();
  if (p && p.catch) p.catch(() => { music.started = false; musicRender(); });
  musicRender();
  musicSave();
}
function musicToggle() {
  music.enabled = !music.enabled;
  if (!music.enabled) {
    music.el.pause();
    musicRender();
    musicSave();
    return;
  }
  if (!music.started || !music.el.src) musicPlay(music.i);
  else {
    const p = music.el.play();
    if (p && p.catch) p.catch(() => { music.started = false; musicRender(); });
    musicRender();
  }
  musicSave();
}
music.el.addEventListener('playing', () => { music.failures = 0; music.started = true; musicRender(); });
music.el.addEventListener('pause', musicRender);
music.el.addEventListener('ended', () => musicPlay(music.i + 1));
music.el.addEventListener('error', () => {
  music.failures++;
  if (music.failures >= MUSIC_TRACKS.length) { music.started = false; musicRender(); return; }
  musicPlay(music.i + 1);
});
musicChipEl.onclick = musicToggle;

// ---------------------------------------------------------------------
// Live effects
// ---------------------------------------------------------------------
const SFX_KEY = SAVE_KEY + '.fx';
const SFX = {
  ctx: null,
  master: null,
  on: true,
  voices: {},
  filters: {},        // weather filters, kept apart from the buses above
  acc: 0,             // seconds since the last mix update
  thunderAt: 0,       // real time of the next thunder rumble
};

function sfxLoad() {
  try { SFX.on = localStorage.getItem(SFX_KEY) !== '0'; } catch (e) { /* defaults */ }
}
function sfxSave() {
  try { localStorage.setItem(SFX_KEY, SFX.on ? '1' : '0'); } catch (e) { /* private mode */ }
}
function sfxRender() {
  if (sfxStateEl) sfxStateEl.textContent = SFX.on ? 'on' : 'off';
  sfxChipEl.classList.toggle('on', SFX.on);
  sfxChipEl.title = SFX.on ? 'City sounds on' : 'City sounds off';
}

// Pink-ish noise: a little darker than white noise, which is what wind, rain and
// engines actually sound like. One buffer is shared by every looping source.
function makeNoise(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = clamp((b0 + b1 + b2 + w * 0.1848) * 0.22, -1, 1);
  }
  return buf;
}

// One pannable output bus per sound. The gain starts closed, so nothing is heard
// until the mix has decided how loud that sound should be.
function mkBus(ctx, master) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  let pan = null;
  if (ctx.createStereoPanner) {
    pan = ctx.createStereoPanner();
    gain.connect(pan); pan.connect(master);
  } else gain.connect(master);
  return {gain, pan};
}
function loopSrc(ctx, buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start();
  return s;
}
function noiseBand(ctx, buf, type, freq, q, out, level = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = level;
  loopSrc(ctx, buf).connect(f); f.connect(g); g.connect(out);
  return f;
}

function buildSfx(ctx) {
  const master = ctx.createGain();
  master.gain.value = SFX.on ? 0.85 : 0;
  master.connect(ctx.destination);
  SFX.master = master;
  const noise = makeNoise(ctx, 2.5);
  const V = SFX.voices = {}, F = SFX.filters = {};

  // Weather. Rain is a broadband hiss, wind a low rumble under it.
  V.rain = mkBus(ctx, master);
  F.rain = noiseBand(ctx, noise, 'bandpass', 2900, 0.5, V.rain.gain, 0.9);
  V.wind = mkBus(ctx, master);
  F.wind = noiseBand(ctx, noise, 'lowpass', 420, 0.8, V.wind.gain, 0.8);

  // Engines: a low sawtooth for the body of the sound with a band of noise for
  // the tyre and exhaust hiss. Three voices cover cars, heavy vehicles and rail.
  const engine = (base, cutoff, hissFreq, hissLevel) => {
    const bus = mkBus(ctx, master);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = base;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 1.1;
    const og = ctx.createGain(); og.gain.value = 0.16;
    osc.connect(lp); lp.connect(og); og.connect(bus.gain); osc.start();
    noiseBand(ctx, noise, 'bandpass', hissFreq, 0.9, bus.gain, hissLevel);
    return bus;
  };
  V.car = engine(72, 260, 520, 0.12);
  V.heavy = engine(44, 190, 330, 0.20);
  V.train = engine(58, 240, 1500, 0.10);
  // Rail gets a slow tremolo, which reads as the joints passing under the wheels.
  const trem = ctx.createGain(); trem.gain.value = 0.62;
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 3.2;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.38;
  lfo.connect(lfoGain); lfoGain.connect(trem.gain); lfo.start();
  V.train.gain.disconnect();
  V.train.gain.connect(trem);
  if (V.train.pan) trem.connect(V.train.pan); else trem.connect(master);

  // Aeroplanes: a distant jet rather than a prop plane, so the noise is the
  // dominant part and the tone only gives it pitch.
  V.plane = mkBus(ctx, master);
  F.plane = noiseBand(ctx, noise, 'bandpass', 480, 0.7, V.plane.gain, 0.5);
  const jet = ctx.createOscillator(); jet.type = 'sawtooth'; jet.frequency.value = 168;
  const jetLp = ctx.createBiquadFilter(); jetLp.type = 'lowpass'; jetLp.frequency.value = 900;
  const jetG = ctx.createGain(); jetG.gain.value = 0.05;
  jet.connect(jetLp); jetLp.connect(jetG); jetG.connect(V.plane.gain); jet.start();
}

function setBus(v, level, pan) {
  const t = SFX.ctx.currentTime;
  v.gain.gain.setTargetAtTime(level, t, 0.14);
  if (v.pan) v.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.2);
}

// A thunderclap: a crack of filtered noise over a low rumble. Scheduled only
// while a thunderstorm covers the camera, and never more than twice a minute.
function thunder() {
  const ctx = SFX.ctx;
  if (!ctx || ctx.state !== 'running') return;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2.4), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + w * 0.03) * 0.995;
    d[i] = clamp((w * 0.35 + last * 3.2) * 0.5, -1, 1);
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const g = ctx.createGain();
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.2);
  src.connect(lp); lp.connect(g);
  if (pan) {
    pan.pan.value = (Math.random() * 2 - 1) * 0.5;
    g.connect(pan); pan.connect(SFX.master);
  } else g.connect(SFX.master);
  src.start();
  src.stop(ctx.currentTime + 2.3);
}

function audioStart() {
  if (SFX.ctx) { if (SFX.ctx.state === 'suspended') SFX.ctx.resume(); return SFX.ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    SFX.ctx = new AC();
    buildSfx(SFX.ctx);
  } catch (e) { SFX.ctx = null; }
  return SFX.ctx;
}

// Everything goes quiet when the player is on the menu or the game is not
// running yet, so the start screen is not scored with traffic from a paused city.
function sfxSilence() {
  if (!SFX.ctx) return;
  for (const k in SFX.voices) setBus(SFX.voices[k], 0, 0);
}

// The audible neighbourhood is tied to what is on screen: a wider view hears
// more of the city, but individual vehicles fade out entirely once the camera is
// far enough that they are only a few pixels across.
function audioFrame(dt) {
  if (!SFX.ctx) return;
  SFX.acc += dt;
  if (SFX.acc < 0.1) return;
  SFX.acc = 0;
  const V = SFX.voices;
  if (!gameActive) { sfxSilence(); return; }
  const ctx = SFX.ctx;
  const z = cam.z;
  const halfW = Math.max(1, innerWidth / 2 / z), halfH = Math.max(1, innerHeight / 2 / z);
  const cx = cam.x + halfW, cy = cam.y + halfH;

  // ---- weather, at every zoom -----------------------------------------
  const kind = weatherCells.length || weatherSeeded ? weatherAt(cameraTile().x, cameraTile().y) : 'sunny';
  const now = performance.now();
  const rain = kind === 'storm' ? 0.30 : kind === 'rain' ? 0.18 : kind === 'snow' ? 0.05 : 0;
  const wind = kind === 'storm' ? 0.28 : kind === 'rain' ? 0.13 : kind === 'snow' ? 0.18 : kind === 'cloudy' ? 0.07 : 0.04;
  setBus(V.rain, rain, 0);
  setBus(V.wind, wind, 0);
  if (SFX.filters.rain) SFX.filters.rain.frequency.setTargetAtTime(kind === 'storm' ? 3400 : 2600, ctx.currentTime, 1.2);
  if (SFX.filters.wind) SFX.filters.wind.frequency.setTargetAtTime(kind === 'storm' ? 560 : 380, ctx.currentTime, 1.2);
  if (kind === 'storm' && now > SFX.thunderAt) {
    SFX.thunderAt = now + 5000 + Math.random() * 9000;
    thunder();
  }

  // ---- traffic, only while the view is close --------------------------
  const R = Math.min(1500, Math.max(110, Math.max(halfW, halfH) * 1.15));
  let carW = 0, carP = 0, heavyW = 0, heavyP = 0, trainW = 0, trainP = 0, planeW = 0, planeP = 0;
  const near = (x, y) => {
    const dx = x - cx, dy = y - cy;
    if (dx < -R || dx > R || dy < -R || dy > R) return null;
    const d = Math.hypot(dx, dy);
    if (d > R) return null;
    const w = 1 - d / R;
    return {w: w * w, p: dx / halfW};
  };

  if (z >= 1.5) {
    let n = 0;
    for (const c of cars) {
      if (c.dead) continue;
      const s = near(c.x, c.y);
      if (!s) continue;
      if (c.bus || c.truck) { if (z >= 2.4) { heavyW += s.w * (c.bus ? 1.5 : 1.25); heavyP += s.p * s.w; } }
      else { carW += s.w; carP += s.p * s.w; }
      if (++n > 1200) break;
    }
    setBus(V.car, Math.min(0.34, carW * 0.05), carW ? carP / carW * 0.7 : 0);
    setBus(V.heavy, Math.min(0.26, heavyW * 0.06), heavyW ? heavyP / heavyW * 0.7 : 0);
  } else {
    setBus(V.car, 0, 0); setBus(V.heavy, 0, 0);
  }

  if (z >= 1.9) {
    for (const m of metros) {
      if (!Number.isFinite(m.x)) continue;
      const s = near(m.x, m.y); if (!s) continue;
      trainW += s.w * 1.2; trainP += s.p * s.w;
    }
    for (const t of freight) {
      if (!Number.isFinite(t.x)) continue;
      const s = near(t.x, t.y); if (!s) continue;
      trainW += s.w * 1.6; trainP += s.p * s.w;
    }
    setBus(V.train, Math.min(0.30, trainW * 0.09), trainW ? trainP / trainW * 0.7 : 0);
  } else setBus(V.train, 0, 0);

  // Aircraft are audible from further out than a car: an aeroplane is loud and
  // still large on screen at a zoom where cars are specks.
  if (z >= 1.1) {
    const RA = R * 2.4;
    for (const p of planes) {
      const dx = p.x - cx, dy = p.y - cy;
      if (dx < -RA || dx > RA || dy < -RA || dy > RA) continue;
      const d = Math.hypot(dx, dy); if (d > RA) continue;
      const w = 1 - d / RA;
      planeW += w * w * 1.4; planeP += dx / halfW * w * w;
    }
    setBus(V.plane, Math.min(0.34, planeW * 0.11), planeW ? planeP / planeW * 0.8 : 0);
  } else setBus(V.plane, 0, 0);
}

sfxChipEl.onclick = () => {
  SFX.on = !SFX.on;
  if (SFX.master) SFX.master.gain.setTargetAtTime(SFX.on ? 0.85 : 0, SFX.ctx.currentTime, 0.08);
  sfxRender();
  sfxSave();
};

// Autoplay is blocked until the page has seen a gesture, so the first click or
// keypress starts both the music and the sound engine.
function audioUnlock() {
  removeEventListener('pointerdown', audioUnlock, true);
  removeEventListener('keydown', audioUnlock, true);
  audioStart();
  if (music.enabled && !music.started) musicPlay(music.i);
}

sfxLoad();
sfxRender();
musicLoad();
musicRender();
addEventListener('pointerdown', audioUnlock, true);
addEventListener('keydown', audioUnlock, true);
