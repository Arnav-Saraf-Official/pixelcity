// =====================================================================
// Health and sickness
//
// This is deliberately a foundation rather than an outbreak game: people can
// catch a light illness, get better on their own, recover faster in a hospital,
// and very rarely die when a serious case goes untreated. Households spread it,
// weather and crowding raise the chance, and hospitals lower it. Every number
// lives here so a later version can grow strains, vaccination and policy
// without hunting through the traffic simulation.
// =====================================================================
const SICKNESS = {
  total: 0,          // people who have ever been ill
  recovered: 0,
  deaths: 0,
  days: 0,           // person-days spent ill
  outbreaks: 0,
  patients: 0,       // serious cases currently occupying hospital beds
  lastOutbreak: -1e9,
};
const HOSPITAL_BEDS_PER_BUILDING = 45;
const ILLNESSES = [
  {key: 'cold', name: 'a cold', spread: 0.7, severity: 0.55},
  {key: 'flu', name: 'the flu', spread: 1, severity: 1},
  {key: 'fever', name: 'a fever', spread: 0.85, severity: 0.8},
  {key: 'chest', name: 'a chest infection', spread: 1.15, severity: 1.2},
];
const illnessByKey = key => ILLNESSES.find(i => i.key === key) || ILLNESSES[0];

function resetSickness() {
  SICKNESS.total = 0; SICKNESS.recovered = 0; SICKNESS.deaths = 0;
  SICKNESS.days = 0; SICKNESS.outbreaks = 0; SICKNESS.patients = 0;
  SICKNESS.lastOutbreak = -1e9;
}
function hospitalBeds() { return hospitalCount() * HOSPITAL_BEDS_PER_BUILDING; }
function healthCoverage() { return Math.min(1, hospitalCount() * 260 / Math.max(1, agents.length)); }
function infectedCount() { let n = 0; for (const a of agents) if (a.sick) n++; return n; }

// One pass over the population for every health figure the simulation and the
// statistics screens need. Households with a sick resident are counted too:
// they are where work and travel are suppressed beyond the sick person alone.
function sicknessSnapshot() {
  const ideal = worldSettings.difficulty === 'ideal';
  const snap = {pop: 0, healthy: 0, sick: 0, severe: 0, employed: 0, effectiveWorkers: 0,
    affectedResidents: 0, sickHomes: 0, avgHealth: 1, coverage: healthCoverage(),
    health: 1, work: 1, travel: 1};
  const homes = new Map();
  let healthSum = 0;
  for (const a of agents) {
    if (a.dead) continue;
    snap.pop++;
    let h = homes.get(a.home);
    if (!h) homes.set(a.home, h = {n: 0, sick: 0});
    h.n++;
    if (a.sick) { snap.sick++; h.sick++; if ((a.illness || 0) > 0.4) snap.severe++; }
    else snap.healthy++;
    if (a.job) snap.employed++;
    healthSum += clamp(a.health ?? 1, 0, 1);
  }
  const pop = snap.pop;
  if (!pop) return snap;
  for (const h of homes.values()) if (h.sick) { snap.sickHomes++; snap.affectedResidents += h.n; }
  snap.avgHealth = healthSum / pop;
  const sickShare = snap.sick / pop;
  const contactShare = Math.max(0, snap.affectedResidents / pop - sickShare);
  if (ideal) {
    snap.effectiveWorkers = snap.employed;
    return snap;
  }
  // A sick household loses some of its healthy residents' work and travel too.
  // The direct cases are the larger effect; household caution is the smaller one.
  snap.work = clamp(1 - sickShare * 0.85 - contactShare * 0.30, 0.15, 1);
  snap.travel = clamp(1 - sickShare * 0.75 - contactShare * 0.22, 0.20, 1);
  snap.effectiveWorkers = Math.round(snap.employed * snap.work);
  const burden = clamp((snap.sick + snap.severe * 0.75) / pop, 0, 1);
  snap.health = clamp(snap.avgHealth * 0.55 + (0.45 + 0.55 * snap.coverage) * 0.22
    + (1 - burden * 1.35) * 0.23, 0.03, 1);
  return snap;
}
// Total city health: average physical health, hospital coverage and the current
// illness burden in one 0-1 figure (shown as a percentage in the statistics).
function cityHealth() { return sicknessSnapshot().health; }
// How much of the workforce is actually available, and how willing the city is
// to travel while households are ill.
function sicknessWorkFactor() { return sicknessSnapshot().work; }
function sicknessTravelFactor() { return sicknessSnapshot().travel; }

// A new case. The caller decides who is exposed; this only applies the illness.
function infectAgent(a, source) {
  if (!a || a.dead || a.sick || worldSettings.difficulty === 'ideal') return false;
  const strain = ILLNESSES[Math.floor(Math.random() * ILLNESSES.length)];
  a.sick = true;
  a.illnessKey = strain.key;
  a.illness = 0.18 + Math.random() * 0.16;
  a.sickSince = gameMin;
  a.health = Math.min(a.health ?? 1, 0.85);
  a.immunity = clamp((a.immunity ?? 0.4) - 0.08, 0, 1);
  SICKNESS.total++;
  if (SICKNESS.total === 1 || gameMin - SICKNESS.lastOutbreak > 2880) {
    SICKNESS.outbreaks++;
    SICKNESS.lastOutbreak = gameMin;
    if (typeof toast === 'function') toast('Illness is spreading in the city.', 'warning');
  }
  return true;
}

