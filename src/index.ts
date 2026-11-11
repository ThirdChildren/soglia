import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { loadDevParamsFile } from './data/dev-params';
import { attachHandsLog } from './debug/hands-log';
import { attachLifecycleKeys } from './debug/lifecycle-keys';
import { attachMenuKey } from './debug/menu-key';
import { attachPinDraftKey } from './debug/pin-draft-key';
import { attachStateLog } from './debug/state-log';
import { showGlyphTest } from './debug/glyph-test';
import { attachEnvProbe } from './debug/env-probe';
import { attachFovMask } from './debug/fov-mask';
import { attachDebugHud } from './debug/hud';
import { installLogTail } from './debug/log-tail';
import { attachStats } from './debug/stats';
import { installTuning } from './debug/tuning';
import { loadCatalog } from './data/load-catalog';
import { loadMyFurniture, type LoadMyFurnitureResult } from './data/load-my-furniture';
import { loadHouse } from './data/load-house';
import { loadInfoPoints } from './data/load-issues';
import { createSafeStorage } from './data/storage';
import { describeError, slog, swarn } from './log';
import { formatParamsLine, hasInvalidHouse, mergeParams, parseParams } from './logic/params';
import { mergeCatalog, menuSections } from './logic/catalog';
import { scannedToCatalogItem } from './logic/room-scan';
import { planRadius } from './logic/house-layout';
import { createInitialState, createStore, setMiniature, setMiniatureOffset, setSunTime } from './logic/state';
import { createIssueClock, observeIssues } from './logic/issue-clock';
import { defaultSunTime, sunLogLine } from './logic/sun-time';
import type { SunTimeSource } from './logic/sun-time';
import { applyFurnish, createFurniture } from './systems/furniture';
import { buildHouse } from './systems/house-builder';
import { installLocalControllers } from './systems/local-controllers';
import { installLocalHands } from './systems/local-hands';
import { createFurnitureGrab } from './systems/furniture-grab';
import { installHandJoints } from './systems/hand-joints';
import { createFitCheck } from './systems/fit-check';
import { createFurnitureReasons } from './systems/furniture-reasons';
import { createMeasure } from './systems/measure';
import { createIssueCreate } from './systems/issue-create';
import { createIssuePanel } from './systems/issue-panel';
import { createViewPanel } from './systems/view-panel';
import { createMenuButton } from './systems/menu-button';
import { createMenuItems, setMenuTabData } from './systems/menu-items';
import { attachLifecycle } from './systems/lifecycle';
import {
  attachPersistence,
  clearSavedState,
  readSavedScanned,
  restoreSavedState,
  seedDemoIssues,
  type Persistence,
} from './systems/persistence';
import { createMiniature, syncMiniature } from './systems/miniature';
import { createMiniatureGesture } from './systems/miniature-gesture';
import { createMiniaturePan } from './systems/miniature-pan';
import { createMenuHint } from './systems/menu-hint';
import { createOnboarding } from './systems/onboarding';
import { createPalmMenu } from './systems/palm-menu';
import { createFixtureAnchors } from './systems/fixtures';
import { PanelDisposalSystem } from './systems/panel-disposal';
import { installPinchInput } from './systems/pinch-input';
import { createRoomLabel } from './systems/room-label';
import { createTabletopButton } from './systems/tabletop-button';
import { createPins } from './systems/pins';
import { createSun } from './systems/sun';
import { createViewpoint } from './systems/viewpoint';
import { isRealScale } from './systems/view-mode';
import { chooseMrEntry, mixedRealityOptions, watchMrSessionRefusal } from './systems/mixed-reality';
import { RoomScanSystem } from './systems/room-scan';
import { createRoomObjects } from './systems/room-objects';
import { attachRoomPieceVisuals, createRoomPieces } from './systems/room-pieces';
import { createRoomView } from './systems/room-view';
import { createFadeOverlay } from './ui/fade-overlay';
import { ErrorPanelSystem, showErrorPanel } from './ui/error-panel';
import { loadPanelFonts } from './ui/fonts';
import { FurnitureVisuals } from './ui/furniture-visuals';
import { strings } from './ui/strings';
import { startupAccessLines } from './logic/access';
import { installAccess } from './systems/access';
import { createCoach } from './systems/coach';
import { createRotateButton } from './systems/rotate-button';

