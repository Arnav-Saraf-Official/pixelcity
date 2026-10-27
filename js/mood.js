'use strict';
// =====================================================================
// Local mood factors
//
// City-wide mood says how the region is doing. This module answers the
// smaller question a resident asks: what is it like where I live? It reads
// nearby parks, traffic, industry, incidents, hospitals, shops, water and
// health billboards, and returns a small set of 0..1 factors. `overall` is
// the blend the simulation should use for that home.
//
// The module only reads game state; it never advances the simulation. That
// keeps it safe to call from mood updates, inspectors and statistics panels.
// =====================================================================
const LOCAL_MOOD_RADIUS = 14;
const LOCAL_MOOD_STAMP_MINUTES = 15;
const LOCAL_POLLUTION_TYPES = new Set([
  'factory', 'warehouse', 'distribution', 'railyard', 'port', 'riverWharf',
  'quarry', 'mine', 'oilRig', 'gasWell', 'loggingCamp', 'seafoodPlant',
  'woodPlant', 'coalPlant', 'gasPlant', 'nuclearPlant',
]);
const LOCAL_GREEN_TYPES = new Set([
  'park', 'boardwalk', 'ferrisWheel', 'aquarium', 'plaza', 'greenhouse', 'orchard',
]);
const localMoodClamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

let localMoodStamp = '';
let localMoodLandmarks = null;
let localMoodCache = new Map();

function localMoodVersion() {
  const hour = Math.floor(gameMin / LOCAL_MOOD_STAMP_MINUTES);
  const count = typeof buildings !== 'undefined' ? buildings.size : 0;
  const bids = typeof nextBid !== 'undefined' ? nextBid : 0;
  const roads = typeof roadVersion !== 'undefined' ? roadVersion : 0;
  return hour + ':' + count + ':' + bids + ':' + roads;
}

function buildLocalMoodLandmarks() {
  const out = {green: [], industry: [], shops: [], hospitals: [], safety: []};
  if (typeof buildings === 'undefined') return out;
  for (const b of buildings.values()) {
    if (!b || !b.type) continue;
    const d = typeof BT !== 'undefined' ? BT[b.type] : null;
    const row = {x: b.cx, y: b.cy, type: b.type};
    if (LOCAL_GREEN_TYPES.has(b.type) || (d && typeof isLeisure === 'function' && isLeisure(b.type))) out.green.push(row);
    if (LOCAL_POLLUTION_TYPES.has(b.type)) out.industry.push(row);
    if (b.type === 'hospital') out.hospitals.push(row);
    if (b.type === 'fireStation' || b.type === 'policeStation') out.safety.push(row);
    if (d && d.cat === 'com') out.shops.push(row);
  }
  return out;
}

function localMoodLandmarkData() {
  const stamp = localMoodVersion();
  if (!localMoodLandmarks || stamp !== localMoodStamp) {
    localMoodStamp = stamp;
    localMoodLandmarks = buildLocalMoodLandmarks();
    localMoodCache = new Map();
  }
  return localMoodLandmarks;
}

function localMoodNear(x, y, list, radius) {
  let sum = 0, nearest = Infinity;
  for (const o of list) {
    const d = Math.hypot(o.x - x, o.y - y);
    if (d > radius) continue;
    sum += 1 - d / radius;
    if (d < nearest) nearest = d;
  }
  return {weight: sum, nearest};
}

