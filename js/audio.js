'use strict';
// =====================================================================
// Sound: background music, live city effects and the volume mix
// =====================================================================
// Music streams Eric Skiff's Resistor Anthems (CC BY 3.0) from the Internet
// Archive copy of the release, so no audio files are bundled. The effects are
// synthesised with WebAudio noise and oscillators: no assets. Everything runs
// through three gains (music, vehicles, weather) so the settings dialog can
// balance them, and the city mix follows the camera: traffic is audible only
// while individual vehicles are on screen, and fades with distance as they
// leave the view. Weather is heard at every zoom.
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

// The mix. Everything starts at 75%, and the three sliders in the Sound dialog
// write straight into this: music, vehicles and weather.
const MIX_KEY = SAVE_KEY + '.mix';
const audioMix = {music: 0.75, vehicles: 0.75, weather: 0.75};
function mixLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(MIX_KEY));
    if (!s || typeof s !== 'object') return;
    for (const k of Object.keys(audioMix)) if (Number.isFinite(s[k])) audioMix[k] = clamp(s[k], 0, 1);
  } catch (e) { /* defaults */ }
}
function mixSave() {
  try { localStorage.setItem(MIX_KEY, JSON.stringify(audioMix)); } catch (e) { /* private mode */ }
}

const music = {
  el: new Audio(),
  i: 0,
  enabled: true,
  failures: 0,        // consecutive load errors, so an offline session stops retrying
  started: false,
};
music.el.preload = 'none';

const musicChipEl = document.getElementById('musicChip');
const musicStateEl = document.getElementById('musicState');
const sfxChipEl = document.getElementById('sfxChip');
const sfxStateEl = document.getElementById('sfxState');

// 75% music is about the level the old fixed 0.42 gave, and a hundred is loud
// but not clipping.
const musicApplyVolume = () => { music.el.volume = clamp(audioMix.music * 0.55, 0, 1); };

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
  musicApplyVolume();
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
  groups: {},         // vehicles / weather gain stages
  noise: null,        // shared noise buffer for one-shots
  acc: 0,             // seconds since the last mix update
  thunderAt: 0,       // real time of the next thunder rumble
  honkAt: 0,
  clackAt: 0,
  hornAt: 0,
  brakeAt: 0,
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
  sfxChipEl.title = SFX.on ? 'City sounds on: weather, vehicles and aircraft' : 'City sounds off';
}
sfxChipEl.onclick = () => {
  SFX.on = !SFX.on;
  if (SFX.master) SFX.master.gain.setTargetAtTime(SFX.on ? 0.9 : 0, SFX.ctx.currentTime, 0.08);
  sfxRender();
  sfxSave();
};

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
function mkBus(ctx, dest) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  if (ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner();
    gain.connect(pan); pan.connect(dest);
    return {gain, pan};
  }
  gain.connect(dest);
  return {gain, pan: null};
}
function routeAudio(ctx, node, pan, dest) {
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    node.connect(p); p.connect(dest);
    return p;
  }
  node.connect(dest);
  return null;
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
  master.gain.value = SFX.on ? 0.9 : 0;
  master.connect(ctx.destination);
  SFX.master = master;
  // Two groups under the master, so the sliders scale whole families at once.
  const vehicles = ctx.createGain(), weather = ctx.createGain();
  vehicles.gain.value = audioMix.vehicles * 1.25;
  weather.gain.value = audioMix.weather * 1.15;
  vehicles.connect(master); weather.connect(master);
  SFX.groups = {vehicles, weather};
  const noise = makeNoise(ctx, 2.5);
  SFX.noise = noise;
  const V = SFX.voices = {}, F = SFX.filters = {};

  // Weather. Rain is a broadband hiss, wind a low rumble under it.
  V.rain = mkBus(ctx, weather);
  F.rain = noiseBand(ctx, noise, 'bandpass', 2900, 0.5, V.rain.gain, 0.9);
  V.wind = mkBus(ctx, weather);
  F.wind = noiseBand(ctx, noise, 'lowpass', 420, 0.8, V.wind.gain, 0.8);

  // Engine beds. A sawtooth gives the body, a band of noise the tyres and
  // exhaust. `chugHz` adds a diesel throb for the heavy vehicles.
  const engine = (base, cutoff, hissFreq, hissLevel, chugHz) => {
    const bus = mkBus(ctx, vehicles);
    const bed = ctx.createGain(); bed.gain.value = 1;
    bed.connect(bus.gain);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = base;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 1.1;
    const og = ctx.createGain(); og.gain.value = 0.30;
    osc.connect(lp); lp.connect(og); og.connect(bed); osc.start();
    noiseBand(ctx, noise, 'bandpass', hissFreq, 0.9, bed, hissLevel);
    if (chugHz) {
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = chugHz;
      const lg = ctx.createGain(); lg.gain.value = 0.34;
      lfo.connect(lg); lg.connect(bed.gain); lfo.start();
    }
    return bus;
  };
  // Cars: a running note over the body makes them stand out from the general hum.
  V.car = engine(68, 330, 700, 0.22, 0);
  const carNote = ctx.createOscillator(); carNote.type = 'triangle'; carNote.frequency.value = 186;
  const carNoteG = ctx.createGain(); carNoteG.gain.value = 0.11;
  carNote.connect(carNoteG); carNoteG.connect(V.car.gain); carNote.start();
  // Buses and trucks: lower and lumpier, the way a diesel idles.
  V.heavy = engine(42, 210, 300, 0.34, 2.6);
  // Rail: a low rumble; the joints themselves are the clack one-shots below.
  V.train = engine(48, 240, 1200, 0.24, 0);

  // Aeroplanes: noise for the airframe, a low tone for the body and a turbine
  // whine that rises as the aircraft gets closer.
  V.plane = mkBus(ctx, vehicles);
  F.plane = noiseBand(ctx, noise, 'bandpass', 460, 0.7, V.plane.gain, 0.55);
  const jet = ctx.createOscillator(); jet.type = 'sawtooth'; jet.frequency.value = 150;
  const jetLp = ctx.createBiquadFilter(); jetLp.type = 'lowpass'; jetLp.frequency.value = 800;
  const jetG = ctx.createGain(); jetG.gain.value = 0.09;
  jet.connect(jetLp); jetLp.connect(jetG); jetG.connect(V.plane.gain); jet.start();
  const whine = ctx.createOscillator(); whine.type = 'triangle'; whine.frequency.value = 520;
  const whineG = ctx.createGain(); whineG.gain.value = 0.16;
  whine.connect(whineG); whineG.connect(V.plane.gain); whine.start();
  const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 0.8;
  const vibG = ctx.createGain(); vibG.gain.value = 14;
  vib.connect(vibG); vibG.connect(whine.frequency); vib.start();
  // Kept off the voice list: it is an oscillator, not a gain bus, and the
  // silence loop walks the voices.
  SFX.planeWhine = whine;
}

