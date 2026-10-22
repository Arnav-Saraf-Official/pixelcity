# Feature plan: starting menu, world slots, and world setup

Add a small front door to PixelCity, let players keep multiple local worlds, and make new-world setup choose the current Sandbox experience or an empty map. Survival is visible as a future mode but cannot be selected yet.

## Intended experience

- On first launch, show a starting menu instead of immediately entering a generated region. Offer **New World**, **Load World**, and **How to Play**. Show **Continue** when a world slot is available.
- **New World** opens setup with:
  - **Sandbox** selected and playable. It keeps the current unrestricted building and simulation rules.
  - **Survival** visible but disabled, labeled **In development**. It must not start a world.
  - **Pregenerated** selected by default. It creates the current demo region.
  - **Empty** as an alternative. It creates terrain with no roads or buildings.
  - A numeric world seed, randomly generated when left blank. The selected seed is shown and stored with that world.
- **Load World** lists saved slots and lets the player open one. Slots can be named and deleted with clear confirmation. Opening another slot saves the current active slot first.
- From a running world, the menu can return to the starting menu without losing progress. Keep the existing save/share controls available for the active world.

## Implementation checklist

### 1. Menu and boot flow

- [ ] Add a full-screen starting-menu panel to `pixelcity.html` and style it in `styles.css`, following the current panel, button, focus, responsive, and pixel-art conventions.
- [ ] Add a world-setup panel with mode, map type, seed, and explicit **Create World** / **Back** actions.
- [ ] Use existing `#help` content for the How to Play action rather than duplicating the guide.
- [ ] Refactor `js/main.js` boot so it initializes the UI and cloud capability as before, but does not call `genDemo()` or start simulation until a world is opened or created.
- [ ] Keep the render loop usable behind menus; do not advance simulation while no world is active. Hide or disable in-game controls while the starting menu is active.
- [ ] Make returning to the start menu pause the current world and preserve the active slot. Resume reopens that world without regenerating it.
- [ ] Retain a migration path for the existing single local save: expose it as a legacy/default slot instead of silently replacing or losing it.

### 2. World setup and generation

- [ ] Give new-world creation one entry point in `js/world.js` that accepts the chosen mode, map type, and validated seed.
- [ ] For Sandbox + Pregenerated, use the existing demo-building path; for Sandbox + Empty, use the existing empty-region path.
- [ ] Set `worldSeed` from the chosen seed before generating terrain. Keep existing default behavior when the field is blank by generating and displaying a seed before creation.
- [ ] Make procedural generation reproducible for a given seed, including generated traffic-light offsets. Avoid changing ordinary simulation randomness after world creation.
- [ ] Store the mode/map metadata with each slot, but do not enable or imply playable Survival rules. Survival stays a disabled UI choice labeled **In development**.
- [ ] Validate seed input as a non-negative safe integer within the range supported by `loadData`; display an inline error and do not replace the active world on invalid input.

### 3. Multiple local world slots

- [ ] Add a small slot-storage layer in `js/save.js`: a versioned localStorage index plus one serialized world per slot. Keep the existing `serialize()` / `loadData()` format and validation for world state.
- [ ] Store slot metadata (stable ID, player-facing name, mode, map type, seed, and last-played timestamp) separately from the existing v5 world payload where practical.
- [ ] Replace autosave, page-hide save, and quick-save writes to the single global key with writes to the active slot. Keep save-code and file export/import scoped to the active world.
- [ ] Implement create, list, open, rename, and delete operations. Treat localStorage quota/blocked errors as failures and surface them through the existing toast/dialog pattern; never report a failed save as successful.
- [ ] Confirm deletion and switching behavior, and ensure deleting the active slot returns safely to the starting menu without periodic autosave recreating it.
- [ ] Preserve the legacy save-key fallback added during the branding change. Offer migration into a slot and only remove the legacy key after a successful slot write.
- [ ] Bound slot count and handle corrupt index/slot data without making other valid worlds inaccessible.

### 4. Verification

- [ ] First launch with no saves opens the starting menu and does not generate or simulate a hidden world.
- [ ] Create each Sandbox map type; confirm the correct world appears and its seed and metadata are saved.
- [ ] Recreate a pregenerated world with the same seed and verify terrain, buildings, and generated signal offsets match.
- [ ] Verify Survival is visibly disabled, announces **In development**, and cannot create a world by pointer or keyboard.
- [ ] Create two slots, switch between them, reload the page, and verify each restores its own map, clock, camera, and buildings.
- [ ] Verify active-slot autosave, page-hide save, quick save, save-code export/import, and save-file export/import do not overwrite another slot.
- [ ] Verify rename/delete, deleting the active slot, legacy-save migration, malformed slot data, blocked storage, and storage quota errors.
- [ ] Run `node --check` on changed JavaScript modules and `npm run build`; confirm the modular runtime and single-file bundle both include the new UI.

## Existing code seams

- `js/main.js`: boot currently builds the toolbar, loads the one local save or generates a demo, opens first-run help, and starts autosave/rendering. This is the seam for menu-first startup and active-slot autosave.
- `js/world.js`: `genRegion(demo)`, `genDemo()`, and `genEmpty()` currently reset the shared world and choose a seed internally. Route validated setup options through this layer.
- `js/save.js`: `serialize()` and `loadData()` already encode and validate the complete region, including its seed. Keep that world payload compatible; put slot selection/indexing around it.
- `js/core.js`: `SAVE_KEY` and `LEGACY_SAVE_KEY` identify the current and pre-branding local saves. Preserve the old-key migration.
- `pixelcity.html` / `styles.css`: current menu and dialog patterns provide reusable structure and visual styles; the new start/setup/slot panels should follow them.

## Scope notes

- First version is local-browser slots, not cloud-account worlds. Existing share codes remain a separate way to export/open a region.
- Survival is presentation-only in this feature; no survival economy, objectives, unlocks, or simulation changes.
- Keep save payload version 5 unless implementation proves that new world-state data is required. Mode, map type, and slot name are slot metadata, not a reason to invalidate existing saves.
