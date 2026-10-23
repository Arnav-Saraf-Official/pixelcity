// =====================================================================
// Start screen, world setup, and local world selection
// =====================================================================
let gameActive = false;
let setupMode = 'sandbox', setupMapType = 'pregenerated', setupReturn = 'current';
let worldListReturn = 'start', helpFromStart = false;

const startScreenEl = document.getElementById('startScreen');
const worldSetupEl = document.getElementById('worldSetup');
const worldListEl = document.getElementById('worldListDlg');
const worldSlotsEl = document.getElementById('worldSlots');
const recentWorldsEl = document.getElementById('recentWorlds');
const continueWorldBtn = document.getElementById('continueWorld');
function updateStartScreen() {
  const recent = worldSlots.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  const current = worldSlots.find(slot => slot.id === activeWorldId) || recent[0];
  continueWorldBtn.classList.toggle('hidden', !current);
  continueWorldBtn.textContent = current ? `Continue · ${current.name}` : 'Continue';
  const continueArrow = document.createElement('span');
  continueArrow.setAttribute('aria-hidden', 'true');
  continueArrow.textContent = '→';
  continueWorldBtn.append(continueArrow);
  document.getElementById('startWorldCount').textContent = worldSlots.length;
  recentWorldsEl.textContent = '';
  if (!recent.length) {
    const empty = document.createElement('p');
    empty.className = 'recent-worlds-empty';
    empty.textContent = 'Your cities will show up here.';
    recentWorldsEl.append(empty);
  }
  for (const slot of recent) {
    const button = document.createElement('button');
    button.className = 'recent-world';
    button.type = 'button';
    button.textContent = slot.name;
    button.title = `Open ${slot.name}`;
    button.onclick = () => startWorld(slot.id);
    recentWorldsEl.append(button);
  }
}
function showStartScreen() {
  menuEl.classList.add('hidden');
  worldSetupEl.classList.add('hidden');
  worldListEl.classList.add('hidden');
  helpEl.classList.add('hidden');
  gameActive = false;
  startScreenEl.classList.remove('hidden');
  document.body.classList.add('menu-screen');
  updateStartScreen();
  menuPreview.start();
}
function returnToStartScreen() {
  if (gameActive && !saveLocal(true)) return;
  showStartScreen();
}
function startWorld(id) {
  if (gameActive && !saveLocal(true)) return false;
  if (!openWorldSlot(id)) return false;
  menuPreview.stop();
  gameActive = true;
  setSpeed(1);
  startScreenEl.classList.add('hidden');
  worldSetupEl.classList.add('hidden');
  worldListEl.classList.add('hidden');
  menuEl.classList.add('hidden');
  document.body.classList.remove('menu-screen');
  return true;
}
function continueWorld() {
  const slot = worldSlots.find(entry => entry.id === activeWorldId)
    || worldSlots.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (slot) startWorld(slot.id);
}
function randomWorldSeed() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % 1000000001;
}
function selectWorldSetupChoice() {
  document.querySelectorAll('[data-mode-choice]').forEach(button => {
    const selected = button.dataset.modeChoice === setupMode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-map-choice]').forEach(button => {
    const selected = button.dataset.mapChoice === setupMapType;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
function openWorldSetup() {
  setupReturn = worldListEl.classList.contains('hidden') ? (gameActive ? 'current' : 'start') : 'list';
  worldListEl.classList.add('hidden');
  startScreenEl.classList.add('hidden');
  document.body.classList.add('menu-screen');
  menuPreview.start();
  setupMode = 'sandbox';
  setupMapType = 'pregenerated';
  selectWorldSetupChoice();
  document.getElementById('worldName').value = '';
  document.getElementById('worldSeedInput').value = String(randomWorldSeed());
  document.getElementById('worldSetupError').textContent = '';
  worldSetupEl.classList.remove('hidden');
  document.getElementById('worldName').focus();
}
function closeWorldSetup() {
  worldSetupEl.classList.add('hidden');
  if (setupReturn === 'list') openWorldList(worldListReturn);
  else if (setupReturn === 'start' || !gameActive) showStartScreen();
  else document.body.classList.remove('menu-screen');
}
function createSelectedWorld() {
  const seedInput = document.getElementById('worldSeedInput');
  const seedText = seedInput.value.trim();
  const error = document.getElementById('worldSetupError');
  if (setupMode !== 'sandbox') {
    error.textContent = 'Survival mode is still in development.';
    return;
  }
  if (seedText && !/^\d+$/.test(seedText)) {
    error.textContent = 'Enter a whole number from 0 to 1,000,000,000.';
    seedInput.focus();
    return;
  }
  const seed = seedText ? Number(seedText) : randomWorldSeed();
  if (!seedText) seedInput.value = String(seed);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 1e9) {
    error.textContent = 'Enter a whole number from 0 to 1,000,000,000.';
    seedInput.focus();
    return;
  }
  if (worldSlots.length >= MAX_WORLD_SLOTS) {
    error.textContent = `You can keep up to ${MAX_WORLD_SLOTS} worlds. Delete one before creating another.`;
    return;
  }

  const previousWorld = serialize();
  const previousActiveId = activeWorldId;
  if (gameActive && !saveLocal(true)) {
    error.textContent = 'Your current world could not be saved. Free up browser storage before creating another.';
    return;
  }
  try {
    generateNewWorld(setupMapType, seed);
  } catch (e) {
    try { loadData(previousWorld); } catch (restoreError) { console.error('Could not restore the previous world.', restoreError); }
    activeWorldId = previousActiveId;
    error.textContent = `Couldn't generate this world: ${e.message}`;
    return;
  }
  const name = document.getElementById('worldName').value.trim() || `World ${worldSlots.length + 1}`;
  const slot = createWorldSlot(name, setupMode, setupMapType);
  if (!slot) {
    try { loadData(previousWorld); } catch (restoreError) { console.error('Could not restore the previous world.', restoreError); }
    activeWorldId = previousActiveId;
    return;
  }
  gameActive = true;
  menuPreview.stop();
  setSpeed(1);
  worldSetupEl.classList.add('hidden');
  worldListEl.classList.add('hidden');
  startScreenEl.classList.add('hidden');
  menuEl.classList.add('hidden');
  document.body.classList.remove('menu-screen');
}
function openWorldList(from = 'start') {
  worldListReturn = from;
  const saveStatus = document.getElementById('worldSaveStatus');
  saveStatus.textContent = '';
  if (gameActive) saveStatus.textContent = saveLocal(true) ? 'Saved just now.' : 'Could not save current world.';
  worldSetupEl.classList.add('hidden');
  startScreenEl.classList.add('hidden');
  document.body.classList.add('menu-screen');
  menuPreview.start();
  renderWorldList();
  worldListEl.classList.remove('hidden');
  document.getElementById('worldListBack').focus();
}
function renderWorldList() {
  worldSlotsEl.textContent = '';
  const slots = worldSlots.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  document.getElementById('worldListCount').textContent = `${slots.length} ${slots.length === 1 ? 'WORLD' : 'WORLDS'}`;
  document.getElementById('worldListEmpty').classList.toggle('hidden', !!slots.length);
  document.getElementById('worldListSave').classList.toggle('hidden', !gameActive);
  for (const slot of slots) {
    const row = document.createElement('div');
    row.className = 'world-slot';
    const info = document.createElement('div');
    info.className = 'world-slot-info';
    const name = document.createElement('b');
    name.textContent = slot.name;
    const details = document.createElement('small');
    const map = slot.mapType === 'empty' ? 'Open land' : slot.mapType === 'pregenerated' ? 'City starter' : 'Imported world';
    details.textContent = `${map}  ·  ${slot.mode === 'survival' ? 'Survival' : 'Sandbox'}  ·  Seed ${slot.seed}`;
    info.append(name, details);
    if (slot.id === activeWorldId && gameActive) {
      const status = document.createElement('span');
      status.className = 'world-slot-status';
      status.textContent = 'CURRENTLY PLAYING';
      info.append(status);
    }
    const actions = document.createElement('div');
    actions.className = 'world-slot-actions';
    const open = document.createElement('button');
    open.textContent = slot.id === activeWorldId && gameActive ? 'Resume' : 'Open world';
    open.setAttribute('aria-label', `${slot.id === activeWorldId && gameActive ? 'Resume' : 'Open'} ${slot.name}`);
    open.onclick = () => {
      if (startWorld(slot.id)) updateStartScreen();
    };
    const rename = document.createElement('button');
    rename.textContent = 'Rename';
    rename.onclick = () => {
      if (row.querySelector('.slot-rename')) return;
      const form = document.createElement('div');
      form.className = 'slot-rename';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 32;
      input.value = slot.name;
      input.setAttribute('aria-label', `Name for ${slot.name}`);
      const save = document.createElement('button');
      save.textContent = 'Save name';
      save.onclick = () => {
        if (renameWorldSlot(slot.id, input.value)) renderWorldList();
      };
      form.append(input, save);
      row.append(form);
      input.focus();
      input.select();
    };
    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.textContent = 'Delete';
    remove.onclick = () => askConfirm(`Delete the world “${slot.name}”? This cannot be undone.`, () => {
      if (gameActive && activeWorldId === slot.id && !saveLocal(true)) return;
      const wasActive = activeWorldId === slot.id;
      if (!deleteWorldSlot(slot.id)) return;
      if (wasActive) {
        gameActive = false;
        menuPreview.start();
        renderWorldList();
        updateStartScreen();
        return;
      }
      renderWorldList();
      updateStartScreen();
    });
    actions.append(open, rename, remove);
    row.append(info, actions);
    worldSlotsEl.append(row);
  }
}
function closeWorldList() {
  worldListEl.classList.add('hidden');
  if (worldListReturn === 'start' && !gameActive) showStartScreen();
  else if (gameActive) document.body.classList.remove('menu-screen');
  else showStartScreen();
}
function showHelpFromStart() {
  helpFromStart = !startScreenEl.classList.contains('hidden');
  if (helpFromStart) startScreenEl.classList.add('hidden');
  helpEl.classList.remove('hidden');
}

continueWorldBtn.onclick = continueWorld;
document.getElementById('startNewWorld').onclick = openWorldSetup;
document.getElementById('startLoadWorld').onclick = () => openWorldList('start');
document.getElementById('startHelp').onclick = showHelpFromStart;
document.getElementById('setupBack').onclick = closeWorldSetup;
document.getElementById('createWorldBtn').onclick = createSelectedWorld;
document.getElementById('randomWorldSeed').onclick = () => {
  document.getElementById('worldSeedInput').value = String(randomWorldSeed());
};
document.querySelectorAll('[data-mode-choice]').forEach(button => button.onclick = () => {
  if (button.dataset.modeChoice !== 'sandbox') return;
  setupMode = 'sandbox';
  selectWorldSetupChoice();
});
document.querySelectorAll('[data-map-choice]').forEach(button => button.onclick = () => {
  setupMapType = button.dataset.mapChoice;
  selectWorldSetupChoice();
});
document.getElementById('worldListBack').onclick = closeWorldList;
document.getElementById('worldListNew').onclick = openWorldSetup;
document.getElementById('worldListSave').onclick = () => {
  const saved = saveLocal(false);
  document.getElementById('worldSaveStatus').textContent = saved ? 'Saved just now.' : 'Could not save current world.';
  if (saved) renderWorldList();
};
document.getElementById('helpClose').onclick = () => {
  helpEl.classList.add('hidden');
  if (helpFromStart) showStartScreen();
  helpFromStart = false;
};
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !confirmEl.classList.contains('hidden')) return;
  if (helpFromStart && !helpEl.classList.contains('hidden')) {
    helpEl.classList.add('hidden');
    helpFromStart = false;
    showStartScreen();
    e.preventDefault();
    e.stopPropagation();
  } else if (!worldSetupEl.classList.contains('hidden')) {
    closeWorldSetup();
    e.preventDefault();
    e.stopPropagation();
  } else if (!worldListEl.classList.contains('hidden')) {
    closeWorldList();
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