async function start(): Promise<void> {
  const devFile = await loadDevParamsFile();
  const devFileParams = devFile ? devFile.parsed : null;
  const { params, source, warnings, explicit } = mergeParams(
    parseParams(window.location.search),
    devFileParams,
  );
  // The tail of the log for the headset panel (T6.A7): first of all, so the whole start-up is in it. Only with `debug=1`.
  if (params.debug) installLogTail();
  slog(formatParamsLine(source, params));
  for (const warning of warnings) swarn(warning);
  if (hasInvalidHouse(warnings)) swarn('invalid house id ignored');

  const store = createStore(createInitialState(params));
  if (params.debug) attachStateLog(store);
  // Saved state lives in localStorage, one key per house (D29). `reset=1` removes all of it before anything is read.
  const storage = createSafeStorage();
  if (params.reset) clearSavedState(storage);

  // `mr=1`: a mixed reality world (`immersive-ar`, scene understanding on) when the browser can do it; else the VR world of
  // the project, as without the parameter (DMR1). Only a COPY of the project options changes, never the object of the SDK.
  const mrEntry = await chooseMrEntry(params.mr);
  const worldOptions = mrEntry.mode === 'ar' ? mixedRealityOptions(projectOptions, params.noscan) : projectOptions;
  const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, worldOptions);
  if (mrEntry.mode === 'ar') {
    slog(`mr world created mode=immersive-ar sceneUnderstanding=${params.noscan ? 'off' : 'on'}`);
    world.registerSystem(RoomScanSystem);
    watchMrSessionRefusal();
  }
  installLocalHands(world);
  installLocalControllers(world);
  world.registerSystem(ErrorPanelSystem);
  world.registerSystem(PanelDisposalSystem);
  // The fonts load alongside the house and the catalog (below); no panel is built before all of them are there.
  const fontsReady = loadPanelFonts();
  slog('world ready');
  // The tuning knobs of M6 (D66): `t_<name>` in the URL and in the params file, the live file `tuning.local.txt`, `foveation`.
  // Only with `debug=1`; without it the keys are ignored with a warning. Before the systems, which read the values when they decide.
  installTuning(world, { debug: params.debug, search: window.location.search, devFileText: devFile ? devFile.text : null });
  if (params.debug) {
    attachStats(world);
    // The browser-features probe (T6.A5): feature detection only, two `[soglia:env]` lines.
    attachEnvProbe(world, performance.now());
    // The statistics panel in the headset (T6.A8); `hud=0` turns it off for the final measures (D71): no entity, no cost.
    if (params.hud) attachDebugHud(world);
    else slog('hud hidden reason=hud0');
    // The narrow-view mask (T6.A10): a mesh only while `t_fovMask` is above 0 and a session runs.
    attachFovMask(world);
  }

  // `failmy=1` (with `debug=1`): the file of the own pieces is not even requested, as if it failed (D44).
  let myLoad: Promise<LoadMyFurnitureResult>;
  if (params.failmy) {
    slog('debug failmy=1: my-furniture.json is not loaded');
    myLoad = Promise.resolve({ ok: false, reason: 'failmy' });
  } else {
    myLoad = loadMyFurniture();
  }
  // `failcatalog=1` (with `debug=1`): the catalog is not even requested, as if it failed (T5.R2).
  let catalogLoad: ReturnType<typeof loadCatalog>;
  if (params.failcatalog) {
    slog('debug failcatalog=1: catalog.json is not loaded');
    catalogLoad = Promise.resolve({ ok: false, errors: ['failcatalog'] });
  } else {
    catalogLoad = loadCatalog();
  }
  const [result, catalogResult, myResult] = await Promise.all([loadHouse(params.house), catalogLoad, myLoad, fontsReady]);
  if (params.glyphs) showGlyphTest(world);
  // The catalog the whole app works with: the catalog items plus the user's own pieces (T3.8, D34). A failed load of
  // the own pieces only hides their tab; an own id that the catalog already uses is left out (the catalog wins).
  // The objects of the room added to Mine in an earlier session (plan MR) join the own pieces: a saved piece of one of them needs its entry.
  const scannedItems = readSavedScanned(storage, params.house).map(scannedToCatalogItem);
  const merged = catalogResult.ok ? mergeCatalog(catalogResult.items, [...(myResult.ok ? myResult.items : []), ...scannedItems]) : null;
  if (merged) for (const id of merged.duplicates) swarn(`my furniture item discarded id=${id} reason=duplicate-id`);
  if (result.ok) {
    // Put the saved furniture and preferences back before the systems start, so the first-use hints and the
    // furniture see the restored state. `furnish=` runs later and wins over the saved pieces (D29).
    let persistence: Persistence = { flush: () => undefined, stop: () => undefined };
    // An explicit `role=` beats the saved role (D41); without one the saved role comes back, else `visitor`.
    const roleExplicit = explicit.includes('role');
    let roleRestored = false;
    // An explicit `time=` beats the saved sun time (D54, D62); without one the saved time comes back, else now.
    const timeExplicit = explicit.includes('time');
    let sunRestored = false;
    // Likewise `contrast=` and `text=` beat the saved accessibility preferences, `0` and `normal` too (D58).
    const contrastExplicit = explicit.includes('contrast');
    const textExplicit = explicit.includes('text');
    let contrastSaved = false;
    let textSaved = false;
    // Also without a catalog (T5.R2): role, issues and preferences come back and are saved; the saved pieces stay parked.
    {
      const restored = restoreSavedState(
        store,
        storage,
        result.house,
        merged ? merged.items : null,
        params.furnish !== 'none',
        roleExplicit,
        timeExplicit,
        contrastExplicit,
        textExplicit,
      );
      roleRestored = restored.roleRestored;
      sunRestored = restored.sunRestored;
      contrastSaved = restored.contrastRestored;
      textSaved = restored.textRestored;
      persistence = attachPersistence(store, storage, restored.parked);
    }
    slog(`role set ${store.get().role} source=${roleExplicit ? 'url' : roleRestored ? 'saved' : 'default'}`);
    const { prefs } = store.get();
    for (const line of startupAccessLines({
      contrast: prefs.contrast,
      largeText: prefs.largeText,
      contrastExplicit,
      textExplicit,
      contrastSaved,
      textSaved,
    })) {
      slog(line);
    }
    // The theme before anything is built (the model, the panels), then it follows the store (D58).
    installAccess(store);
    // The sun time: `time=` (already in the store), else the saved one, else the local time of the house now (D54).
    const { lat, lon } = result.house.location;
    let sunSource: SunTimeSource = timeExplicit ? 'url' : 'saved';
    if (!timeExplicit && !sunRestored) {
      sunSource = 'default';
      store.dispatch(setSunTime(defaultSunTime(Date.now(), lat, lon)));
    }
    slog(sunLogLine(store.get().sunTime, sunSource, lat, lon));
    // The demo issues come once, after the restore and after the saving started, so the seed is saved too (D42).
    await seedDemoIssues(store);
    // The info points of the agent (T5.9): read-only content of the same file, never in the store.
    const infoPoints = await loadInfoPoints(result.house.id);
    // The clock for the history of the issues (D42): fixed by `time=`, else the real time. The systems that write
    // history take it from here; it first learns the dates that already exist, so it never goes back before them.
    const issueClock = createIssueClock(params.time, Date.now);
    observeIssues(issueClock, store.get().issues);
    const miniature = createMiniature(world, (scale, yawDeg) => {
      store.dispatch(setMiniature(scale, yawDeg));
      // A new placement is a new anchor: the drag of the previous session is gone (decision D3).
      store.dispatch(setMiniatureOffset(0, 0));
    });
    const built = buildHouse(world, result.house, miniature.root);
    // Light anchors for the fixtures of the house (no mesh): the places where an issue can snap (T4.3).
    createFixtureAnchors(world, result.house, built.entity);
    // The sun (T5.4): the dial around the model and the patches of light on the floors, before the buttons.
    createSun(world, store, result.house, built.entity);
    // The joints first: pinch input and the palm menu read their sample in the same frame.
    installHandJoints(world, params.pinch);
    installPinchInput(world);
    if (params.debug) attachHandsLog(world);
    // The Rotate button (T5.14) hangs above a piece, over the menu if the menu is open: its pinch is a `menu` claim, and its listener
    // must be the FIRST, so a control under it (the menu, the piece, a room) never gets the pinch that is meant for the button.
    if (merged) createRotateButton(world, store, merged.items);
    createMiniatureGesture(world, store, planRadius(result.house));
    createRoomLabel(world, store, result.house);
    createOnboarding(world, store);
    createMenuHint(world, store);
    createPalmMenu(world, store, merged ? strings.menu.title : strings.menu.catalogUnavailable);
    // Recenter changes the scale and the offset in the store: keep the model in step with them. Only a change of
    // the `miniature` part counts (the reducer keeps its identity otherwise), so a drag in progress is not disturbed.
    let appliedMiniature = store.get().miniature;
    // At real scale the root is placed around the head and the stored table-top pose waits (T3.12): the return puts it back.
    store.subscribe((state) => {
      if (state.miniature === appliedMiniature) return;
      appliedMiniature = state.miniature;
      if (isRealScale()) return;
      syncMiniature(miniature.root, state.miniature.scale, state.miniature.offset, state.miniature.yawDeg);
    });
    // Without a catalog the house is still usable: no furniture (the menu will say so, T2.12).
    if (merged && catalogResult.ok) {
      const sections = menuSections(catalogResult.items, merged.mine);
      createMenuItems(world, store, sections.items);
      // The tabs `mine` and `fit` appear only when their data arrived; `measure` is there with the tape measure (T3.14).
      setMenuTabData({ mine: sections.mine, fit: sections.fit, measure: true });
    }
    // The Menu buttons (T3.3b) come after the menu items (a control of an open menu wins a pinch) and before the grab and the drag.
    createMenuButton(world);
    // The way back from real scale with one hand (T4.R1): same place in the order, since a pinch on it is a `menu` claim.
    createTabletopButton(world);
    // The toggle between the model and the real room (plan MR, DMR2): only in a mixed reality world.
    if (mrEntry.mode === 'ar') createRoomView(world, miniature.root);
    // The Issues panel (T4.6a): its Close/Back controls are a `menu` claim too, so it goes after the menu and the buttons.
    createIssuePanel(world, store, result.house, issueClock, infoPoints);
    // The View panel (T5.5): its controls are a `menu` claim too, so it goes right after the Issues panel.
    createViewPanel(world, store, result.house);
    // The coach of the first minute (T5.15): not interactive; it reads the menu buttons and the release of a piece, so it goes after them.
    createCoach(world, store);
    // The real objects of the room (plan MR, DMR3, DMR4): outlines, the ray of the hands, the card and `Add to Mine`. After every control that
    // is a `menu` claim, before the tape measure and the grab: in the room view it takes every pinch the controls above did not.
    if (mrEntry.mode === 'ar') {
      createRoomObjects(world, store, {
        onAdded: (piece) => {
          // The piece joins the catalog the systems share (they look pieces up by id at use time) and the tab Mine of the menu.
          if (!merged) return;
          const item = scannedToCatalogItem(piece);
          if (merged.items.some((existing) => existing.id === item.id)) return;
          merged.items.push(item);
          merged.mine.push(item);
          setMenuTabData({ mine: [...merged.mine] });
        },
      });
      // The virtual pieces at real scale (MR.4) and the ray of the hands: right after the room objects (they use its volumes and its hover).
      createRoomPieces(world, merged ? merged.items : []);
    }
    // The tape measure claims the pinch above the grab (and below the menu): register it after the menu, before the grab (T3.14).
    createMeasure(world, store, result.house, merged ? merged.items : [], built.entity, miniature.root);
    // The long pinch (T4.5): after the tape measure (a point wins), before the grab (it waits for the claims of the later systems).
    createIssueCreate(world, store, result.house, miniature.root, issueClock);
    if (merged) {
      const visuals = new FurnitureVisuals(merged.items);
      await visuals.preload(params.failmodels);
      if (mrEntry.mode === 'ar') attachRoomPieceVisuals(visuals);
      createFurniture(world, store, result.house, merged.items, visuals, built.entity);
      createFurnitureReasons(world, merged.items);
      createFurnitureGrab(world, store, result.house, merged.items, visuals, built.entity, miniature.root);
      // After the grab and the reason labels: it follows the piece in the hand and keeps its label off theirs (T3.9).
      createFitCheck(world, store, result.house, merged.items, built.entity);
      if (params.furnish !== 'none') {
        applyFurnish(store, result.house, merged.items, params.furnish);
      }
    }
    // The fade between two views is always there (T3.12): one sphere, created only while it fades. Viewpoint markers go
    // after the menu and the grab (their pinch listeners run first) and before the drag (a marker is never a pan).
    const fadeOverlay = createFadeOverlay(world);
    createViewpoint(world, store, result.house, miniature.root, built.entity, fadeOverlay);
    // The pins of the issues (T4.4): one instanced mesh and a light entity per visible issue, after the viewpoint markers.
    createPins(world, store, result.house, built.entity, miniature.root, infoPoints);
    if (params.debug) attachPinDraftKey(result.house);
    // After the menu, the grab and the markers: their pinch listeners run first, so a pinch on a menu item, a piece or a marker is never a pan.
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
  // The last resort: one prefixed warning with the message intact, not a bare `console.error` (T5.R6).
  swarn(`start failed: ${describeError(error)}`);
});