function setBus(v, level, pan) {
  const t = SFX.ctx.currentTime;
  v.gain.gain.setTargetAtTime(level, t, 0.14);
  if (v.pan) v.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.2);
}

// A car horn: two short, bright tones. Triggered occasionally in dense traffic.
function honk(level, pan) {
  const ctx = SFX.ctx;
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.24 * level), t0 + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.30);
  routeAudio(ctx, out, pan, SFX.groups.vehicles);
  for (const [freq, g] of [[392, 0.55], [494, 0.40]]) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const gg = ctx.createGain(); gg.gain.value = g;
    o.connect(gg); gg.connect(out); o.start(t0); o.stop(t0 + 0.32);
  }
}

// A rail joint: two sharp filtered noise clicks in quick succession. This is the
// sound that makes a train read as a train rather than a low rumble.
function railClack(level, pan) {
  const ctx = SFX.ctx;
  if (!ctx || ctx.state !== 'running' || !SFX.noise) return;
  const t0 = ctx.currentTime;
  for (const [dt, amp] of [[0, 1], [0.085, 0.55]]) {
    const src = ctx.createBufferSource(); src.buffer = SFX.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1900 + Math.random() * 700; f.Q.value = 1.3;
    const g = ctx.createGain();
    const peak = Math.max(0.0002, 0.20 * level * amp);
    g.gain.setValueAtTime(0.0001, t0 + dt);
    g.gain.exponentialRampToValueAtTime(peak, t0 + dt + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.075);
    src.connect(f); f.connect(g);
    routeAudio(ctx, g, pan, SFX.groups.vehicles);
    src.start(t0 + dt, Math.random() * 1.8, 0.09);
  }
}

