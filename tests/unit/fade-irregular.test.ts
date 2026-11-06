import { describe, expect, it } from 'vitest';
import { FADE_IN_MS, FADE_OUT_MS, createFade, type FadeFrame, type FadePhase } from '../../src/logic/fade';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clockAt(start = 5000): { now: () => number; set: (t: number) => void; advance: (dt: number) => void } {
  let t = start;
  return { now: () => t, set: (v) => (t = v), advance: (dt) => (t += dt) };
}

const snap = (f: Readonly<FadeFrame>): FadeFrame => ({ ...f });

/** Runs a whole fade, advancing the clock before each update (after the first) by the next value of `steps`. */
function runWith(steps: (i: number) => number, max = 5000): { frames: FadeFrame[]; total: number } {
  const clock = clockAt();
  const fade = createFade(clock.now);
  expect(fade.start()).toBe(true);
  const frames: FadeFrame[] = [];
  for (let i = 0; i < max; i += 1) {
    if (i > 0) clock.advance(steps(i));
    const frame = snap(fade.update());
    frames.push(frame);
    if (frame.done) return { frames, total: frame.elapsedMs };
  }
  throw new Error('fade did not finish');
}

/** The invariants of a complete fade, whatever the frame times were. */
function expectWellFormed(frames: FadeFrame[], label: string): void {
  const entered: FadePhase[] = [];
  for (const f of frames) {
    expect(Number.isFinite(f.opacity), `${label}: finite opacity`).toBe(true);
    expect(f.opacity, `${label}: opacity >= 0`).toBeGreaterThanOrEqual(0);
    expect(f.opacity, `${label}: opacity <= 1`).toBeLessThanOrEqual(1);
    expect(Number.isFinite(f.elapsedMs), `${label}: finite elapsed`).toBe(true);
    if (f.entered) entered.push(f.phase);
    if (f.phase === 'swap') {
      expect(f.opacity, `${label}: swap at opacity 1`).toBe(1);
      expect(f.swapNow).toBe(true);
    } else {
      expect(f.swapNow, `${label}: swapNow only in swap`).toBe(false);
    }
    if (f.done) {
      expect(f.phase).toBe('idle');
      expect(f.opacity).toBe(0);
    }
  }
  expect(entered, `${label}: phases in order, none skipped`).toEqual(['out', 'swap', 'in', 'idle']);
  expect(frames.filter((f) => f.swapNow), `${label}: one swap`).toHaveLength(1);
  expect(frames.filter((f) => f.done), `${label}: one done`).toHaveLength(1);
  // Phase sequence frame by frame: out+ swap in+ idle.
  const seq = frames.map((f) => f.phase);
  const collapsed = seq.filter((p, i) => i === 0 || seq[i - 1] !== p);
  expect(collapsed).toEqual(['out', 'swap', 'in', 'idle']);
  expect(seq.filter((p) => p === 'swap')).toHaveLength(1);
  // The opacity goes up until the swap and down after it.
  const swapAt = seq.indexOf('swap');
  for (let i = 1; i <= swapAt; i += 1) expect(frames[i].opacity, `${label}: rising ${i}`).toBeGreaterThanOrEqual(frames[i - 1].opacity);
  for (let i = swapAt + 2; i < frames.length; i += 1) expect(frames[i].opacity, `${label}: falling ${i}`).toBeLessThanOrEqual(frames[i - 1].opacity);
}

describe('createFade: irregular frame times', () => {
  it('survives a hand-written sequence of 16, 140, 300 ms and a 2 s stall', () => {
    const sequence = [16, 140, 300, 2000, 16, 16, 140, 2000, 16];
    const { frames } = runWith((i) => sequence[(i - 1) % sequence.length]);
    expectWellFormed(frames, 'hand-written');
  });

  it('the stall frame (2 s) in the out phase still ends in the swap, never straight in the in phase', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    expect(snap(fade.update())).toMatchObject({ phase: 'out', opacity: 0, entered: true });
    clock.advance(16);
    expect(fade.update()).toMatchObject({ phase: 'out', entered: false });
    clock.advance(2000);
    expect(fade.update()).toMatchObject({ phase: 'swap', opacity: 1, entered: true, swapNow: true });
    clock.advance(2000);
    expect(fade.update()).toMatchObject({ phase: 'in', opacity: 1, entered: true });
    clock.advance(2000);
    expect(fade.update()).toMatchObject({ phase: 'idle', opacity: 0, done: true });
  });

  it('a stall inside the in phase finishes the fade at once with a single done', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    fade.update();
    clock.advance(200);
    fade.update(); // swap
    clock.advance(16);
    fade.update(); // in, opacity 1
    clock.advance(140);
    expect(fade.update()).toMatchObject({ phase: 'in', opacity: expect.closeTo(0.3, 9) as unknown as number });
    clock.advance(2000);
    const end = snap(fade.update());
    expect(end).toMatchObject({ phase: 'idle', opacity: 0, done: true, entered: true });
    expect(fade.active).toBe(false);
    clock.advance(16);
    expect(fade.update()).toMatchObject({ done: false, phase: 'idle', elapsedMs: 0 });
  });

  it('holds the invariants for 300 seeded random frame time sequences (1 ms to 2.5 s)', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const rnd = lcg(seed);
      // A mix of normal frames, long frames and rare stalls.
      const step = (): number => {
        const r = rnd();
        if (r < 0.7) return 1 + rnd() * 30;
        if (r < 0.95) return 30 + rnd() * 300;
        return 500 + rnd() * 2000;
      };
      const { frames } = runWith(step);
      expectWellFormed(frames, `seed ${seed}`);
    }
  });

  it('a zero-length frame (the clock does not move) changes nothing', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    const a = snap(fade.update());
    const b = snap(fade.update());
    expect(b).toEqual({ ...a, entered: false });
    clock.advance(100);
    const c = snap(fade.update());
    const d = snap(fade.update());
    expect(d).toEqual(c);
  });
});

