import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { loadDevParams } from './data/dev-params';
import { attachHandsLog } from './debug/hands-log';
import { attachLifecycleKeys } from './debug/lifecycle-keys';
import { attachMenuKey } from './debug/menu-key';
import { attachStateLog } from './debug/state-log';
import { showGlyphTest } from './debug/glyph-test';
import { attachStats } from './debug/stats';
import { loadCatalog } from './data/load-catalog';
import { loadMyFurniture } from './data/load-my-furniture';
import { loadHouse } from './data/load-house';
import { createSafeStorage } from './data/storage';
import { slog, swarn } from './log';
import { formatParamsLine, hasInvalidHouse, mergeParams, parseParams } from './logic/params';
import { mergeCatalog, menuSections } from './logic/catalog';
import { planRadius } from './logic/house-layout';
import { createInitialState, createStore, setMiniature, setMiniatureOffset } from './logic/state';
import { applyFurnish, createFurniture } from './systems/furniture';
import { buildHouse } from './systems/house-builder';
import { installLocalControllers } from './systems/local-controllers';
import { installLocalHands } from './systems/local-hands';
import { createFurnitureGrab } from './systems/furniture-grab';
import { installHandJoints } from './systems/hand-joints';
import { createFitCheck } from './systems/fit-check';
import { createFurnitureReasons } from './systems/furniture-reasons';
import { createMenuButton } from './systems/menu-button';
import { createMenuItems, setMenuTabData } from './systems/menu-items';
import { attachLifecycle } from './systems/lifecycle';
import { attachPersistence, clearSavedState, restoreSavedState, type Persistence } from './systems/persistence';
import { createMiniature, syncMiniature } from './systems/miniature';
import { createMiniatureGesture } from './systems/miniature-gesture';
import { createMiniaturePan } from './systems/miniature-pan';
import { createMenuHint } from './systems/menu-hint';
import { createOnboarding } from './systems/onboarding';
import { createPalmMenu } from './systems/palm-menu';
import { installPinchInput } from './systems/pinch-input';
import { createRoomLabel } from './systems/room-label';
import { ErrorPanelSystem, showErrorPanel } from './ui/error-panel';
import { loadPanelFonts } from './ui/fonts';
import { FurnitureVisuals } from './ui/furniture-visuals';
import { strings } from './ui/strings';

async function start(): Promise<void> {
  const devFileParams = await loadDevParams();
  const { params, source, warnings } = mergeParams(
    parseParams(window.location.search),
    devFileParams,
  );
  slog(formatParamsLine(source, params));
  for (const warning of warnings) swarn(warning);
  if (hasInvalidHouse(warnings)) swarn('invalid house id ignored');

  const store = createStore(createInitialState(params));
  if (params.debug) attachStateLog(store);
  // Saved state lives in localStorage, one key per house (D29). `reset=1` removes all of it before anything is read.
  const storage = createSafeStorage();
  if (params.reset) clearSavedState(storage);

  const world = await World.create(
    document.getElementById('scene-container') as HTMLDivElement,
    projectOptions,
  );
  installLocalHands(world);
  installLocalControllers(world);
  world.registerSystem(ErrorPanelSystem);
  await loadPanelFonts();
  slog('world ready');
  if (params.debug) attachStats(world);
  if (params.glyphs) showGlyphTest(world);

  const [result, catalogResult, myResult] = await Promise.all([
    loadHouse(params.house),
    loadCatalog(),
    loadMyFurniture(),
  ]);
  // The catalog the whole app works with: the catalog items plus the user's own pieces (T3.8, D34). A failed load of
  // the own pieces only hides their tab; an own id that the catalog already uses is left out (the catalog wins).
  const merged = catalogResult.ok ? mergeCatalog(catalogResult.items, myResult.ok ? myResult.items : []) : null;
  if (merged) for (const id of merged.duplicates) swarn(`my furniture item discarded id=${id} reason=duplicate-id`);
  if (result.ok) {
    // Put the saved furniture and preferences back before the systems start, so the first-use hints and the
    // furniture see the restored state. `furnish=` runs later and wins over the saved pieces (D29).
    let persistence: Persistence = { flush: () => undefined, stop: () => undefined };
    if (merged) {
      restoreSavedState(store, storage, result.house, merged.items, params.furnish !== 'none');
      persistence = attachPersistence(store, storage);
    }
    const miniature = createMiniature(world, (scale, yawDeg) => {
      store.dispatch(setMiniature(scale, yawDeg));
      // A new placement is a new anchor: the drag of the previous session is gone (decision D3).
      store.dispatch(setMiniatureOffset(0, 0));
    });
    const built = buildHouse(world, result.house, miniature.root);
    // The joints first: pinch input and the palm menu read their sample in the same frame.
    installHandJoints(world, params.pinch);
    installPinchInput(world);
    if (params.debug) attachHandsLog(world);
    createMiniatureGesture(world, store, planRadius(result.house));
    createRoomLabel(world, store, result.house);
    createOnboarding(world, store);
    createMenuHint(world, store);
    createPalmMenu(world, store, merged ? strings.menu.title : strings.menu.catalogUnavailable);
    // Recenter changes the scale and the offset in the store: keep the model in step with them. Only a change of
    // the `miniature` part counts (the reducer keeps its identity otherwise), so a drag in progress is not disturbed.
    let appliedMiniature = store.get().miniature;
    store.subscribe((state) => {
      if (state.miniature === appliedMiniature) return;
      appliedMiniature = state.miniature;
      syncMiniature(miniature.root, state.miniature.scale, state.miniature.offset);
    });
    // Without a catalog the house is still usable: no furniture (the menu will say so, T2.12).
    if (merged && catalogResult.ok) {
      const sections = menuSections(catalogResult.items, merged.mine);
      createMenuItems(world, store, sections.items);
      // The tabs `mine` and `fit` appear only when their data arrived; `measure` comes with the tape measure (T3.14).
      setMenuTabData({ mine: sections.mine, fit: sections.fit });
    }
    // The Menu buttons (T3.3b) come after the menu items (a control of an open menu wins a pinch) and before the grab and the drag.
    createMenuButton(world);
    if (merged) {
      const visuals = new FurnitureVisuals(merged.items);
      await visuals.preload(params.failmodels);
      createFurniture(world, store, result.house, merged.items, visuals, built.entity);
      createFurnitureReasons(world, merged.items);
      createFurnitureGrab(world, store, result.house, merged.items, visuals, built.entity, miniature.root);
      // After the grab and the reason labels: it follows the piece in the hand and keeps its label off theirs (T3.9).
      createFitCheck(world, store, result.house, merged.items, built.entity);
      if (params.furnish !== 'none') {
        applyFurnish(store, result.house, merged.items, params.furnish);
      }
    }
    // After the menu and the grab: their pinch listeners run first, so a pinch on a menu item or a piece is never a pan.
    createMiniaturePan(world, store, result.house);
    // Last: it cancels what the systems above hold when the session is hidden, blurred or ended (D30).
    const lifecycle = attachLifecycle(world, persistence);
    if (params.debug) {
      attachLifecycleKeys(lifecycle);
      attachMenuKey();
    }
    return;
  }
  if (result.reason === 'not-found') {
    swarn(`house not found: ${result.id}`);
    showErrorPanel(world, {
      message: strings.errors.houseNotFound,
      hint: strings.errors.hint,
    });
    return;
  }
  for (const error of result.errors) swarn(`house invalid: ${error}`);
  showErrorPanel(world, { message: strings.errors.houseInvalid, hint: strings.errors.hint });
}

start().catch((error: unknown) => {
  console.error(error);
});
