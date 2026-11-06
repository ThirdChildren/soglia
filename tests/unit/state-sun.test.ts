import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { createSavePlanner, pickRestorable, serializeForSave } from '../../src/logic/persistence';
import { sunLogLine } from '../../src/logic/sun-time';
import {
  DEFAULT_SUN_TIME,
  createInitialState,
  createStore,
  deserialize,
  placeFurniture,
  reduce,
  restoreSaved,
  serialize,
  setMiniature,
  setSunTime,
  stepSunTime,
  type Action,
  type AppState,
} from '../../src/logic/state';

const initial = (time: string | null = null): AppState =>
  createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a', time });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);
const ctx = (extra: Record<string, unknown> = {}) => ({
  houseId: 'apartment-a',
  catalogIds: new Set(['bed-double']),
  roomIds: new Set(['living', 'bedroom']),
  ...extra,
});

describe('sunTime in the initial state', () => {
  it('is the placeholder default without a time parameter', () => {
    expect(initial().sunTime).toBe(DEFAULT_SUN_TIME);
  });
  it('takes the time parameter and drops its seconds', () => {
    expect(initial('2026-06-21T14:00').sunTime).toBe('2026-06-21T14:00');
    expect(initial('2026-06-21T14:00:45').sunTime).toBe('2026-06-21T14:00');
  });
  it('ignores a malformed time parameter', () => {
    expect(initial('soon').sunTime).toBe(DEFAULT_SUN_TIME);
  });
});

describe('setSunTime', () => {
  it('sets a real time', () => {
    expect(run(initial(), setSunTime('2026-06-21T15:00')).sunTime).toBe('2026-06-21T15:00');
  });
  it('ignores malformed times and non-strings', () => {
    const s = initial();
    for (const bad of ['', 'x', '2026-02-30T10:00', '2026-06-21T10:00:00', '2026-06-21']) {
      expect(reduce(s, setSunTime(bad))).toBe(s);
    }
    expect(reduce(s, { type: 'setSunTime', sunTime: 5 as unknown as string })).toBe(s);
  });
  it('the same time again returns the same state object', () => {
    const s = initial();
    expect(reduce(s, setSunTime(s.sunTime))).toBe(s);
  });
  it('changes nothing else', () => {
    const s = run(initial(), placeFurniture('bed-double', 6.8, 1.1, 0, 'bedroom'), setMiniature(0.08, 30));
    const t = reduce(s, setSunTime('2026-03-01T09:00'));
    expect(t).toEqual({ ...s, sunTime: '2026-03-01T09:00' });
    expect(t.furniture).toBe(s.furniture);
    expect(t.history).toBe(s.history);
  });
  it('does not write undo history', () => {
    const s = run(initial(), placeFurniture('bed-double', 6.8, 1.1, 0, 'bedroom'));
    expect(reduce(s, setSunTime('2026-03-01T09:00')).history).toBe(s.history);
  });
});

describe('stepSunTime', () => {
  it('steps hours and wraps on the same day', () => {
    expect(run(initial('2026-12-21T23:00'), stepSunTime('hour', 1)).sunTime).toBe('2026-12-21T00:00');
    expect(run(initial('2026-12-21T10:00'), stepSunTime('hour', -1)).sunTime).toBe('2026-12-21T09:00');
  });
  it('steps months and wraps December to January in the same year', () => {
    expect(run(initial('2026-12-21T10:00'), stepSunTime('month', 1)).sunTime).toBe('2026-01-21T10:00');
    expect(run(initial('2026-01-31T10:00'), stepSunTime('month', 1)).sunTime).toBe('2026-02-28T10:00');
  });
  it('ignores an unknown unit, zero, a fraction and NaN', () => {
    const s = initial();
    expect(reduce(s, { type: 'stepSunTime', unit: 'day' as 'hour', delta: 1 })).toBe(s);
    expect(reduce(s, stepSunTime('hour', 0))).toBe(s);
    expect(reduce(s, stepSunTime('hour', 0.5))).toBe(s);
    expect(reduce(s, stepSunTime('hour', Number.NaN))).toBe(s);
  });
  it('12 month steps (day 15) and 24 hour steps come back', () => {
    let s = initial('2026-03-15T09:00');
    for (let i = 0; i < 12; i++) s = reduce(s, stepSunTime('month', 1));
    for (let i = 0; i < 24; i++) s = reduce(s, stepSunTime('hour', 1));
    expect(s.sunTime).toBe('2026-03-15T09:00');
  });
});

