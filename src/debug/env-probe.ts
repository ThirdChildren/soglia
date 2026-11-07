// Debug-only (`?debug=1`): the `[soglia:env]` lines of the browser-features probe (task T6.A5, D70 in docs/plans/M6.md).
//
//   At the first frame after the world is ready: one line with the user agent, whether the emulator (IWER) is active, the
//   interfaces the browser has (hand, anchors, hit test, planes, meshes, speech, recorder, camera, virtual keyboard), the
//   secure context, localStorage, `isSessionSupported` for VR and AR, and the cold-start times.
//   When a session starts: one `session` line (granted features, reference space, frame rate and the rates it offers,
//   cameras, input kinds). The session line waits for the cameras and the input sources, at most 2 s, and is written
//   once per session (a new session writes a new one).
//   `[soglia] env iwer clues ...` is the evidence for `iwer=`: the user agent alone proves nothing, IWER sets a Quest's.
//
// Nothing here requests a session, a permission or an optional feature. No allocation per frame beyond two comparisons.

import { createSystem, type World } from '@iwsdk/core';
import { slog } from '../log';
import { formatEnvLine, formatIwerClues, formatSessionLine } from '../logic/env-probe';
import { collectEnv, collectIwerClues, collectSession, type ProbeHost } from './env-collect';

/** Seconds to wait, after the session starts, for the cameras of the first XR frame and for the input sources. */
const INPUT_WAIT_SECONDS = 2;

let readyMs = 0;

/** Registers the probe. Call only when `params.debug` is true; `ready` is `performance.now()` at "world ready". */
export function attachEnvProbe(world: World, ready: number): void {
  readyMs = ready;
  world.registerSystem(EnvProbeSystem);
}

export class EnvProbeSystem extends createSystem({}) {
  private started = false;
  private inSession = false;
  private logged = false;
  private waited = 0;

  update(delta: number): void {
    if (!this.started) {
      this.started = true;
      this.logEnv(performance.now());
    }
    const presenting = this.world.renderer.xr.isPresenting;
    if (!presenting) {
      this.inSession = false;
      this.logged = false;
      return;
    }
    if (!this.inSession) {
      this.inSession = true;
      this.logged = false;
      this.waited = 0;
    }
    if (this.logged) return;
    this.waited += delta;
    const views = this.world.renderer.xr.getCamera().cameras.length;
    const session = this.world.xrSession;
    const inputs = session ? session.inputSources.length : 0;
    // Wait for the cameras of the first XR frame and for the hands, but never longer than INPUT_WAIT_SECONDS.
    const timedOut = this.waited >= INPUT_WAIT_SECONDS;
    if (!timedOut && !(views >= 1 && inputs > 0)) return;
    this.logged = true;
    try {
      console.log('[soglia:env] ' + formatSessionLine(collectSession(session, views >= 1 ? views : undefined)));
    } catch {
      slog('env session probe failed');
    }
  }

  private logEnv(startMs: number): void {
    const host = window as unknown as ProbeHost;
    collectEnv(host, { readyMs, startMs })
      .then((probe) => {
        console.log('[soglia:env] ' + formatEnvLine(probe));
        slog('env iwer clues ' + formatIwerClues(collectIwerClues(host)));
      })
      .catch(() => slog('env probe failed'));
  }
}