// A locomotive's two-tone horn, played rarely and only when a train is close.
function trainHorn(level, pan) {
  const ctx = SFX.ctx;
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  const out = ctx.createGain();
  const peak = Math.max(0.0002, 0.15 * level);
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(peak, t0 + 0.07);
  out.gain.setValueAtTime(peak, t0 + 0.55);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.95);
  routeAudio(ctx, out, pan, SFX.groups.vehicles);
  for (const freq of [233, 294]) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0.5;
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 1);
  }
}

// Buses and trucks hiss air when they stop at a kerb.
function airBrake(level, pan) {
  const ctx = SFX.ctx;
  if (!ctx || ctx.state !== 'running' || !SFX.noise) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = SFX.noise;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1700;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.10 * level), t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
  src.connect(f); f.connect(g);
  routeAudio(ctx, g, pan, SFX.groups.vehicles);
  src.start(t0, Math.random() * 1.5, 0.45);
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
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.2);
  src.connect(lp); lp.connect(g);
  routeAudio(ctx, g, (Math.random() * 2 - 1) * 0.5, SFX.groups.weather);
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
// far enough that they are only a few pixels across. The capture radius reaches
// past the screen edge, so leaving the view is a fade rather than a cut.
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
  const now = performance.now();

  // ---- weather, at every zoom -----------------------------------------
  const kind = weatherCells.length || weatherSeeded ? weatherAt(cameraTile().x, cameraTile().y) : 'sunny';
  const rain = kind === 'storm' ? 0.34 : kind === 'rain' ? 0.22 : kind === 'snow' ? 0.06 : 0;
  const wind = kind === 'storm' ? 0.30 : kind === 'rain' ? 0.16 : kind === 'snow' ? 0.20 : kind === 'cloudy' ? 0.08 : 0.04;
  setBus(V.rain, rain, 0);
  setBus(V.wind, wind, 0);
  if (SFX.filters.rain) SFX.filters.rain.frequency.setTargetAtTime(kind === 'storm' ? 3400 : 2600, ctx.currentTime, 1.2);
  if (SFX.filters.wind) SFX.filters.wind.frequency.setTargetAtTime(kind === 'storm' ? 560 : 380, ctx.currentTime, 1.2);
  if (kind === 'storm' && now > SFX.thunderAt) {
    SFX.thunderAt = now + 5000 + Math.random() * 9000;
    thunder();
  }

  // ---- traffic, only while the view is close --------------------------
  // RC is wider than the view: a source just off screen is quieter, not silent.
  const R = Math.min(1500, Math.max(110, Math.max(halfW, halfH) * 1.15));
  const RC = R * 1.7;
  let carW = 0, carP = 0, heavyW = 0, heavyP = 0, trainW = 0, trainP = 0, planeW = 0, planeP = 0;
  const near = (x, y, radius) => {
    const dx = x - cx, dy = y - cy;
    if (dx < -radius || dx > radius || dy < -radius || dy > radius) return null;
    const d = Math.hypot(dx, dy);
    if (d > radius) return null;
    const w = 1 - d / radius;
    return {w: w * w, p: dx / halfW};
  };

  if (z >= 1.5) {
    let n = 0;
    for (const c of cars) {
      if (c.dead) continue;
      const s = near(c.x, c.y, RC);
      if (!s) continue;
      if (c.bus || c.truck) { if (z >= 2.4) { heavyW += s.w * (c.bus ? 1.6 : 1.3); heavyP += s.p * s.w; } }
      else { carW += s.w; carP += s.p * s.w; }
      if (++n > 1400) break;
    }
    // Exponential loudness: one nearby car is clearly audible and a traffic jam
    // does not simply hit the ceiling in a straight line.
    setBus(V.car, 0.80 * (1 - Math.exp(-carW * 1.1)), carW ? carP / carW * 0.75 : 0);
    setBus(V.heavy, 0.70 * (1 - Math.exp(-heavyW * 1.2)), heavyW ? heavyP / heavyW * 0.75 : 0);
  } else {
    setBus(V.car, 0, 0); setBus(V.heavy, 0, 0);
  }

  if (z >= 1.9) {
    for (const m of metros) {
      if (!Number.isFinite(m.x)) continue;
      const s = near(m.x, m.y, RC); if (!s) continue;
      trainW += s.w * 1.2; trainP += s.p * s.w;
    }
    for (const t of freight) {
      if (!Number.isFinite(t.x)) continue;
      const s = near(t.x, t.y, RC); if (!s) continue;
      trainW += s.w * 1.6; trainP += s.p * s.w;
    }
    setBus(V.train, 0.65 * (1 - Math.exp(-trainW)), trainW ? trainP / trainW * 0.75 : 0);
  } else setBus(V.train, 0, 0);

  // Aircraft are audible from further out than a car: an aeroplane is loud and
  // still large on screen at a zoom where cars are specks.
  if (z >= 1.1) {
    const RA = RC * 1.5;
    for (const p of planes) {
      const s = near(p.x, p.y, RA);
      if (!s) continue;
      planeW += s.w * 1.5; planeP += s.p * s.w;
    }
    setBus(V.plane, 0.62 * (1 - Math.exp(-planeW * 0.9)), planeW ? planeP / planeW * 0.85 : 0);
    if (SFX.planeWhine) SFX.planeWhine.frequency.setTargetAtTime(400 + Math.min(1, planeW) * 280, ctx.currentTime, 0.3);
  } else setBus(V.plane, 0, 0);

  // ---- one-shots ------------------------------------------------------
  if (!SFX.on) return;
  const carPan = carW ? clamp(carP / carW * 0.8, -1, 1) : 0;
  const heavyPan = heavyW ? clamp(heavyP / heavyW * 0.8, -1, 1) : 0;
  const trainPan = trainW ? clamp(trainP / trainW * 0.8, -1, 1) : 0;
  if (z >= 1.5 && carW > 0.08 && now > SFX.honkAt) {
    SFX.honkAt = now + 1200 + Math.random() * 2800;
    honk(clamp(0.35 + carW / 5, 0.35, 1), carPan);
  }
  if (z >= 1.9 && trainW > 0.05 && now > SFX.clackAt) {
    SFX.clackAt = now + 230 + Math.random() * 110;
    railClack(clamp(trainW / 4, 0.25, 1), trainPan);
  }
  if (z >= 1.9 && trainW > 0.18 && now > SFX.hornAt) {
    SFX.hornAt = now + 9000 + Math.random() * 9000;
    trainHorn(clamp(trainW / 3, 0.3, 1), trainPan);
  }
  if (z >= 2.4 && heavyW > 0.08 && now > SFX.brakeAt) {
    SFX.brakeAt = now + 5000 + Math.random() * 9000;
    airBrake(clamp(0.35 + heavyW / 4, 0.35, 1), heavyPan);
  }
}

