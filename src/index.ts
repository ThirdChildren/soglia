import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { loadDevParams } from './data/dev-params';
import { attachStateLog } from './debug/state-log';
import { attachStats } from './debug/stats';
import { loadHouse } from './data/load-house';
import { slog, swarn } from './log';
import { formatParamsLine, hasInvalidHouse, mergeParams, parseParams } from './logic/params';
import { createInitialState, createStore, setMiniature } from './logic/state';
import { buildHouse } from './systems/house-builder';
import { installLocalHands } from './systems/local-hands';
import { createMiniature } from './systems/miniature';
import { createMiniatureGesture } from './systems/miniature-gesture';
import { createOnboarding } from './systems/onboarding';
import { createRoomLabel } from './systems/room-label';
import { ErrorPanelSystem, showErrorPanel } from './ui/error-panel';
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
  world.registerSystem(ErrorPanelSystem);
  slog('world ready');
  if (params.debug) attachStats(world);

  const result = await loadHouse(params.house);
  if (result.ok) {
    const miniature = createMiniature(world, (scale, yawDeg) => {
      store.dispatch(setMiniature(scale, yawDeg));
    });
    buildHouse(world, result.house, miniature.root);
    createMiniatureGesture(world, store);
    createRoomLabel(world, store, result.house);
    createOnboarding(world, store);
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