describe('createFade: total duration as a function of the frame time', () => {
  // With a fixed frame step f the swap is at ceil(200 / f) * f, the fade-in starts one frame later and ends at the
  // first frame that is 200 ms after that: total = (2 * ceil(200 / f) + 1) * f. Integer steps keep it exact.
  const expectedTotal = (f: number): number => (2 * Math.ceil(FADE_OUT_MS / f) + 1) * f;

  it.each([
    ['72 fps (14 ms)', 14, 434],
    ['60 fps (17 ms)', 17, 425],
    ['30 fps (33 ms)', 33, 495],
    ['7 fps (143 ms)', 143, 715],
    ['exact divisor (20 ms)', 20, 420],
    ['one frame per 100 ms', 100, 500],
    ['one frame per 200 ms', 200, 600],
    ['1 ms', 1, 401],
  ])('%s: the fade lasts %i frames of time, %d ms', (_name, frameMs, total) => {
    expect(expectedTotal(frameMs)).toBe(total);
    const run = runWith(() => frameMs);
    expect(run.total).toBe(total);
    expectWellFormed(run.frames, `${frameMs} ms`);
  });

  it('is never shorter than 400 ms plus a frame and never longer than 400 ms plus three frames', () => {
    for (const f of [1, 5, 7, 14, 17, 33, 50, 99, 143, 199, 250, 600]) {
      const { total } = runWith(() => f);
      expect(total, `${f} ms`).toBeGreaterThanOrEqual(FADE_OUT_MS + FADE_IN_MS + f);
      expect(total, `${f} ms`).toBeLessThanOrEqual(FADE_OUT_MS + FADE_IN_MS + 3 * f);
    }
  });

  it('a steady frame time up to 133 ms (7.5 fps) keeps the fade within 700 ms; at 7 fps (143 ms) it is 715 ms', () => {
    for (const f of [14, 17, 33, 50, 100, 125, 133]) {
      expect(runWith(() => f).total, `${f} ms`).toBeLessThanOrEqual(700);
    }
    expect(runWith(() => 143).total).toBeGreaterThan(700);
  });

  it('the opacity at each frame follows the clock, not the frame count', () => {
    // Same elapsed time, different frame step: the out ramp reads 0.25 at 50 ms from the start whatever the step.
    for (const f of [10, 25, 50]) {
      const clock = clockAt();
      const fade = createFade(clock.now);
      fade.start();
      fade.update();
      let frame = snap(fade.update());
      for (let t = 0; t < 50; t += f) {
        clock.advance(f);
        frame = snap(fade.update());
      }
      expect(frame.opacity).toBeCloseTo(Math.min(1, (frame.elapsedMs / FADE_OUT_MS)), 9);
    }
  });
});

describe('createFade: a clock that jumps or goes back', () => {
  it('a clock that goes back during the out phase keeps the opacity at 0 and never leaves [0, 1]', () => {
    const clock = clockAt(10_000);
    const fade = createFade(clock.now);
    fade.start();
    fade.update();
    clock.advance(100);
    expect(fade.update().opacity).toBeCloseTo(0.5, 9);
    clock.set(2000); // 8 s before the start
    const back = fade.update();
    expect(back).toMatchObject({ phase: 'out', opacity: 0 });
    expect(Number.isFinite(back.elapsedMs)).toBe(true);
    clock.set(10_000 + 300);
    expect(fade.update()).toMatchObject({ phase: 'swap', opacity: 1 });
  });

  it('a clock that goes back in the in phase never gives an opacity above 1 or a second swap', () => {
    const clock = clockAt(10_000);
    const fade = createFade(clock.now);
    fade.start();
    fade.update();
    clock.advance(200);
    fade.update(); // swap
    clock.advance(16);
    expect(fade.update()).toMatchObject({ phase: 'in', opacity: 1 });
    clock.set(0);
    const back = snap(fade.update());
    expect(back).toMatchObject({ phase: 'in', opacity: 1, swapNow: false, done: false });
    clock.set(10_000 + 216 + 200);
    expect(fade.update()).toMatchObject({ phase: 'idle', done: true });
  });

  it('a clock that jumps forward by a year behaves like a long stall: every phase once', () => {
    const { frames } = runWith((i) => (i % 2 === 0 ? 3.15e10 : 16));
    expectWellFormed(frames, 'year jump');
  });

  it('cancel() is the way out when the clock stays back: the fade stops at once', () => {
    const clock = clockAt(10_000);
    const fade = createFade(clock.now);
    fade.start();
    fade.update();
    clock.set(0);
    fade.update();
    fade.cancel();
    expect(fade.active).toBe(false);
    expect(fade.update()).toMatchObject({ phase: 'idle', opacity: 0, done: false });
  });
});

