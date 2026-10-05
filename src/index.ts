import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { loadDevParams } from './data/dev-params';
import { loadHouse } from './data/load-house';
import { slog, swarn } from './log';
import { countOpenings } from './logic/house';
import { formatParamsLine, mergeParams, parseParams } from './logic/params';
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

  const world = await World.create(
    document.getElementById('scene-container') as HTMLDivElement,
    projectOptions,
  );
  world.registerSystem(ErrorPanelSystem);
  slog('world ready');

  const result = await loadHouse(params.house);
  if (result.ok) {
    const { house } = result;
    const { doors, windows } = countOpenings(house);
    slog(
      `house loaded ${house.id} rooms=${house.rooms.length} walls=${house.walls.length} doors=${doors} windows=${windows}`,
    );
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