describe('sunTime in serialize / deserialize', () => {
  it('round-trips', () => {
    const s = run(initial(), setSunTime('2026-06-21T15:00'));
    expect(deserialize(serialize(s))?.sunTime).toBe('2026-06-21T15:00');
  });
  it('is written last, after issuesSeeded', () => {
    expect(Object.keys(JSON.parse(serialize(initial()))).slice(-2)).toEqual(['issuesSeeded', 'sunTime']);
  });
  it('reads a state saved before M5 (no sunTime) with the default', () => {
    const old = JSON.parse(serialize(initial())) as Record<string, unknown>;
    delete old.sunTime;
    expect(deserialize(JSON.stringify(old))?.sunTime).toBe(DEFAULT_SUN_TIME);
  });
  it('takes the default for a broken sunTime without rejecting the state', () => {
    for (const bad of ['yesterday', 12, null, '2026-02-30T10:00', {}]) {
      const o = JSON.parse(serialize(initial())) as Record<string, unknown>;
      o.sunTime = bad;
      expect(deserialize(JSON.stringify(o))?.sunTime).toBe(DEFAULT_SUN_TIME);
    }
  });
});

describe('sunTime in the restore', () => {
  const saved = (time: string): string => serialize(run(initial(), setSunTime(time)));

  it('pickRestorable gives the saved sun time', () => {
    expect(pickRestorable(saved('2026-06-21T15:00'), ctx())?.sunTime).toBe('2026-06-21T15:00');
  });
  it('pickRestorable gives null when time= is explicit', () => {
    expect(pickRestorable(saved('2026-06-21T15:00'), ctx({ timeExplicit: true }))?.sunTime).toBeNull();
  });
  it('pickRestorable gives null for a state without sunTime', () => {
    const o = JSON.parse(saved('2026-06-21T15:00')) as Record<string, unknown>;
    delete o.sunTime;
    expect(pickRestorable(JSON.stringify(o), ctx())?.sunTime).toBeNull();
  });
  it('pickRestorable keeps the sun time with ignoreFurniture', () => {
    expect(pickRestorable(saved('2026-06-21T15:00'), ctx({ ignoreFurniture: true }))?.sunTime).toBe('2026-06-21T15:00');
  });
  it('restoreSaved puts the saved sun time in the store', () => {
    const picked = pickRestorable(saved('2026-06-21T15:00'), ctx())!;
    expect(reduce(initial(), restoreSaved(picked)).sunTime).toBe('2026-06-21T15:00');
  });
  it('restoreSaved with null keeps the time of the session (the URL named one)', () => {
    const picked = pickRestorable(saved('2026-06-21T15:00'), ctx({ timeExplicit: true }))!;
    expect(reduce(initial('2026-03-01T08:00'), restoreSaved(picked)).sunTime).toBe('2026-03-01T08:00');
  });
  it('restoreSaved ignores a malformed sun time', () => {
    const picked = { ...pickRestorable(saved('2026-06-21T15:00'), ctx())!, sunTime: 'nope' };
    expect(reduce(initial(), restoreSaved(picked)).sunTime).toBe(DEFAULT_SUN_TIME);
  });
  it('a restore from a state of another sun time then a save writes that sun time', () => {
    const s = reduce(initial(), setSunTime('2026-06-21T15:00'));
    expect(JSON.parse(serializeForSave(s)).sunTime).toBe('2026-06-21T15:00');
  });
});

describe('saving the sun time', () => {
  it('a change of the sun time is a different text, so it is written', () => {
    const planner = createSavePlanner(() => 0);
    const s = initial();
    planner.baseline(serializeForSave(s));
    planner.update(serializeForSave(reduce(s, setSunTime('2026-06-21T15:00'))));
    expect(planner.flush()).not.toBeNull();
  });
  it('the store notifies listeners once per change and not for the same time', () => {
    const store = createStore(initial());
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.dispatch(setSunTime('2026-06-21T15:00'));
    store.dispatch(setSunTime('2026-06-21T15:00'));
    store.dispatch(stepSunTime('hour', 1));
    expect(calls).toBe(2);
  });
});

describe('sunLogLine', () => {
  it('prints time, source, utc, azimuth and altitude with one decimal', () => {
    const line = sunLogLine('2026-12-21T10:00', 'url', 45.07, 7.69);
    expect(line).toMatch(/^sun set time=2026-12-21T10:00 source=url utc=2026-12-21T09:00Z az=145\.\d el=13\.\d$/);
  });
  it('says below horizon at night', () => {
    expect(sunLogLine('2026-12-21T22:00', 'saved', 45.07, 7.69)).toBe(
      'sun below horizon time=2026-12-21T22:00 source=saved utc=2026-12-21T21:00Z',
    );
  });
  it('uses summer time for the utc of a summer time', () => {
    expect(sunLogLine('2026-06-21T14:00', 'ui', 45.07, 7.69)).toContain('utc=2026-06-21T12:00Z');
  });
});