describe('createFade: start and cancel', () => {
  it('a second start before the first update returns false and does not move the beginning', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    expect(fade.start()).toBe(true);
    clock.advance(100);
    expect(fade.start()).toBe(false);
    // Counted from the first start: 100 ms into the ramp, not 0.
    expect(fade.update()).toMatchObject({ phase: 'out', opacity: 0.5, entered: true });
    expect(fade.active).toBe(true);
  });

  it('starts in every phase of a running fade are refused and change nothing', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    const seen: FadePhase[] = [];
    for (let i = 0; i < 60 && fade.active; i += 1) {
      const f = fade.update();
      seen.push(f.phase);
      if (f.done) break;
      expect(fade.start(), `start during ${f.phase}`).toBe(false);
      clock.advance(25);
    }
    expect(seen.filter((p, i) => i === 0 || seen[i - 1] !== p)).toEqual(['out', 'swap', 'in', 'idle']);
  });

  it('start() right after the done frame runs a new complete fade, counted from the new start', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    for (let round = 0; round < 3; round += 1) {
      expect(fade.start(), `round ${round}`).toBe(true);
      const frames: FadeFrame[] = [];
      for (let i = 0; i < 200; i += 1) {
        const f = snap(fade.update());
        frames.push(f);
        if (f.done) break;
        clock.advance(20);
      }
      expectWellFormed(frames, `round ${round}`);
      expect(frames[frames.length - 1].elapsedMs).toBe(420);
    }
  });

  it.each([
    ['before the first update', 0],
    ['in the out phase', 1],
    ['in the swap frame', 11],
    ['in the in phase', 13],
  ])('cancel %s: idle, opacity 0, no done, no swap, and a new fade starts clean', (_name, updates) => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    // 20 ms frames: update #11 (index 10) is the swap frame (t = 200).
    let swaps = 0;
    for (let i = 0; i < updates; i += 1) {
      if (fade.update().swapNow) swaps += 1;
      clock.advance(20);
    }
    fade.cancel();
    expect(fade.active).toBe(false);
    const idle = snap(fade.update());
    expect(idle).toMatchObject({ phase: 'idle', opacity: 0, entered: false, swapNow: false, done: false, elapsedMs: 0 });
    expect(swaps).toBeLessThanOrEqual(1);
    // New fade: a full run from the new start, the first frame is the out phase at opacity 0.
    expect(fade.start()).toBe(true);
    const frames: FadeFrame[] = [];
    for (let i = 0; i < 200; i += 1) {
      const f = snap(fade.update());
      frames.push(f);
      if (f.done) break;
      clock.advance(20);
    }
    expect(frames[0]).toMatchObject({ phase: 'out', opacity: 0, entered: true, elapsedMs: 0 });
    expectWellFormed(frames, `after cancel ${updates}`);
  });

  it('cancel() when idle changes nothing and cancel() twice is fine', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    expect(() => {
      fade.cancel();
      fade.cancel();
    }).not.toThrow();
    expect(fade.active).toBe(false);
    expect(fade.start()).toBe(true);
  });

  it('after a cancel in the swap frame the swap is not reported again', () => {
    const clock = clockAt();
    const fade = createFade(clock.now);
    fade.start();
    fade.update();
    clock.advance(200);
    expect(fade.update().swapNow).toBe(true);
    fade.cancel();
    clock.advance(16);
    expect(fade.update().swapNow).toBe(false);
    clock.advance(16);
    expect(fade.update().swapNow).toBe(false);
  });

  it('the constants are the ones the table of durations above assumes', () => {
    expect(FADE_OUT_MS).toBe(200);
    expect(FADE_IN_MS).toBe(200);
  });
});

describe('createFade: odd lengths', () => {
  it('a NaN or negative length ends the ramp at once but still goes through every phase', () => {
    for (const [outMs, inMs] of [[Number.NaN, Number.NaN], [-5, -5], [0, 300], [300, 0]] as const) {
      const clock = clockAt();
      const fade = createFade(clock.now, outMs, inMs);
      fade.start();
      const frames: FadeFrame[] = [];
      for (let i = 0; i < 100; i += 1) {
        const f = snap(fade.update());
        frames.push(f);
        if (f.done) break;
        clock.advance(25);
      }
      expectWellFormed(frames, `lengths ${outMs}/${inMs}`);
    }
  });
});
