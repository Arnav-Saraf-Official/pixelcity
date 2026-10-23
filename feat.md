# Feature plan: starting menu, world slots, and world setup

Add a small front door to PixelCity, let players keep multiple local worlds, make new-world setup choose the current Sandbox experience or an empty map, and substantially improve the generated city. Survival is visible as a future mode but cannot be selected yet.

## Intended experience

- On first launch, show a starting menu instead of immediately entering a generated region. Offer **New World**, **Load World**, and **How to Play**. Show **Continue** when a world slot is available.
- **New World** opens setup with:
  - **Sandbox** selected and playable. It keeps the current unrestricted building and simulation rules.
  - **Survival** visible but disabled, labeled **In development**. It must not start a world.
  - **Pregenerated** selected by default. It creates the current demo region.
  - **Empty** as an alternative. It creates terrain with no roads or buildings.
  - A numeric world seed, randomly generated when left blank. The selected seed is shown and stored with that world.
- Pregenerated cities should feel like a connected, planned region rather than a single downtown surrounded by sparse land: add varied neighborhoods, a clear road hierarchy, mixed-use blocks, parks/civic destinations, and useful connections across districts.
- **Load World** lists saved slots and lets the player open one. Slots can be named and deleted with clear confirmation. Opening another slot saves the current active slot first.
- From a running world, the menu can return to the starting menu without losing progress. Keep the existing save/share controls available for the active world.

## Implementation checklist

### 1. Menu and boot flow

- [x] Add a full-screen starting-menu panel to `pixelcity.html` and style it in `styles.css`, following the current panel, button, focus, responsive, and pixel-art conventions.
- [x] Add a world-setup panel with mode, map type, seed, and explicit **Create World** / **Back** actions.
- [x] Use existing `#help` content for the How to Play action rather than duplicating the guide.
- [x] Refactor `js/main.js` boot so it initializes the UI and cloud capability as before, but does not call `genDemo()` or start simulation until a world is opened or created.
- [x] Keep the render loop usable behind menus; do not advance simulation while no world is active. Hide or disable in-game controls while the starting menu is active.
- [x] Make returning to the start menu pause the current world and preserve the active slot. Resume reopens that world without regenerating it.
- [x] Retain a migration path for the existing single local save: expose it as a legacy/default slot instead of silently replacing or losing it.

### 2. World setup and generation

- [x] Give new-world creation one entry point in `js/world.js` that accepts the chosen mode, map type, and validated seed.
- [x] For Sandbox + Pregenerated, use the existing demo-building path; for Sandbox + Empty, use the existing empty-region path.
- [x] Set `worldSeed` from the chosen seed before generating terrain. The setup form generates and displays a seed by default, and fills a random seed if left blank.
- [x] Make terrain, city layout, building mix, and generated traffic-light offsets reproducible for a given seed. Avoid changing ordinary simulation randomness after world creation.
- [x] Improve pregenerated-city quality with connected collector/arterial roads, distinct residential/commercial/mixed-use neighborhoods, parks and civic destinations, and multiple populated districts; keep major routes connected to the existing region network.
- [x] Store the mode/map metadata with each slot, but do not enable or imply playable Survival rules. Survival stays a disabled UI choice labeled **In development**.
- [x] Validate seed input as a non-negative safe integer within the range supported by `loadData`; display an inline error and do not replace the active world on invalid input.

### 3. Multiple local world slots

- [x] Add a small slot-storage layer in `js/save.js`: a versioned localStorage index plus one serialized world per slot. Keep the existing `serialize()` / `loadData()` format and validation for world state.
- [x] Store slot metadata (stable ID, player-facing name, mode, map type, seed, and last-played timestamp) separately from the existing v5 world payload where practical.
- [x] Replace autosave, page-hide save, and quick-save writes to the single global key with writes to the active slot. Keep save-code and file export/import scoped to the active world.
- [x] Implement create, list, open, rename, and delete operations. Treat localStorage quota/blocked errors as failures and surface them through the existing toast/dialog pattern; never report a failed save as successful.
- [x] Confirm deletion and switching behavior, and ensure deleting the active slot returns safely to the starting menu without periodic autosave recreating it.
- [x] Preserve the legacy save-key fallback added during the branding change. Migrate into a slot and only remove the legacy key after a successful slot write.
- [x] Bound slot count at 12 and recover valid slots from a damaged index without making other valid worlds inaccessible.

