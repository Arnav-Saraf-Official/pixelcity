'use strict';
// =====================================================================
// Background music: Eric Skiff - Resistor Anthems (CC BY 3.0)
// =====================================================================
// The whole album streams from the Internet Archive copy of the release, so the
// game needs no bundled audio files. Attribution is shown in the music panel and
// in How to play, which is what the licence asks for.
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
  volume: 0.45,
  muted: false,
  enabled: true,
  started: false,     // has playback actually begun at least once
  failures: 0,        // consecutive load errors, so an offline session stops retrying
};
music.el.preload = 'none';

const musicPanelEl = document.getElementById('musicPanel');
const musicChipEl = document.getElementById('musicChip');
const musicNowEl = document.getElementById('musicNow');
const musicListEl = document.getElementById('musicList');
const musicPlayEl = document.getElementById('musicPlay');
const musicVolEl = document.getElementById('musicVol');
const musicMuteEl = document.getElementById('musicMute');

function musicLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(MUSIC_KEY));
    if (!saved || typeof saved !== 'object') return;
    if (Number.isFinite(saved.volume)) music.volume = clamp(saved.volume, 0, 1);
    if (typeof saved.muted === 'boolean') music.muted = saved.muted;
    if (typeof saved.enabled === 'boolean') music.enabled = saved.enabled;
    if (Number.isInteger(saved.track) && saved.track >= 0 && saved.track < MUSIC_TRACKS.length) music.i = saved.track;
  } catch (e) { /* a broken preference just means default volume */ }
}
function musicSave() {
  try {
    localStorage.setItem(MUSIC_KEY, JSON.stringify({volume: music.volume, muted: music.muted, enabled: music.enabled, track: music.i}));
  } catch (e) { /* private mode or a full quota: music simply will not be remembered */ }
}
function musicApplyVolume() {
  music.el.volume = music.muted ? 0 : music.volume;
  musicVolEl.value = Math.round(music.volume * 100);
  musicMuteEl.textContent = music.muted ? 'Unmute' : 'Mute';
}

function musicRender() {
  const track = MUSIC_TRACKS[music.i];
  musicApplyVolume();
  const playing = music.enabled && music.started && !music.el.paused;
  musicChipEl.classList.toggle('on', !!playing);
  document.getElementById('musicState').textContent = !music.enabled ? 'Music off' : playing ? 'Playing' : 'Music';
  musicPlayEl.textContent = playing ? '❚❚' : '▶';
  musicPlayEl.title = playing ? 'Pause' : 'Play';
  musicNowEl.textContent = music.enabled ? track.name : 'Music is off';
  const sub = document.createElement('small');
  sub.textContent = music.failures >= MUSIC_TRACKS.length
    ? 'The tracks could not be reached — check your connection.'
    : 'Resistor Anthems · Eric Skiff';
  musicNowEl.append(sub);
  for (const b of musicListEl.children) {
    const on = +b.dataset.track === music.i;
    b.classList.toggle('on', on);
    b.firstChild.textContent = on && playing ? '＞' : on ? '·' : '';
  }
}

// Autoplay is blocked until the player has seen a gesture, so the first click
// anywhere in the game starts the music.
function musicUnlock() {
  removeEventListener('pointerdown', musicUnlock, true);
  removeEventListener('keydown', musicUnlock, true);
  if (music.enabled && !music.started) musicPlay(music.i);
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
  if (!music.enabled) return;
  if (!music.started || !music.el.src) { musicPlay(music.i); return; }
  if (music.el.paused) {
    const p = music.el.play();
    if (p && p.catch) p.catch(() => { music.started = false; musicRender(); });
  } else music.el.pause();
  musicRender();
}

music.el.addEventListener('playing', () => { music.failures = 0; music.started = true; musicRender(); });
music.el.addEventListener('pause', musicRender);
music.el.addEventListener('ended', () => musicPlay(music.i + 1));
// A missing track or a dropped connection moves on to the next one; when every
// track has failed the player stops rather than hammering the network.
music.el.addEventListener('error', () => {
  music.failures++;
  if (music.failures >= MUSIC_TRACKS.length) {
    music.started = false;
    musicRender();
    return;
  }
  musicPlay(music.i + 1);
});

musicChipEl.onclick = () => {
  musicPanelEl.classList.toggle('hidden');
  if (!musicPanelEl.classList.contains('hidden')) musicRender();
};
document.getElementById('musicClose').onclick = () => musicPanelEl.classList.add('hidden');
musicPlayEl.onclick = musicToggle;
document.getElementById('musicPrev').onclick = () => musicPlay(music.i - 1);
document.getElementById('musicNext').onclick = () => musicPlay(music.i + 1);
musicMuteEl.onclick = () => { music.muted = !music.muted; musicApplyVolume(); musicSave(); musicRender(); };
musicVolEl.oninput = () => {
  music.volume = clamp(musicVolEl.value / 100, 0, 1);
  if (music.volume > 0) music.muted = false;
  musicApplyVolume();
  musicRender();
  musicSave();
};

for (let k = 0; k < MUSIC_TRACKS.length; k++) {
  const b = document.createElement('button');
  b.dataset.track = k;
  const mark = document.createElement('i');
  const name = document.createElement('span');
  name.textContent = `${k + 1}. ${MUSIC_TRACKS[k].name}`;
  b.append(mark, name);
  b.onclick = () => musicPlay(k);
  musicListEl.append(b);
}

musicLoad();
musicApplyVolume();
musicRender();

// The chip starts hidden with the rest of the HUD on the start screen, so the
// unlock listener is enough to get music going; it also covers keyboard starts.
addEventListener('pointerdown', musicUnlock, true);
addEventListener('keydown', musicUnlock, true);