function recoverAgent(a) {
  a.sick = false;
  a.illness = 0;
  a.health = Math.max(0.55, a.health ?? 0.7);
  a.immunity = clamp((a.immunity ?? 0.4) + 0.24, 0, 1);
  a.mood = clamp(a.mood + 0.08, 0, 1);
  a.stress = Math.max(0, (a.stress || 0) - 0.2);
  SICKNESS.recovered++;
}

// How likely an hour is to produce new cases. Kept as a function so the stats
// screen can show the same risk the simulation is acting on.
function sicknessRisk() {
  const pop = agents.length;
  if (!pop) return 0;
  let sick = 0;
  for (const a of agents) if (a.sick) sick++;
  const cover = healthCoverage();
  const weather = weatherNow().kind;
  const wx = {sunny: 0.65, cloudy: 0.9, rain: 1.25, storm: 1.45, snow: 1.4}[weather] ?? 1;
  let homes = 0;
  for (const b of buildings.values()) homes += BT[b.type].homes || 0;
  const crowding = pop / Math.max(1, homes);
  let food = 0;
  try { const m = materialTotals(); food = (m.produce || 0) + (m.fish || 0); } catch (e) { /* logistics can still be loading */ }
  const hungry = food < pop * 1.5 ? clamp(1 - food / Math.max(1, pop * 1.5), 0, 1) : 0;
  return clamp(0.0004 * wx * (0.6 + crowding) * (1.2 - cover * 0.6) * (1 + sick / pop * 6) * (1 + hungry * 0.8), 0, 0.02);
}

function sicknessHour() {
  const pop = agents.length;
  if (!pop) return;
  const beds = hospitalBeds();
  let patients = 0;
  const healthy = [];
  const byHome = new Map();
  for (const a of agents) {
    if (a.dead) continue;
    if (!a.sick) healthy.push(a);
    const list = byHome.get(a.home);
    if (list) list.push(a); else byHome.set(a.home, [a]);
  }

  // New cases in the wider city. One roll covers the whole population, so a
  // large city does not get one infection check per resident per hour. A city
  // whose residents are already run down catches new bugs more easily, and a
  // health billboard near home shades the local odds: positive ads reduce them,
  // negative ads make illness more likely.
  const healthDrag = 1 + Math.max(0, 0.7 - cityHealth()) * 0.55;
  let adWeight = 0, adHomes = 0;
  for (const a of healthy) {
    const H = B(a.home);
    if (!H || typeof billboardHealthEffectAt !== 'function') continue;
    adWeight += clamp(1 + billboardHealthEffectAt(H.cx, H.cy).risk, 0.55, 1.45);
    adHomes++;
  }
  const adFactor = adHomes ? adWeight / adHomes : 1;
  const expected = pop * sicknessRisk() * healthDrag * adFactor;
  let cases = Math.floor(expected);
  if (Math.random() < expected - cases) cases++;
  for (let k = 0; k < cases && healthy.length; k++) {
    const idx = Math.floor(Math.random() * healthy.length);
    const a = healthy.splice(idx, 1)[0];
    infectAgent(a);
  }

  // Household contagion: the old version of this foundation had no neighbours
  // to infect, but a home is the obvious place for a bug to pass around.
  for (const a of agents) {
    if (!a.sick || a.dead) continue;
    const strain = illnessByKey(a.illnessKey);
    const chance = 0.012 * strain.spread * (0.5 + a.illness);
    const list = byHome.get(a.home) || [];
    for (const o of list) {
      if (o === a || o.sick || o.dead) continue;
      const resistance = 1 - clamp(o.immunity ?? 0.4, 0, 1) * 0.65;
      if (Math.random() < chance * resistance) infectAgent(o, a);
    }
  }

  // Progress every illness one game hour.
  for (const a of agents) {
    if (!a.sick || a.dead) continue;
    const strain = illnessByKey(a.illnessKey);
    const sickFor = gameMin - (a.sickSince || gameMin);
    const severe = a.illness > 0.4;
    const care = severe && patients < beds ? 1 : 0;
    if (care) patients++;
    // It builds for a day and a half, then the body (and a hospital, if there is
    // room) clears it. A serious untreated case can be fatal, but rarely.
    const resistance = 1 - clamp(a.immunity ?? 0.4, 0, 1) * 0.35;
    const climb = sickFor < 36 ? 0.013 * strain.severity * resistance : 0;
    const fall = sickFor >= 36 ? 0.017 + care * 0.012 : 0;
    a.illness = clamp(a.illness + climb - fall, 0, 1);
    a.health = clamp(1 - a.illness * 0.78, 0.08, 1);
    a.stress = clamp((a.stress || 0) + 0.015, 0, 1);
    a.moodHealth = clamp(1 - a.illness * 0.85, 0.05, 1);
    if (a.illness >= 0.82 && !care && Math.random() < 0.018) {
      killAgent(a);
      agentsDirty = true;
      SICKNESS.deaths++;
      continue;
    }
    if (a.illness <= 0.055 && sickFor > 24) recoverAgent(a);
  }
  SICKNESS.patients = patients;
  SICKNESS.days += infectedCount() / 24;
  // Immunity fades very slowly, leaving room for repeats in later versions.
  for (const a of agents) {
    if (!a.sick) a.immunity = clamp((a.immunity ?? 0.4) - 0.0004, 0.15, 1);
  }
}

// Mood naming: sickness and anxiety are conditions, not points on the happiness
// scale, so they take precedence over the scalar mood face.
function agentMoodKind(a) {
  if (a.sick) return 'sick';
  if ((a.stress || 0) > 0.7) return 'anxious';
  return moodFace(a.mood);
}
function homeMoodKind(b) {
  if (b.sick) return 'sick';
  if ((b.stress || 0) > 0.7) return 'anxious';
  return moodFace(b.mood);
}