### 4. Menu presentation and world management

- [x] Redesign the start screen with a clear primary action, current-world summary, responsive layout, and accessible focus styles.
- [x] Present world setup and saved-world management as full-screen pages with explicit back navigation instead of centered popup dialogs.
- [x] Add a save-current action to the world-management page; opening that page and switching worlds persist the active slot first.
- [x] Keep the menu screens in the game's VT323 font, arcade palette, and hard-edged pixel-panel style.
- [x] Render the actual game world generated with seed `6767` behind menus and advance its simulation without saving or changing a player's world.
- [ ] Inspect start, setup, and world-management pages in a browser at mobile, desktop, and landscape sizes.

### 5. Verification

- [x] Headless setup-flow check: invalid seeds are rejected; selected map/seed create a slot; returning to the start screen pauses and Continue resumes.
- [x] Save-layer checks: slot creation/open/save/rename/delete, legacy migration, corrupt-index recovery, and rollback after a simulated storage failure.
- [x] Seeded neighborhood check: same-seed road/block decisions repeat; changing the seed changes the generated layout. A stubbed placement fixture stays below the v5 40,000-building load cap.
- [x] Run `node --check` on every JavaScript module and `npm run build`; parse the standalone script and confirm its CSS/JS are inlined.
- [ ] First launch with no saves opens the starting menu and does not generate or simulate a hidden world.
- [ ] Create each Sandbox map type; confirm the correct world appears and its seed and metadata are saved.
- [ ] Recreate a pregenerated world with the same seed and verify terrain, buildings, and generated signal offsets match.
- [ ] Inspect the generated city at district and region zoom: neighborhoods should be distinct, sufficiently populated, connected to the road hierarchy, and varied in land use.
- [ ] Verify Survival is visibly disabled, announces **In development**, and cannot create a world by pointer or keyboard.
- [ ] Create two slots, switch between them, reload the page, and verify each restores its own map, clock, camera, and buildings.
- [ ] Verify active-slot autosave, page-hide save, quick save, save-code export/import, and save-file export/import do not overwrite another slot.
- [ ] Verify rename/delete, deleting the active slot, legacy-save migration, malformed slot data, blocked storage, and storage quota errors.
- [x] Confirm the modular runtime references all source files in dependency order and the standalone build includes the new UI.

## Existing code seams

- `js/main.js`: boot initializes the UI and local slot index, then displays the start screen; simulation and autosave run only while a world is active.
- `js/world.js`: `generateNewWorld(mapType, seed)` routes setup into the existing region generator. Pregenerated starts add deterministic neighborhood grids and connectors across multiple districts.
- `js/save.js`: `serialize()` and `loadData()` retain the v5 world payload; a separate bounded index and per-slot payload keys manage local worlds.
- `js/core.js`: `SAVE_KEY` and `LEGACY_SAVE_KEY` identify the current and pre-branding local saves. Preserve the old-key migration.
- `pixelcity.html` / `styles.css`: start, setup, and world-management screens provide the menu flow and responsive page layouts.
- `js/menuPreview.js`: starts the fixed-seed gameplay preview behind menus; it is not a saved slot and is replaced when a player opens or creates a world.

## Scope notes

- First version is local-browser slots, not cloud-account worlds. Existing share codes remain a separate way to export/open a region.
- Survival is presentation-only in this feature; no survival economy, objectives, unlocks, or simulation changes.
- Procedural-city improvements apply to newly created pregenerated worlds. Existing saved maps remain unchanged.
- Keep save payload version 5 unless implementation proves that new world-state data is required. Mode, map type, and slot name are slot metadata, not a reason to invalidate existing saves.
