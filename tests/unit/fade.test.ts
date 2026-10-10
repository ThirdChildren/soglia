import { describe, expect, it } from 'vitest';
import { FADE_IN_MS, FADE_OUT_MS, createFade, type FadeFrame, type FadePhase } from '../../src/logic/fade';

/** A manual clock in milliseconds. */
function clockAt(start = 1000): { now: () => number; set: (t: number) => void; advance: (dt: number) => void } {
  let t = start;
  return { now: () => t, set: (v) => (t = v), advance: (dt) => (t += dt) };
}

/** Copy of the (reused) frame, to keep a history. */
const snap = (f: Readonly<FadeFrame>): FadeFrame => ({ ...f });

interface Run {
  frames: FadeFrame[];
  durationMs: number;
}

/**
 * Starts a fade and calls `update` every `frameMs` until `done`. `slow` maps a frame index to a longer step
 * (the frame where the walls are rebuilt, for example).
 */
function run(frameMs: number, slow: Record<number, number> = {}, outMs?: number, inMs?: number): Run {
  const clock = clockAt();
  const fade = createFade(clock.now, outMs, inMs);
  expect(fade.start()).toBe(true);
  const frames: FadeFrame[] = [];
  for (let i = 0; i < 10_000; i++) {
    const frame = snap(fade.update());
    frames.push(frame);
    if (frame.done) return { frames, durationMs: frame.elapsedMs };
    clock.advance(slow[i] ?? frameMs);
  }
  throw new Error('fade did not finish');
}

const phases = (frames: FadeFrame[]): FadePhase[] => {
  const out: FadePhase[] = [];
  for (const f of frames) if (f.entered && out[out.length - 1] !== f.phase) out.push(f.phase);
  return out;
};

describe('constants (D35)', () => {
  it('0.2 s out and 0.2 s in', () => {
    expect(FADE_OUT_MS).toBe(200);
    expect(FADE_IN_MS).toBe(200);
  });
});

describe('createFade: the curve', () => {
  it('goes 0 -> 1 in 0.2 s, swaps at opacity 1, then 1 -> 0 in 0.2 s', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    expect(fade.active).toBe(false);
    expect(fade.start()).toBe(true);
    expect(fade.active).toBe(true);

    const at = (dt: number): Readonly<FadeFrame> => {
      clock.advance(dt);
      return fade.update();
    };
    const first = snap(fade.update()); // t = 0
    expect(first).toMatchObject({ phase: 'out', opacity: 0, entered: true, swapNow: false, done: false, elapsedMs: 0 });

    expect(at(50)).toMatchObject({ phase: 'out', opacity: 0.25, entered: false });
    expect(at(50)).toMatchObject({ phase: 'out', opacity: 0.5 });
    expect(at(50)).toMatchObject({ phase: 'out', opacity: 0.75 });
    // t = 200: dark. The swap frame is at opacity 1.
    const swap = snap(at(50));
    expect(swap).toMatchObject({ phase: 'swap', opacity: 1, entered: true, swapNow: true, done: false, elapsedMs: 200 });
    // Fade-in starts counting at the next update, at opacity 1.
    const inStart = snap(at(16));
    expect(inStart).toMatchObject({ phase: 'in', opacity: 1, entered: true, swapNow: false });
    expect(at(100)).toMatchObject({ phase: 'in', opacity: 0.5, entered: false });
    expect(at(50)).toMatchObject({ phase: 'in', opacity: 0.25 });
    const end = snap(at(50));
    expect(end).toMatchObject({ phase: 'idle', opacity: 0, entered: true, swapNow: false, done: true });
    expect(end.elapsedMs).toBe(200 + 16 + 200);
    expect(fade.active).toBe(false);
  });

  it('opacity rises while going out and falls while coming in, never leaving [0, 1]', () => {
    const { frames } = run(1000 / 72);
    const swapIndex = frames.findIndex((f) => f.phase === 'swap');
    expect(swapIndex).toBeGreaterThan(0);
    for (let i = 1; i <= swapIndex; i++) expect(frames[i].opacity).toBeGreaterThanOrEqual(frames[i - 1].opacity);
    for (let i = swapIndex + 2; i < frames.length; i++) expect(frames[i].opacity).toBeLessThanOrEqual(frames[i - 1].opacity);
    for (const f of frames) {
      expect(f.opacity).toBeGreaterThanOrEqual(0);
      expect(f.opacity).toBeLessThanOrEqual(1);
      expect(Number.isNaN(f.opacity)).toBe(false);
    }
  });

  it('the scene change happens exactly once, in the swap frame, at opacity 1', () => {
    const { frames } = run(1000 / 72);
    const swaps = frames.filter((f) => f.swapNow);
    expect(swaps).toHaveLength(1);
    expect(swaps[0].opacity).toBe(1);
    expect(swaps[0].phase).toBe('swap');
    expect(frames.filter((f) => f.phase === 'swap')).toHaveLength(1);
  });

  it('reports the phases in the order out, swap, in, idle, each entered once', () => {
    const { frames } = run(1000 / 72);
    expect(phases(frames)).toEqual(['out', 'swap', 'in', 'idle']);
    expect(frames.filter((f) => f.done)).toHaveLength(1);
    expect(frames[frames.length - 1].done).toBe(true);
  });
});