// ---------------------------------------------------------------------
// Volume dialog
// ---------------------------------------------------------------------
function applyMixUI() {
  musicApplyVolume();
  for (const kind of ['music', 'vehicles', 'weather']) {
    const cap = kind[0].toUpperCase() + kind.slice(1);
    const el = document.getElementById('vol' + cap), out = document.getElementById('vol' + cap + 'Val');
    if (el) el.value = Math.round(audioMix[kind] * 100);
    if (out) out.textContent = Math.round(audioMix[kind] * 100) + '%';
  }
  if (SFX.groups.vehicles) {
    const t = SFX.ctx.currentTime;
    SFX.groups.vehicles.gain.setTargetAtTime(audioMix.vehicles * 1.25, t, 0.05);
    SFX.groups.weather.gain.setTargetAtTime(audioMix.weather * 1.15, t, 0.05);
  }
}
function openSoundDlg() {
  applyMixUI();
  const dlg = document.getElementById('soundDlg');
  if (dlg) dlg.classList.remove('hidden');
}
for (const kind of ['music', 'vehicles', 'weather']) {
  const cap = kind[0].toUpperCase() + kind.slice(1);
  const el = document.getElementById('vol' + cap), out = document.getElementById('vol' + cap + 'Val');
  if (!el) continue;
  el.oninput = () => {
    audioMix[kind] = clamp(el.value / 100, 0, 1);
    if (out) out.textContent = el.value + '%';
    applyMixUI();
    mixSave();
  };
}
const soundCloseEl = document.getElementById('soundClose');
if (soundCloseEl) soundCloseEl.onclick = () => document.getElementById('soundDlg').classList.add('hidden');

// Autoplay is blocked until the page has seen a gesture, so the first click or
// keypress starts both the music and the sound engine.
function audioUnlock() {
  removeEventListener('pointerdown', audioUnlock, true);
  removeEventListener('keydown', audioUnlock, true);
  audioStart();
  if (music.enabled && !music.started) musicPlay(music.i);
}

mixLoad();
sfxLoad();
musicLoad();
applyMixUI();
sfxRender();
musicRender();
addEventListener('pointerdown', audioUnlock, true);
addEventListener('keydown', audioUnlock, true);