function localMoodFactors(home) {
  const x = home && Number.isFinite(home.cx) ? home.cx : home && Number.isFinite(home.x) ? home.x : 0;
  const y = home && Number.isFinite(home.cy) ? home.cy : home && Number.isFinite(home.y) ? home.y : 0;
  const key = (home && home.id ? 'b' + home.id : Math.round(x) + ',' + Math.round(y));
  const landmarks = localMoodLandmarkData();
  const cached = localMoodCache.get(key);
  if (cached) return cached;

  // Green space: nearby leisure plots, plus a little credit for tree cover.
  const greenSpots = localMoodNear(x, y, landmarks.green, LOCAL_MOOD_RADIUS);
  let trees = 0;
  if (typeof tree !== 'undefined' && typeof MW === 'number' && typeof inb === 'function') {
    const tx = Math.round(x), ty = Math.round(y);
    for (let yy = ty - 8; yy <= ty + 8; yy += 2) for (let xx = tx - 8; xx <= tx + 8; xx += 2) {
      if (inb(xx, yy) && tree[yy * MW + xx]) trees++;
    }
  }
  const green = localMoodClamp(0.16 + greenSpots.weight * 0.36 + Math.min(0.16, trees * 0.012), 0.05, 1);

  // Noise and pollution are returned as burdens: 0 is calm/clean, 1 is bad.
  let heatSum = 0, heatN = 0, highways = 0;
  if (typeof heat !== 'undefined' && typeof tile !== 'undefined' && typeof MW === 'number' && typeof inb === 'function') {
    const tx = Math.round(x), ty = Math.round(y);
    for (let yy = ty - 7; yy <= ty + 7; yy += 2) for (let xx = tx - 7; xx <= tx + 7; xx += 2) {
      if (!inb(xx, yy)) continue;
      const i = yy * MW + xx;
      heatSum += heat[i] || 0;
      if (tile[i] === 2) highways++;
      heatN++;
    }
  }
  const heatAvg = heatN ? heatSum / heatN : 0;
  const noise = localMoodClamp(heatAvg * 0.9 + highways / Math.max(1, heatN) * 0.7, 0, 1);

  const industry = localMoodNear(x, y, landmarks.industry, LOCAL_MOOD_RADIUS);
  const pollution = localMoodClamp(industry.weight * 0.22, 0, 1);

  // Safety: local incidents are temporary, while fire and police stations are
  // a lasting reassurance.
  let incidentNear = 0;
  if (typeof incidents !== 'undefined') {
    for (const inc of incidents) {
      if (!inc || inc.state === 'done') continue;
      const d = Math.hypot(inc.x - x, inc.y - y);
      if (d <= LOCAL_MOOD_RADIUS) incidentNear += 1 - d / LOCAL_MOOD_RADIUS;
    }
  }
  const safetySpots = localMoodNear(x, y, landmarks.safety, LOCAL_MOOD_RADIUS);
  const safety = localMoodClamp(0.52 + safetySpots.weight * 0.16 - incidentNear * 0.34, 0.05, 1);

  // Care: distance to the nearest hospital, not the city-wide bed count.
  const careSpot = localMoodNear(x, y, landmarks.hospitals, 24);
  const care = localMoodClamp(0.12 + (Number.isFinite(careSpot.nearest) ? (1 - Math.min(1, careSpot.nearest / 24)) : 0) * 0.76, 0.05, 1);

  // Shops: a corner shop close by is a small, everyday mood lift.
  const shopSpots = localMoodNear(x, y, landmarks.shops, 12);
  const shops = localMoodClamp(0.2 + shopSpots.weight * 0.5, 0.05, 1);

  // Health advertising: positive campaigns lift the local mood; negative ones
  // deliberately do the opposite.
  const ad = typeof billboardHealthEffectAt === 'function'
    ? billboardHealthEffectAt(x, y) : {mood: 0, risk: 0, count: 0};
  const billboard = localMoodClamp(0.5 + ad.mood * 1.7, 0.02, 1);

  // Water is scenery, but a shore within a short walk genuinely feels nicer.
  let waterNear = 0, waterN = 0;
  if (typeof water !== 'undefined' && typeof MW === 'number' && typeof inb === 'function') {
    const tx = Math.round(x), ty = Math.round(y);
    for (let yy = ty - 11; yy <= ty + 11; yy += 3) for (let xx = tx - 11; xx <= tx + 11; xx += 3) {
      if (!inb(xx, yy)) continue;
      waterN++;
      if (water[yy * MW + xx]) waterNear++;
    }
  }
  const waterfront = localMoodClamp(waterN ? waterNear / waterN * 1.8 : 0, 0, 1);

  // Crowding is measured against this home's own capacity.
  let crowding = 0.55;
  if (home && typeof BT !== 'undefined' && BT[home.type] && BT[home.type].homes) {
    const occ = (home.residents || 0) / BT[home.type].homes;
    crowding = localMoodClamp(1 - Math.max(0, occ - 0.65) * 1.15, 0, 1);
  }

  const overall = localMoodClamp(
    green * 0.14 + (1 - noise) * 0.11 + (1 - pollution) * 0.14 +
    safety * 0.12 + care * 0.12 + shops * 0.09 + billboard * 0.07 +
    crowding * 0.11 + waterfront * 0.10,
    0.02, 1);

  const result = {
    green, noise, pollution, safety, care, shops, billboard, waterfront, crowding,
    quiet: 1 - noise, cleanAir: 1 - pollution, overall,
    healthAd: ad.mood, infectionPressure: ad.risk, healthAds: ad.count,
  };
  localMoodCache.set(key, result);
  return result;
}

function invalidateLocalMoodFactors() {
  localMoodStamp = '';
  localMoodLandmarks = null;
  localMoodCache = new Map();
}

// Coordinate helper for statistics and tests. The synthetic object has no
// residents, so crowding is neutral.
function localMoodAt(x, y) { return localMoodFactors({x, y, cx: x, cy: y}); }