describe('createFade: total duration', () => {
  it.each([
    ['72 fps', 1000 / 72],
    ['90 fps', 1000 / 90],
    ['60 fps', 1000 / 60],
    ['30 fps', 1000 / 30],
  ])('is between 250 and 700 ms at %s', (_name, frameMs) => {
    const { durationMs } = run(frameMs);
    expect(durationMs).toBeGreaterThanOrEqual(400);
    expect(durationMs).toBeGreaterThanOrEqual(250);
    expect(durationMs).toBeLessThanOrEqual(700);
  });

  it('is near 400 ms at 72 fps (a few frames over the nominal 0.2 + 0.2 s)', () => {
    const { durationMs } = run(1000 / 72);
    expect(durationMs).toBeGreaterThanOrEqual(400);
    expect(durationMs).toBeLessThan(440);
  });

  it('stays under 700 ms with one slow frame at the swap (rebuilding the walls, up to 250 ms)', () => {
    // The frame after the swap frame takes 250 ms (the walls are rebuilt in the swap frame and the next one pays).
    const baseline = run(1000 / 72).frames;
    const swapIndex = baseline.findIndex((f) => f.swapNow);
    const { durationMs, frames } = run(1000 / 72, { [swapIndex]: 250 });
    expect(durationMs).toBeGreaterThanOrEqual(400 + 250 - 15);
    expect(durationMs).toBeLessThanOrEqual(700);
    // The slow frame is hidden in the black: the first fade-in frame is still fully opaque.
    const inFrame = frames.find((f) => f.phase === 'in');
    expect(inFrame?.opacity).toBe(1);
  });

  it('a slow swap does not eat into the fade-in: the in phase lasts 0.2 s after the slow frame', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    fade.update();
    clock.advance(200);
    expect(fade.update().swapNow).toBe(true);
    clock.advance(300); // slow swap frame
    expect(fade.update()).toMatchObject({ phase: 'in', opacity: 1 });
    clock.advance(100);
    expect(fade.update().opacity).toBeCloseTo(0.5, 9);
    clock.advance(100);
    expect(fade.update().done).toBe(true);
  });

  it('a huge stall never skips a phase: out, swap, in and idle each get a frame', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    clock.advance(5000);
    const seen: FadePhase[] = [];
    for (let i = 0; i < 10 && fade.active; i++) {
      const f = fade.update();
      seen.push(f.phase);
      clock.advance(5000);
    }
    expect(seen).toEqual(['out', 'swap', 'in', 'idle']);
    expect(fade.active).toBe(false);
    expect(fade.update()).toMatchObject({ phase: 'idle', done: false, opacity: 0 });
  });
});

describe('createFade: control', () => {
  it('start() while running returns false and changes nothing', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    expect(fade.start()).toBe(true);
    fade.update();
    clock.advance(100);
    expect(fade.start()).toBe(false);
    expect(fade.update().opacity).toBeCloseTo(0.5, 9);
  });

  it('can run again after it is done', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    for (let round = 0; round < 3; round++) {
      expect(fade.start()).toBe(true);
      let guard = 0;
      while (fade.active && guard++ < 1000) {
        fade.update();
        clock.advance(20);
      }
      expect(fade.active).toBe(false);
    }
  });

  it('is idle at opacity 0 before any start and after done, with no entered/done flags', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    expect(fade.update()).toMatchObject({ phase: 'idle', opacity: 0, entered: false, swapNow: false, done: false, elapsedMs: 0 });
  });

  it('cancel() goes straight to idle at opacity 0 without a done', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    fade.update();
    clock.advance(100);
    fade.update();
    fade.cancel();
    expect(fade.active).toBe(false);
    expect(fade.update()).toMatchObject({ phase: 'idle', opacity: 0, done: false });
    expect(fade.start()).toBe(true);
    expect(fade.update()).toMatchObject({ phase: 'out', opacity: 0, entered: true });
  });

  it('uses the injected clock only (the same clock readings give the same frames)', () => {
    const a = run(1000 / 72).frames;
    const b = run(1000 / 72).frames;
    expect(a).toEqual(b);
  });

  it('the clock may start at any origin', () => {
    for (const origin of [0, 1e6, 123456.789]) {
      const clock = clockAt(origin);
      const fade = createFade(clock.now);
      fade.start();
      let duration = -1;
      for (let i = 0; i < 1000; i++) {
        const f = fade.update();
        if (f.done) {
          duration = f.elapsedMs;
          break;
        }
        clock.advance(1000 / 72);
      }
      expect(duration).toBeGreaterThanOrEqual(400);
      expect(duration).toBeLessThan(440);
    }
  });

  it('custom lengths work, and a zero length still goes through every phase', () => {
    const { frames } = run(10, {}, 100, 50);
    expect(phases(frames)).toEqual(['out', 'swap', 'in', 'idle']);
    const zero = run(10, {}, 0, 0);
    expect(phases(zero.frames)).toEqual(['out', 'swap', 'in', 'idle']);
  });

  it('reuses one frame object (no allocation per frame)', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    const a = fade.update();
    clock.advance(10);
    const b = fade.update();
    expect(a).toBe(b);
  });

  it('only gives an opacity: the frame has no pose or position', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    expect(Object.keys(fade.update()).sort()).toEqual(['done', 'elapsedMs', 'entered', 'opacity', 'phase', 'swapNow']);
  });
});
