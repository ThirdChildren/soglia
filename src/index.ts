import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { loadDevParams } from './data/dev-params';
import { slog, swarn } from './log';
import { formatParamsLine, mergeParams, parseParams } from './logic/params';

async function start(): Promise<void> {
  const devFileParams = await loadDevParams();
  const { params, source, warnings } = mergeParams(
    parseParams(window.location.search),
    devFileParams,
  );
  slog(formatParamsLine(source, params));
  for (const warning of warnings) swarn(warning);

  await World.create(
    document.getElementById('scene-container') as HTMLDivElement,
    projectOptions,
  );
  slog('world ready');
}

start().catch((error: unknown) => {
  console.error(error);
});
