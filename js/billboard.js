'use strict';
// =====================================================================
// Billboard policies
//
// A billboard stores {message, tone}. The messages are shared by the
// inspector, the save validator and the local mood model so none of them
// drifts out of step with the others.
// =====================================================================
const BILLBOARD_POLICIES = {
  driving:     {name: 'Driving',       effect: 'Road safety and careful driving'},
  tax:         {name: 'Tax',           effect: 'The city tax rates'},
  environment: {name: 'Environment',   effect: 'Clean air and green space'},
  birth:       {name: 'Birth rate',    effect: 'Starting a family'},
  health:      {name: 'Health',        effect: 'Healthy habits and sickness'},
};
const BILLBOARD_MESSAGES = Object.keys(BILLBOARD_POLICIES);
const BILLBOARD_TONES = ['positive', 'negative'];
const BILLBOARD_HEALTH_RANGE = 12;

function billboardPolicyOf(b) {
  const p = b && b.policy;
  if (!p || !BILLBOARD_POLICIES[p.message] || !BILLBOARD_TONES.includes(p.tone)) {
    return {message: 'driving', tone: 'positive'};
  }
  return {message: p.message, tone: p.tone};
}

// A billboard's face, for the inspector and for any live sign painting.
function billboardPolicyLabel(b) {
  const p = billboardPolicyOf(b);
  return BILLBOARD_POLICIES[p.message].name;
}

// Health ads work on the same local radius as the mood model. A positive
// campaign lifts health mood and makes infection a little less likely nearby;
// a negative one does the reverse. `risk` is a multiplier delta, so callers can
// use `sicknessRisk() * (1 + risk)` without changing the base model.
let billboardHealthStamp = -1;
let billboardHealthSites = null;
function healthBillboardSites() {
  const stamp = Math.floor(gameMin / 15);
  if (billboardHealthSites && billboardHealthStamp === stamp) return billboardHealthSites;
  billboardHealthStamp = stamp;
  billboardHealthSites = [];
  if (typeof buildings === 'undefined' || typeof B !== 'function') return billboardHealthSites;
  for (const b of buildings.values()) {
    if (!b || b.type !== 'billboard') continue;
    const p = billboardPolicyOf(b);
    if (p.message !== 'health') continue;
    billboardHealthSites.push({x: b.cx, y: b.cy, tone: p.tone});
  }
  return billboardHealthSites;
}

function invalidateBillboardHealth() { billboardHealthStamp = -1; billboardHealthSites = null; }
function billboardHealthEffect(x, y) { return billboardHealthEffectAt(x, y); }
function billboardHealthEffectAt(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return {mood: 0, risk: 0, count: 0};
  let mood = 0, risk = 0, count = 0;
  for (const s of healthBillboardSites()) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d > BILLBOARD_HEALTH_RANGE) continue;
    const w = 1 - d / BILLBOARD_HEALTH_RANGE;
    count++;
    if (s.tone === 'positive') { mood += 0.11 * w; risk -= 0.18 * w; }
    else { mood -= 0.10 * w; risk += 0.16 * w; }
  }
  return {mood: clamp(mood, -0.28, 0.28), risk: clamp(risk, -0.32, 0.32), count};
}

// A small live sign over the billboard so the chosen message has a visible
// colour even while the building art is still borrowed from another type.
function drawBillboardSign(c, b) {
  if (!c || !b || typeof T !== 'number') return;
  const p = billboardPolicyOf(b);
  const positive = p.tone === 'positive';
  const x0 = Math.round(b.x * T + 1), y0 = Math.round(b.y * T + 2);
  const w = Math.max(8, b.w * T - 2), h = 7;
  c.fillStyle = '#24282e'; c.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
  c.fillStyle = positive ? '#2f8f4f' : '#a83f3f'; c.fillRect(x0, y0, w, h);
  c.fillStyle = '#f4f5f7'; c.fillRect(x0 + 1, y0 + 1, w - 2, 1);
  c.fillStyle = positive ? '#9be26a' : '#ffb0a8';
  for (let k = 0; k < 3; k++) c.fillRect(x0 + 2, y0 + 3 + k, Math.max(2, w - 5 - k * 2), 1);
}
