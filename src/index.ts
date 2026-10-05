import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { loadDevParams } from './data/dev-params';
import { attachStateLog } from './debug/state-log';
import { showGlyphTest } from './debug/glyph-test';
import { attachStats } from './debug/stats';
import { loadCatalog } from './data/load-catalog';
import { loadHouse } from './data/load-house';
import { slog, swarn } from './log';
import { formatParamsLine, hasInvalidHouse, mergeParams, parseParams } from './logic/params';
import { furnitureItems } from './logic/catalog';
import { createInitialState, createStore, setMiniature } from './logic/state';
import { applyFurnish, createFurniture } from './systems/furniture';
import { buildHouse } from './systems/house-builder';
import { installLocalControllers } from './systems/local-controllers';
import { installLocalHands } from './systems/local-hands';
import { createFurnitureGrab } from './systems/furniture-grab';
import { createMenuItems } from './systems/menu-items';
import { createMiniature } from './systems/miniature';
import { createMiniatureGesture } from './systems/miniature-gesture';
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

  // In-memory only for now: nothing is saved to disk yet (persistence comes later).
  const store = createStore(createInitialState(params));
  if (params.debug) attachStateLog(store);

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

  const [result, catalogResult] = await Promise.all([loadHouse(params.house), loadCatalog()]);
  if (result.ok) {
    const miniature = createMiniature(world, (scale, yawDeg) => {
      store.dispatch(setMiniature(scale, yawDeg));
    });
    const built = buildHouse(world, result.house, miniature.root);
    installPinchInput(world);
    createMiniatureGesture(world, store);
    createRoomLabel(world, store, result.house);
    createOnboarding(world, store);
    createPalmMenu(world, catalogResult.ok ? strings.menu.title : strings.menu.catalogUnavailable);
    // Recenter (and later the pan) change the scale in the store: keep the model in step with it.
    store.subscribe((state) => {
      const object = miniature.root.object3D;
      if (object && Math.abs(object.scale.x - state.miniature.scale) > 1e-6) {
        object.scale.setScalar(state.miniature.scale);
      }
    });
    // Without a catalog the house is still usable: no furniture (the menu will say so, T2.12).
    if (catalogResult.ok) {
      createMenuItems(world, store, furnitureItems(catalogResult.items));
      const visuals = new FurnitureVisuals(furnitureItems(catalogResult.items));
      await visuals.preload();
      createFurniture(world, store, result.house, catalogResult.items, visuals, built.entity);
      createFurnitureGrab(world, store, result.house, catalogResult.items, visuals, built.entity, miniature.root);
      if (params.furnish !== 'none') {
        applyFurnish(store, result.house, catalogResult.items, params.furnish);
      }
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
