// =====================================================================
// City statistics
//
// One collector feeds two views: the small popup from the top bar and the
// full-screen record. Both read live simulation state, so a number here is
// always the same number the rest of the HUD is showing.
// =====================================================================
const TILE_METRES = 10;                       // one city tile reads as ten metres
const milesOf = tiles => tiles * TILE_METRES / 1609.344;
const milesText = tiles => milesOf(tiles).toFixed(1) + ' mi';
const countText = n => Number(n || 0).toLocaleString('en-US');
const moodPct = v => Math.round(clamp(v || 0, 0, 1) * 100) + '%';
const statClock = () => {
  const h = (gameMin / 60) % 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const statDay = () => Math.floor(gameMin / 1440) + 1;
function statWorldName() {
  try {
    const slot = (typeof worldSlots !== 'undefined' ? worldSlots : []).find(s => s.id === activeWorldId);
    if (slot && slot.name) return slot.name;
  } catch (e) { /* the slot index is optional here */ }
  return 'Unsaved region';
}

// Everything the two panels display, gathered in one pass over the map.
function collectCityStats() {
  let roads = 0, streets = 0, highways = 0, bridges = 0, sidewalks = 0, oneways = 0;
  let trackTiles = 0, twoWayTiles = 0, railTiles = 0, railJunctions = 0, crossings = 0;
  let trees = 0, wet = 0, painted = 0, roadTiles = 0, heatSum = 0, worstHeat = 0, worstTile = -1;
  for (let i = 0; i < N; i++) {
    const t = tile[i];
    if (t === 1 || t === 2) {
      roads++; roadTiles++;
      if (t === 1) streets++; else highways++;
      if (water[i]) bridges++;
      if (walkway[i]) sidewalks++;
      if (oneway[i]) oneways++;
      heatSum += heat[i];
      if (heat[i] > worstHeat) { worstHeat = heat[i]; worstTile = i; }
    }
    if (trackOn[i]) { trackTiles++; if (trackWide[i]) twoWayTiles++; if (t === 1 || t === 2) crossings++; }
    if (railOn[i]) { railTiles++; if (bits(rail[i]) >= 3) railJunctions++; }
    if (tree[i] && !bldAt[i]) trees++;
    if (water[i]) wet++;
    if (districtLayer[i]) painted++;
  }

  let homes = 0, jobSlots = 0, built = 0, warehouses = 0, warehouseLoad = 0, warehouseCount = 0, asleep = 0;
  let hospitals = 0, fireStations = 0, policeStations = 0, foodSites = 0, producers = 0;
  const byCat = Object.create(null), byType = Object.create(null);
  for (const b of buildings.values()) {
    built++;
    const d = BT[b.type];
    homes += d.homes || 0;
    jobSlots += d.jobs || 0;
    asleep += b.asleep || 0;
    byCat[d.cat] = (byCat[d.cat] || 0) + 1;
    byType[b.type] = (byType[b.type] || 0) + 1;
    if (b.type === 'warehouse') { warehouses++; warehouseCount++; warehouseLoad += warehouseTotal(b); }
    if (b.type === 'hospital') hospitals++;
    if (b.type === 'fireStation') fireStations++;
    if (b.type === 'policeStation') policeStations++;
    const p = producerOf(b);
    if (p) {
      producers++;
      if (p.good === 'produce' || p.good === 'fish') foodSites++;
    }
  }

  let employed = 0, moodSum = 0, stressSum = 0, healthSum = 0, immunitySum = 0;
  const moods = {ecstatic: 0, happy: 0, content: 0, uneasy: 0, miserable: 0, angry: 0};
  let anxious = 0, unwell = 0;
  for (const a of agents) {
    if (a.job) employed++;
    moodSum += a.mood;
    stressSum += a.stress || 0;
    healthSum += a.health ?? 1;
    immunitySum += a.immunity ?? 0.5;
    if (a.sick) unwell++;
    if (a.sick) continue;
    const kind = agentMoodKind(a);
    if (kind === 'anxious') anxious++;
    else if (moods[kind] !== undefined) moods[kind]++;
  }
  const sickShare = agents.length ? unwell / agents.length : 0;
  const infectionRisk = typeof sicknessRisk === 'function' ? sicknessRisk() : 0;
  const healthSnap = typeof sicknessSnapshot === 'function' ? sicknessSnapshot() : null;
  const healthTotal = healthSnap ? healthSnap.health : (agents.length ? healthSum / agents.length : 1);
  const healthyResidents = healthSnap ? healthSnap.healthy : agents.length - unwell;
  const workCapacity = healthSnap ? healthSnap.work : 1;
  const travelActivity = healthSnap ? healthSnap.travel : 1;
  const effectiveWorkers = healthSnap ? healthSnap.effectiveWorkers : employed;
  const sickHomes = healthSnap ? healthSnap.sickHomes : 0;

  let carCount = 0, trucks = 0, buses = 0, busRiders = 0, waitingCars = 0, through = 0;
  for (const c of cars) {
    carCount++;
    if (c.truck) trucks++;
    if (c.bus) { buses++; busRiders += c.riders.length; }
    if (c.through) through++;
    if (c.wait > 0.4) waitingCars++;
  }
  let wagons = 0;
  for (const t of freight) wagons += t.consist.length;
  waitingCars += Math.round(stats.wait || 0);

  const mt = materialTotals();
  const taxesDaily = agents.length * ((worldSettings.taxSales || 0) / 100) * 20
    + employed * ((worldSettings.taxIncome || 0) / 100) * 40;
  let foodPerDay = 0;
  for (const b of buildings.values()) {
    const p = producerOf(b);
    if (!p || (p.good !== 'produce' && p.good !== 'fish')) continue;
    foodPerDay += p.rate * (Number.isFinite(b.efficiency) ? b.efficiency : 1) * 24;
  }

  const activeIncidents = incidents.filter(i => i.state !== 'done');
  const activeFires = activeIncidents.filter(i => i.kind === 'fire').length;
  const activeCrashes = activeIncidents.filter(i => i.kind === 'crash').length;
  const unitsOut = units.filter(u => u.state !== 'idle').length;
  const avgTrip = stats.trips.length ? stats.trips.reduce((sum, v) => sum + v, 0) / stats.trips.length : 0;
  let metroRiding = 0;
  for (const m of metros) metroRiding += m.riders.length;
  let metroWaiting = 0;
  for (const [, list] of metroWait) metroWaiting += list.length;

  const flow = carCount ? grade(stats.ti)[0] : '-';
  const worstWhere = !roads ? 'no roads'
    : worstTile >= 0 ? `${DISTRICTS[districtOf(worstTile % MW, (worstTile / MW) | 0)]} · ${heatLabel(worstHeat)}`
    : 'free flowing across the region';
  const plants = Object.create(null);
  for (const p of power.plants) plants[p.type] = (plants[p.type] || 0) + 1;

  const summary = [
    ['Population', `${countText(agents.length)} / ${countText(homes)}`],
    ['Jobs filled', `${countText(employed)} / ${countText(jobSlots)}`],
    ['Food in city', countText(mt.produce + mt.fish) + ' units'],
    ['Tax revenue (est.)', `${countText(Math.round(taxesDaily))} coins/day`],
    ['Tax rates', `sales ${worldSettings.taxSales || 0}% · income ${worldSettings.taxIncome || 0}%`],
    ['City mood', `${moodPct(cityMood.overall)} overall${unwell ? ` · ${unwell} unwell` : ''}`],
    ['City health', `${moodPct(healthTotal)}${unwell ? ` · ${unwell} unwell` : ''}`],
    ['Traffic', `${flow} · ${Math.round(stats.ti * 100)}% congestion`],
    ['Average trip', avgTrip ? `${Math.round(avgTrip)} min` : '-'],
    ['Power demand', `${countText(power.demand)} MW`],
    ['Weather', weatherNow().name],
    ['Date', `Day ${statDay()} · ${statClock()}`],
    ['Urgent', `${activeIncidents.length} incident${activeIncidents.length === 1 ? '' : 's'} · ${unitsOut} unit${unitsOut === 1 ? '' : 's'} out`],
  ];

  const groups = [
    {
      title: 'City',
      rows: [
        ['World', statWorldName()],
        ['Seed', String(worldSeed)],
        ['Difficulty', worldSettings.difficulty],
        ['Building requirements', worldSettings.placement === 'lenientRoads' ? 'roads can be missing' : 'require everything'],
        ['Day', String(statDay())],
        ['Clock', statClock()],
        ['Weather', weatherNow().name],
        ['Districts painted', `${districts.size} named · ${countText(painted)} tiles`],
        ['Buildings', countText(built)],
        ['Residents', countText(agents.length)],
        ['Housing capacity', countText(homes)],
        ['Jobs', countText(jobSlots)],
        ['Jobs filled', countText(employed)],
        ['Unemployed residents', countText(Math.max(0, agents.length - employed))],
      ],
    },
    {
      title: 'Moods & people',
      rows: [
        ['City mood, overall', moodPct(cityMood.overall)],
        ['Mood about jobs', moodPct(cityMood.job)],
        ['Mood about transport', moodPct(cityMood.transport)],
        ['Mood about housing', moodPct(cityMood.housing)],
        ['Mood about health', moodPct(cityMood.health)],
        ['Mood about safety', moodPct(cityMood.safety)],
        ['Mood about leisure', moodPct(cityMood.leisure)],
        ['Mood about taxes', moodPct(cityMood.taxes)],
        ['Mood about weather', moodPct(cityMood.weather)],
        ['Mood about the neighbourhood', moodPct(cityMood.local)],
        ['Mood about starting families', moodPct(cityMood.repro)],
        ['Average resident mood', agents.length ? moodPct(moodSum / agents.length) : '-'],
        ['Average stress', agents.length ? moodPct(stressSum / agents.length) : '-'],
        ['Delighted residents', countText(moods.ecstatic)],
        ['Happy residents', countText(moods.happy)],
        ['Content residents', countText(moods.content)],
        ['Uneasy residents', countText(moods.uneasy)],
        ['Miserable residents', countText(moods.miserable)],
        ['Furious residents', countText(moods.angry)],
        ['Anxious residents', countText(anxious)],
        ['Unwell residents', countText(unwell)],
        ['Parking failures', countText(stats.frustrated)],
        ['Trips abandoned', countText(stats.stranded)],
        ['Residents asleep right now', countText(asleep)],
      ],
    },
    {
      title: 'Roads & traffic',
      rows: [
        ['Road laid', milesText(roads)],
        ['Street laid', milesText(streets)],
        ['Highway laid', milesText(highways)],
        ['Road tiles', countText(roads)],
        ['Bridges', countText(bridges)],
        ['Intersections (3+ legs)', countText(countIntersections())],
        ['Traffic lights', countText(lights.size)],
        ['Overpasses', countText(overpassList.length)],
        ['One-way tiles', countText(oneways)],
        ['Sidewalk tiles', countText(sidewalks)],
        ['Cars on the road', countText(carCount)],
        ['Trucks on the road', countText(trucks)],
        ['Buses on the road', countText(buses)],
        ['Cars waiting', countText(waitingCars)],
        ['Through traffic', countText(through)],
        ['Congestion now', `${Math.round(stats.ti * 100)}% · ${flow}`],
        ['Worst congestion', worstWhere],
        ['Average trip', avgTrip ? `${Math.round(avgTrip)} min` : '-'],
        ['Trips completed', countText(stats.totalTrips || 0)],
        ['Pedestrians walking', countText(peds.length)],
      ],
    },
    {
      title: 'Transit',
      rows: [
        ['Metro stations', countText(stations.length)],
        ['Metro trains', countText(metros.length)],
        ['Riders on board', countText(metroRiding)],
        ['Riders waiting', countText(metroWaiting)],
        ['Metro rail laid', milesText(railTiles)],
        ['Rail tiles', countText(railTiles)],
        ['Rail junctions', countText(railJunctions)],
        ['Two-way track tiles', countText(twoWayTiles)],
        ['Bus stops', countText(busStops.length)],
        ['Bus riders on board', countText(busRiders)],
      ],
    },
    {
      title: 'Freight & shipping',
      rows: [
        ['Freight track laid', milesText(trackTiles)],
        ['All track laid', milesText(trackTiles + railTiles)],
        ['Track tiles', countText(trackTiles)],
        ['Track networks', countText(typeof trackCompCount === 'number' ? trackCompCount : 0)],
        ['Rail signals', countText(trackSignals.length / 3)],
        ['Level crossings', countText(crossings)],
        ['Crossing gates', countText(gates.size)],
        ['Train yards', countText(yards.length)],
        ['Freight trains', countText(freight.length)],
        ['Freight wagons', countText(wagons)],
        ['Freight lines', countText(freightLines.length)],
        ['Cargo ports & wharves', countText(ports.length)],
        ['Distribution terminals', countText(hubs.length)],
        ['Warehouses', countText(warehouses)],
        ['Warehouse fill', warehouses ? `${Math.round(warehouseLoad / (warehouseCount * WAREHOUSE_CAP) * 100)}%` : '-'],
        ['Ships at sea', countText(ships.length)],
        ['Docks', countText(docks.length)],
        ['Airports', countText(airports.length)],
        ['Planes in the air', countText(planes.length)],
        ['Boats on the water', countText(boats.length)],
        ['Truck deliveries', countText(cargoStats.deliveries)],
        ['Cargo moved', countText(cargoStats.moved) + ' units'],
        ['Cargo exported', countText(cargoStats.shipped) + ' units'],
        ['Train runs', countText(cargoStats.trainRuns)],
      ],
    },
    {
      title: 'Resources & food',
      rows: [
        ['Food in city', countText(mt.produce + mt.fish) + ' units'],
        ['Food made per day', countText(Math.round(foodPerDay)) + ' units'],
        ['Food sites', countText(foodSites)],
        ['Produce', countText(mt.produce)],
        ['Seafood', countText(mt.fish)],
        ['Timber', countText(mt.timber)],
        ['Stone', countText(mt.stone)],
        ['Ore', countText(mt.ore)],
        ['Coal', countText(mt.coal)],
        ['Concrete', countText(mt.concrete)],
        ['Steel', countText(mt.steel)],
        ['Oil', countText(mt.oil)],
        ['Gas', countText(mt.gas)],
        ['Resource sites', countText(producers)],
      ],
    },
    {
      title: 'Taxes & economy',
      rows: [
        ['Sales tax rate', `${worldSettings.taxSales || 0}%`],
        ['Income tax rate', `${worldSettings.taxIncome || 0}%`],
        ['Residents who pay sales tax', countText(agents.length)],
        ['Employed residents paying income tax', countText(employed)],
        ['Projected sales tax / day', countText(Math.round(agents.length * ((worldSettings.taxSales || 0) / 100) * 20)) + ' coins'],
        ['Projected income tax / day', countText(Math.round(employed * ((worldSettings.taxIncome || 0) / 100) * 40)) + ' coins'],
        ['Projected tax revenue / day', countText(Math.round(taxesDaily)) + ' coins'],
        ['Treasury', 'not collected yet'],
      ],
    },
    {
      title: 'Health & sickness',
      rows: [
        ['City health (total)', moodPct(healthTotal)],
        ['Healthy residents', countText(healthyResidents)],
        ['Residents unwell now', countText(unwell)],
        ['Share of residents unwell', moodPct(sickShare)],
        ['Households with illness', countText(sickHomes)],
        ['Work capacity', moodPct(workCapacity)],
        ['Effective workforce', `${countText(effectiveWorkers)} of ${countText(employed)} employed`],
        ['Travel activity', moodPct(travelActivity)],
        ['Average health', agents.length ? moodPct(healthSum / agents.length) : '-'],
        ['Average immunity', agents.length ? moodPct(immunitySum / agents.length) : '-'],
        ['Hourly infection risk', (infectionRisk * 100).toFixed(2) + '%'],
        ['Infections recorded', countText(SICKNESS.total)],
        ['Recovered', countText(SICKNESS.recovered)],
        ['Deaths from illness', countText(SICKNESS.deaths)],
        ['Outbreaks', countText(SICKNESS.outbreaks)],
        ['Person-days ill', countText(Math.round(SICKNESS.days))],
        ['Hospital patients', countText(SICKNESS.patients)],
        ['Hospital beds', countText(hospitalBeds())],
        ['Hospital coverage', moodPct(healthCoverage())],
        ['Hospitals', countText(hospitals)],
      ],
    },
    {
      title: 'Power',
      rows: [
        ['Capacity', countText(power.capacity) + ' MW'],
        ['Demand', countText(power.demand) + ' MW'],
        ['Reserve', (power.capacity - power.demand >= 0 ? '+' : '') + countText(power.capacity - power.demand) + ' MW'],
        ['Plants', countText(power.plants.length)],
        ['Wood plants', countText(plants.woodPlant || 0)],
        ['Coal plants', countText(plants.coalPlant || 0)],
        ['Gas plants', countText(plants.gasPlant || 0)],
        ['Hydro dams', countText(plants.hydroPlant || 0)],
        ['Solar farms', countText(plants.solarPlant || 0)],
        ['Nuclear plants', countText(plants.nuclearPlant || 0)],
      ],
    },
    {
      title: 'Public services & incidents',
      rows: [
        ['Active incidents', countText(activeIncidents.length)],
        ['Active fires', countText(activeFires)],
        ['Active crashes', countText(activeCrashes)],
        ['Units out', countText(unitsOut)],
        ['Hospitals', countText(hospitals)],
        ['Fire stations', countText(fireStations)],
        ['Police stations', countText(policeStations)],
        ['Plane crashes', countText(stats.planeCrashes || 0)],
        ['People lost in plane crashes', countText(stats.planeDeaths || 0)],
        ['Road crashes', countText(stats.crashes || 0)],
        ['Crashes cleared', countText(stats.crashesCleared || 0)],
        ['Fires put out', countText(stats.firesOut || 0)],
        ['Buildings burned down', countText(stats.burned || 0)],
        ['People evacuated', countText(stats.evacuated || 0)],
      ],
    },
    {
      title: 'Land & environment',
      rows: [
        ['Land tiles', countText(N - wet)],
        ['Water tiles', countText(wet)],
        ['Trees', countText(trees)],
        ['Districts', countText(districts.size)],
        ['World tiles', countText(N)],
        ['Region size', `${MW} × ${MH} tiles`],
        ['Tile scale', `${TILE_METRES} m per tile`],
      ],
    },
  ];

  // Every building type that exists, biggest first. A new type in the catalogue
  // shows up here automatically.
  const typeRows = Object.entries(byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, n]) => [BT[type].name, countText(n)]);
  if (typeRows.length) groups.push({ title: 'Buildings by type', rows: typeRows });
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => [CATLABEL[cat] || cat, countText(n)]);
  if (catRows.length) groups.splice(1, 0, { title: 'Buildings by use', rows: catRows });

  return { summary, groups, food: mt.produce + mt.fish, taxesDaily, avgTrip, worstHeat, worstTile };
}
// Crossing legs are counted from the road mask rather than tile degree, so an
// overpass or a bridge still reads as the junction it is.
function countIntersections() {
  let n = 0;
  for (let i = 0; i < N; i++) if ((tile[i] === 1 || tile[i] === 2) && bits(cmask[i]) >= 3) n++;
  return n;
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------
const statsDlg = document.getElementById('statsDlg');
const statsScreen = document.getElementById('statsScreen');
const statsSummaryEl = document.getElementById('statsSummary');
const statsFullEl = document.getElementById('statsFull');
let lastStatsPaint = 0;

function statCell(label, value) {
  const cell = document.createElement('div');
  cell.className = 'stat-cell';
  const l = document.createElement('span'); l.className = 'stat-label'; l.textContent = label;
  const v = document.createElement('b'); v.textContent = value;
  cell.append(l, v);
  return cell;
}
function statBlock(title, rows) {
  const box = document.createElement('section');
  box.className = 'stat-block';
  const h = document.createElement('h2'); h.textContent = title; box.append(h);
  for (const [label, value] of rows) {
    const row = document.createElement('div'); row.className = 'row';
    const l = document.createElement('span'); l.textContent = label;
    const v = document.createElement('span'); v.textContent = value;
    row.append(l, v); box.append(row);
  }
  return box;
}
function renderStatsSummary(s) {
  statsSummaryEl.replaceChildren(...s.summary.map(([label, value]) => statCell(label, value)));
}
function renderStatsFull(s) {
  const keep = statsScreen.scrollTop;
  statsFullEl.replaceChildren(...s.groups.map(g => statBlock(g.title, g.rows)));
  statsScreen.scrollTop = keep;
  const footWorld = document.getElementById('statsFooterWorld');
  const footClock = document.getElementById('statsFooterClock');
  if (footWorld) footWorld.textContent = `${statWorldName()} · seed ${worldSeed} · ${worldSettings.difficulty}`;
  if (footClock) footClock.textContent = `Day ${statDay()} · ${statClock()} · ${weatherNow().name}`;
}
function refreshStats(force) {
  const openDlg = statsDlg && !statsDlg.classList.contains('hidden');
  const openScreen = statsScreen && !statsScreen.classList.contains('hidden');
  if (!openDlg && !openScreen) return;
  const now = performance.now();
  if (!force && now - lastStatsPaint < 1000) return;
  lastStatsPaint = now;
  const s = collectCityStats();
  if (openDlg) renderStatsSummary(s);
  if (openScreen) renderStatsFull(s);
}
// Called from hud() so both panels track the simulation without their own timers.
function updateStatsPanels() { refreshStats(false); }

function openStatsDialog() {
  if (typeof menuEl !== 'undefined') menuEl.classList.add('hidden');
  statsScreen.classList.add('hidden');
  document.body.classList.remove('menu-screen');
  statsDlg.classList.remove('hidden');
  refreshStats(true);
}
function closeStatsDialog() { statsDlg.classList.add('hidden'); }
function openStatsScreen() {
  statsDlg.classList.add('hidden');
  statsScreen.classList.remove('hidden');
  document.body.classList.add('menu-screen');
  statsScreen.scrollTop = 0;
  refreshStats(true);
}
function closeStatsScreen() {
  statsScreen.classList.add('hidden');
  document.body.classList.remove('menu-screen');
  refreshStats(true);
}

document.getElementById('statsBtn').onclick = openStatsDialog;
document.getElementById('statsClose').onclick = closeStatsDialog;
document.getElementById('statsOpenFull').onclick = openStatsScreen;
document.getElementById('statsScreenBack').onclick = closeStatsScreen;
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!statsScreen.classList.contains('hidden')) { e.stopPropagation(); closeStatsScreen(); }
  else if (!statsDlg.classList.contains('hidden')) { e.stopPropagation(); closeStatsDialog(); }
}, true);
