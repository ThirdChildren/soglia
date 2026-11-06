// Fade to black and back for a change of viewpoint (decision D35 in docs/plans/M3.md). Pure logic: no imports
// from @iwsdk/core or three, no timers. The clock is injected (milliseconds, any origin).
//
// Curve: opacity 0 -> 1 in FADE_OUT_MS, then ONE swap frame at opacity 1 (the caller changes the scene there,
// so the change is never seen), then 1 -> 0 in FADE_IN_MS. The fade-in starts counting at the first update AFTER
// the swap frame: a slow swap (rebuilding the walls) is hidden in the black, it is not eaten by the fade-in.
// Nominal duration 400 ms; with a slow frame of up to ~250 ms it stays under 700 ms (D35: 250-700 ms).
// The fade only gives an opacity: nothing here moves the view (rule 2, no locomotion).

/** Fade-out: opacity 0 -> 1. */
export const FADE_OUT_MS = 200;
/** Fade-in: opacity 1 -> 0. */
export const FADE_IN_MS = 200;

export type FadePhase = 'idle' | 'out' | 'swap' | 'in';

/**
 * What one `update` reports. The object is reused between calls (no allocation per frame): read it
 * right away, do not keep it.
 */
export interface FadeFrame {
  /**
   * `out` while it goes dark, `swap` for the single frame at opacity 1 where the scene changes, `in` while it
   * clears, `idle` when nothing runs (and for the frame where the fade ends).
   */
  phase: FadePhase;
  /** Opacity of the black overlay, 0 (clear) to 1 (black). */
  opacity: number;
  /** True on the first update of a phase (the caller logs `phase=<phase>` then). On the `done` frame too. */
  entered: boolean;
  /** True on the one update where the scene must change: phase `swap`, in this very frame. */
  swapNow: boolean;
  /** True on the one update where the fade ends (`phase` is `idle`, opacity 0). */
  done: boolean;
  /** Milliseconds since `start`; 0 when idle and nothing ran. On the `done` frame: the total duration. */
  elapsedMs: number;
}

export interface Fade {
  /** True from `start` until the update that reports `done` (or `cancel`). */
  readonly active: boolean;
  /** Begins a fade. Returns false (and changes nothing) when one is already running. */
  start(): boolean;
  /** Advances to the injected clock. Call every frame while `active`; when idle it reports the idle frame. */
  update(): Readonly<FadeFrame>;
  /** Stops at once, back to idle with opacity 0 (suspend, session end). No `done` is reported. */
  cancel(): void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Progress of a ramp of `durationMs` after `elapsedMs`: 0..1, and 1 at once for a zero or invalid duration. */
function progress(elapsedMs: number, durationMs: number): number {
  return durationMs > 0 ? clamp01(elapsedMs / durationMs) : 1;
}

export function createFade(clock: () => number, outMs: number = FADE_OUT_MS, inMs: number = FADE_IN_MS): Fade {
  let phase: FadePhase = 'idle';
  let startedAt = 0;
  let inStartedAt = 0;
  // The next update reports the `out` phase for the first time.
  let outPending = false;
  const frame: FadeFrame = { phase: 'idle', opacity: 0, entered: false, swapNow: false, done: false, elapsedMs: 0 };

  function report(p: FadePhase, opacity: number, entered: boolean, done: boolean, now: number): Readonly<FadeFrame> {
    frame.phase = p;
    frame.opacity = opacity;
    frame.entered = entered;
    frame.swapNow = p === 'swap';
    frame.done = done;
    frame.elapsedMs = p === 'idle' && !done ? 0 : now - startedAt;
    return frame;
  }

  return {
    get active() {
      return phase !== 'idle';
    },
    start() {
      if (phase !== 'idle') return false;
      phase = 'out';
      outPending = true;
      startedAt = clock();
      return true;
    },
    update() {
      const now = clock();
      if (phase === 'idle') return report('idle', 0, false, false, now);

      if (phase === 'out') {
        const entered = outPending;
        outPending = false;
        const p = progress(now - startedAt, outMs);
        // The first update always reports `out` (even after a long stall), so the phase is never skipped.
        if (p < 1 || entered) return report('out', p, entered, false, now);
        // Dark: the scene changes in this very frame, which is rendered black.
        phase = 'swap';
        return report('swap', 1, true, false, now);
      }

      if (phase === 'swap') {
        // First update after the swap frame: the fade-in starts counting here.
        phase = 'in';
        inStartedAt = now;
        return report('in', 1, true, false, now);
      }

      // phase === 'in'
      const p = progress(now - inStartedAt, inMs);
      if (p < 1) return report('in', 1 - p, false, false, now);
      phase = 'idle';
      return report('idle', 0, true, true, now);
    },
    cancel() {
      phase = 'idle';
      outPending = false;
    },
  };
}
