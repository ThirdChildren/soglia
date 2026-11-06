import { describe, expect, it } from 'vitest';
import {
  createLifecycleState,
  reduceLifecycle,
  suspends,
  visibilityEvent,
  type LifecycleAction,
  type LifecycleEvent,
  type LifecycleState,
} from '../../src/logic/lifecycle';

/** Runs the events in order and returns the final state and the actions of each step. */
function run(events: readonly LifecycleEvent[], from: LifecycleState = createLifecycleState()) {
  let state = from;
  const steps: (readonly LifecycleAction[])[] = [];
  for (const event of events) {
    const result = reduceLifecycle(state, event);
    state = result.state;
    steps.push(result.actions);
  }
  return { state, steps };
}

describe('reduceLifecycle', () => {
  it('starts with nothing suspended and does nothing for the first non-immersive report', () => {
    const { state, steps } = run(['visibility:non-immersive']);
    expect(state.suspended).toBe(false);
    expect(steps).toEqual([[]]);
  });

  it('hidden saves and then suspends, in that order', () => {
    const { state, steps } = run(['session:start', 'visibility:visible', 'visibility:hidden']);
    expect(steps[2]).toEqual(['save-now', 'suspend-input']);
    expect(state).toEqual({ visibility: 'hidden', sessionActive: true, suspended: true });
  });

  it('visible-blurred suspends the same way', () => {
    const { steps } = run(['visibility:visible', 'visibility:visible-blurred']);
    expect(steps[1]).toEqual(['save-now', 'suspend-input']);
  });

  it('two hidden in a row suspend once', () => {
    const { steps } = run(['visibility:visible', 'visibility:hidden', 'visibility:hidden']);
    expect(steps[1]).toEqual(['save-now', 'suspend-input']);
    expect(steps[2]).toEqual([]);
  });

  it('blurred then hidden suspends once', () => {
    const { steps } = run(['visibility:visible', 'visibility:visible-blurred', 'visibility:hidden']);
    expect(steps[2]).toEqual([]);
  });

  it('visible after a suspension resumes, once', () => {
    const { state, steps } = run(['visibility:visible', 'visibility:hidden', 'visibility:visible', 'visibility:visible']);
    expect(steps[2]).toEqual(['resume-input']);
    expect(steps[3]).toEqual([]);
    expect(state.suspended).toBe(false);
  });

  it('visible without a suspension does nothing', () => {
    expect(run(['visibility:visible']).steps).toEqual([[]]);
  });

  it('the document hidden with a visible session only saves', () => {
    const { state, steps } = run(['visibility:visible', 'document:hidden', 'document:visible']);
    expect(steps[1]).toEqual(['save-now']);
    expect(steps[2]).toEqual([]);
    expect(state.suspended).toBe(false);
  });

  it('the document hidden after a suspension adds no second save', () => {
    const { steps } = run(['visibility:visible', 'visibility:hidden', 'document:hidden']);
    expect(steps[2]).toEqual([]);
  });

  it('pagehide only saves and never suspends', () => {
    const { state, steps } = run(['visibility:visible', 'pagehide']);
    expect(steps[1]).toEqual(['save-now']);
    expect(state.suspended).toBe(false);
  });

  it('the end of the session saves and suspends, and its non-immersive report adds nothing', () => {
    const { state, steps } = run(['session:start', 'visibility:visible', 'session:end', 'visibility:non-immersive']);
    expect(steps[2]).toEqual(['save-now', 'suspend-input']);
    expect(steps[3]).toEqual([]);
    expect(state).toEqual({ visibility: 'non-immersive', sessionActive: false, suspended: true });
  });

  it('falling to non-immersive after an immersive state is an end even without a session event', () => {
    const { steps } = run(['visibility:visible', 'visibility:non-immersive']);
    expect(steps[1]).toEqual(['save-now', 'suspend-input']);
  });

  it('a session that starts after the end resumes', () => {
    const { state, steps } = run(['visibility:visible', 'session:end', 'session:start', 'visibility:visible']);
    expect(steps[2]).toEqual(['resume-input']);
    expect(steps[3]).toEqual([]);
    expect(state.suspended).toBe(false);
  });

  it('a hidden state that ends with the session stays suspended until a visible report', () => {
    const { state, steps } = run(['visibility:visible', 'visibility:hidden', 'session:end', 'visibility:non-immersive']);
    expect(steps.slice(2)).toEqual([[], []]);
    expect(state.suspended).toBe(true);
  });

  it('never returns a NaN or a missing field, and an unknown event changes nothing', () => {
    const start = createLifecycleState();
    const result = reduceLifecycle(start, 'nonsense' as LifecycleEvent);
    expect(result.state).toBe(start);
    expect(result.actions).toEqual([]);
    for (const value of Object.values(start)) expect(typeof value === 'number' ? Number.isNaN(value) : false).toBe(false);
  });

  it('does not change the state it is given', () => {
    const start = createLifecycleState();
    const frozen = Object.freeze({ ...start });
    expect(() => reduceLifecycle(frozen, 'visibility:hidden')).not.toThrow();
    expect(start.suspended).toBe(false);
  });
});

describe('visibilityEvent and suspends', () => {
  it('maps the four IWSDK values and rejects others', () => {
    expect(visibilityEvent('hidden')).toBe('visibility:hidden');
    expect(visibilityEvent('visible-blurred')).toBe('visibility:visible-blurred');
    expect(visibilityEvent('visible')).toBe('visibility:visible');
    expect(visibilityEvent('non-immersive')).toBe('visibility:non-immersive');
    expect(visibilityEvent('frozen')).toBeNull();
    expect(visibilityEvent('')).toBeNull();
  });

  it('suspends() is true only when the actions hold suspend-input', () => {
    expect(suspends(['save-now', 'suspend-input'])).toBe(true);
    expect(suspends(['save-now'])).toBe(false);
    expect(suspends([])).toBe(false);
  });
});

// --- T3.1b, review: every (state, event) pair, long sequences, idempotence, immutability -------------------------

const ALL_EVENTS: readonly LifecycleEvent[] = [
  'visibility:hidden',
  'visibility:visible-blurred',
  'visibility:visible',
  'visibility:non-immersive',
  'document:hidden',
  'document:visible',
  'session:end',
  'session:start',
  'pagehide',
];
const ALL_VISIBILITIES: readonly LifecycleState['visibility'][] = ['non-immersive', 'visible', 'visible-blurred', 'hidden'];
const KNOWN_ACTIONS: readonly LifecycleAction[] = ['save-now', 'suspend-input', 'resume-input'];

/** The 16 combinations of the three fields, reachable or not. */
function allStates(): LifecycleState[] {
  const states: LifecycleState[] = [];
  for (const visibility of ALL_VISIBILITIES) {
    for (const sessionActive of [false, true]) {
      for (const suspended of [false, true]) states.push({ visibility, sessionActive, suspended });
    }
  }
  return states;
}

const SAVE_THEN_SUSPEND: readonly LifecycleAction[] = ['save-now', 'suspend-input'];
const fallsAway = (before: LifecycleState): readonly LifecycleAction[] => (before.suspended ? [] : SAVE_THEN_SUSPEND);
const comesBack = (before: LifecycleState): readonly LifecycleAction[] => (before.suspended ? ['resume-input'] : []);

interface Expectation {
  readonly actions: (before: LifecycleState) => readonly LifecycleAction[];
  readonly after: (before: LifecycleState) => Partial<LifecycleState>;
}

/** D30 as a table. A `Record` over the event type: a new event does not compile until it has a row here. */
const TABLE: Record<LifecycleEvent, Expectation> = {
  'visibility:hidden': {
    actions: fallsAway,
    after: () => ({ visibility: 'hidden', sessionActive: true, suspended: true }),
  },
  'visibility:visible-blurred': {
    actions: fallsAway,
    after: () => ({ visibility: 'visible-blurred', sessionActive: true, suspended: true }),
  },
  'visibility:visible': {
    actions: comesBack,
    after: () => ({ visibility: 'visible', sessionActive: true, suspended: false }),
  },
  'visibility:non-immersive': {
    // Only the fall from an immersive state is an end of the session; a first report of the page does nothing.
    actions: (before) => (before.sessionActive ? fallsAway(before) : []),
    after: (before) => ({
      visibility: 'non-immersive',
      sessionActive: false,
      suspended: before.sessionActive ? true : before.suspended,
    }),
  },
  'session:end': {
    actions: fallsAway,
    after: () => ({ visibility: 'non-immersive', sessionActive: false, suspended: true }),
  },
  'session:start': {
    actions: comesBack,
    after: () => ({ sessionActive: true, suspended: false }),
  },
  'document:hidden': {
    // Already saved when suspended; otherwise the page may be frozen, so save.
    actions: (before) => (before.suspended ? [] : ['save-now']),
    after: () => ({}),
  },
  'document:visible': {
    actions: () => [],
    after: () => ({}),
  },
  pagehide: {
    actions: () => ['save-now'],
    after: () => ({}),
  },
};

/** Small seeded generator (LCG), so the long sequences are the same on every run. */
function seededIndex(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value;
  };
}

function deepFreeze<T extends object>(value: T): T {
  for (const key of Object.keys(value)) {
    const inner = (value as Record<string, unknown>)[key];
    if (inner && typeof inner === 'object') deepFreeze(inner);
  }
  return Object.freeze(value);
}

describe('createLifecycleState', () => {
  it('starts as the page: non-immersive, no session, nothing suspended', () => {
    expect(createLifecycleState()).toEqual({ visibility: 'non-immersive', sessionActive: false, suspended: false });
  });

  it('returns a new object each time, so two owners cannot share a state', () => {
    const a = createLifecycleState();
    const b = createLifecycleState();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('reduceLifecycle, every state and event (D30 table)', () => {
  for (const event of ALL_EVENTS) {
    describe(event, () => {
      it('gives the state and the actions of the table from each of the 16 starting states', () => {
        for (const before of allStates()) {
          const result = reduceLifecycle(before, event);
          const label = `${JSON.stringify(before)} + ${event}`;
          expect(result.actions, label).toEqual(TABLE[event].actions(before));
          expect(result.state, label).toEqual({ ...before, ...TABLE[event].after(before) });
        }
      });
    });
  }

  it('has a row in the table for every event and nothing else', () => {
    expect(Object.keys(TABLE).sort()).toEqual([...ALL_EVENTS].sort());
  });

  it('never returns an unknown action, a duplicate, or a missing or non-boolean field', () => {
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        const { state, actions } = reduceLifecycle(before, event);
        const label = `${JSON.stringify(before)} + ${event}`;
        for (const action of actions) expect(KNOWN_ACTIONS, label).toContain(action);
        expect(new Set(actions).size, label).toBe(actions.length);
        expect(typeof state.sessionActive, label).toBe('boolean');
        expect(typeof state.suspended, label).toBe('boolean');
        expect(ALL_VISIBILITIES, label).toContain(state.visibility);
        expect(Object.keys(state).sort(), label).toEqual(['sessionActive', 'suspended', 'visibility']);
      }
    }
  });

  it('puts save-now before suspend-input whenever both are asked (D30: save first, then cancel)', () => {
    let both = 0;
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        const { actions } = reduceLifecycle(before, event);
        if (!actions.includes('suspend-input')) continue;
        both += 1;
        expect(actions.indexOf('save-now'), `${JSON.stringify(before)} + ${event}`).toBe(0);
        expect(actions.indexOf('suspend-input')).toBe(1);
      }
    }
    expect(both).toBeGreaterThan(0);
  });

  it('never suspends and resumes in the same list, and each one only changes the suspended flag the right way', () => {
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        const { state, actions } = reduceLifecycle(before, event);
        const label = `${JSON.stringify(before)} + ${event}`;
        expect(actions.includes('suspend-input') && actions.includes('resume-input'), label).toBe(false);
        if (actions.includes('suspend-input')) {
          expect(before.suspended, label).toBe(false);
          expect(state.suspended, label).toBe(true);
        }
        if (actions.includes('resume-input')) {
          expect(before.suspended, label).toBe(true);
          expect(state.suspended, label).toBe(false);
        }
      }
    }
  });

  it('never suspends an input that is already suspended, nor resumes one that is not', () => {
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        const { actions } = reduceLifecycle(before, event);
        if (before.suspended) expect(actions).not.toContain('suspend-input');
        else expect(actions).not.toContain('resume-input');
      }
    }
  });

  it('saves with every suspension, so nothing is ever suspended unsaved', () => {
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        const { actions } = reduceLifecycle(before, event);
        if (suspends(actions)) expect(actions).toContain('save-now');
      }
    }
  });
});

describe('reduceLifecycle, sequences', () => {
  it('hidden, blurred, visible: one suspension and one resume', () => {
    const { state, steps } = run(['visibility:visible', 'visibility:hidden', 'visibility:visible-blurred', 'visibility:visible']);
    expect(steps).toEqual([[], ['save-now', 'suspend-input'], [], ['resume-input']]);
    expect(state.suspended).toBe(false);
  });

  it('blurred, hidden, visible: one suspension and one resume', () => {
    const { steps } = run(['visibility:visible', 'visibility:visible-blurred', 'visibility:hidden', 'visibility:visible']);
    expect(steps).toEqual([[], ['save-now', 'suspend-input'], [], ['resume-input']]);
  });

  it('hidden, visible, hidden: the second fall suspends and saves again', () => {
    const { steps } = run(['visibility:visible', 'visibility:hidden', 'visibility:visible', 'visibility:hidden']);
    expect(steps[3]).toEqual(['save-now', 'suspend-input']);
  });

  it('a blurred state followed by a visible one resumes, without going through hidden', () => {
    const { steps } = run(['visibility:visible', 'visibility:visible-blurred', 'visibility:visible']);
    expect(steps[2]).toEqual(['resume-input']);
  });

  it('a visible report after only a document save, a pagehide or a document return has nothing to resume', () => {
    const { steps } = run(['visibility:visible', 'document:hidden', 'visibility:visible', 'pagehide', 'visibility:visible', 'document:visible', 'visibility:visible']);
    expect(steps.filter((actions) => actions.includes('resume-input'))).toEqual([]);
  });

  it('the document coming back while the session is hidden does not resume', () => {
    const { state, steps } = run(['visibility:visible', 'visibility:hidden', 'document:hidden', 'document:visible']);
    expect(steps.slice(2)).toEqual([[], []]);
    expect(state).toEqual({ visibility: 'hidden', sessionActive: true, suspended: true });
  });

  it('the document coming back while the session is blurred does not resume either', () => {
    const { state, steps } = run(['visibility:visible', 'visibility:visible-blurred', 'document:visible']);
    expect(steps[2]).toEqual([]);
    expect(state.suspended).toBe(true);
  });

  it('after a hidden session with the document back, only a visible session report resumes', () => {
    const { state, steps } = run(['visibility:visible', 'visibility:hidden', 'document:hidden', 'document:visible', 'visibility:visible']);
    expect(steps[4]).toEqual(['resume-input']);
    expect(state.suspended).toBe(false);
  });

  it('non-immersive after a start is a suspension, even if no visible report came before', () => {
    const { state, steps } = run(['session:start', 'visibility:non-immersive']);
    expect(steps[0]).toEqual([]);
    expect(steps[1]).toEqual(['save-now', 'suspend-input']);
    expect(state).toEqual({ visibility: 'non-immersive', sessionActive: false, suspended: true });
  });

  it('non-immersive twice in a row suspends once', () => {
    const { steps } = run(['visibility:visible', 'visibility:non-immersive', 'visibility:non-immersive']);
    expect(steps.slice(1)).toEqual([['save-now', 'suspend-input'], []]);
  });

  it('non-immersive before the end event, or the end event before it: one suspension either way', () => {
    const first = run(['visibility:visible', 'visibility:non-immersive', 'session:end']);
    const second = run(['visibility:visible', 'session:end', 'visibility:non-immersive']);
    for (const { steps } of [first, second]) {
      expect(steps.flat().filter((action) => action === 'suspend-input')).toHaveLength(1);
      expect(steps.flat().filter((action) => action === 'save-now')).toHaveLength(1);
    }
    expect(first.state).toEqual(second.state);
  });

  it('the end of a session suspends only once, however many times it is reported', () => {
    const { steps } = run(['visibility:visible', 'session:end', 'session:end', 'session:end']);
    expect(steps.slice(1)).toEqual([['save-now', 'suspend-input'], [], []]);
  });

  it('a session end without any visibility report still saves and suspends', () => {
    const { state, steps } = run(['session:end']);
    expect(steps[0]).toEqual(['save-now', 'suspend-input']);
    expect(state.suspended).toBe(true);
  });

  it('a start after an end resumes, and a second start adds nothing', () => {
    const { steps } = run(['visibility:visible', 'session:end', 'session:start', 'session:start']);
    expect(steps.slice(2)).toEqual([['resume-input'], []]);
  });

  it('a first start with nothing suspended resumes nothing but marks the session active', () => {
    const { state, steps } = run(['session:start']);
    expect(steps[0]).toEqual([]);
    expect(state.sessionActive).toBe(true);
  });

  it('end, start, visible: one resume, and a hidden afterwards suspends again', () => {
    const { steps } = run(['visibility:visible', 'session:end', 'session:start', 'visibility:visible', 'visibility:hidden']);
    expect(steps.slice(1)).toEqual([['save-now', 'suspend-input'], ['resume-input'], [], ['save-now', 'suspend-input']]);
  });

  it('a hidden session that ends and starts again resumes at the start', () => {
    const { state, steps } = run(['visibility:visible', 'visibility:hidden', 'session:end', 'session:start']);
    expect(steps.slice(2)).toEqual([[], ['resume-input']]);
    expect(state.suspended).toBe(false);
  });

  it('pagehide saves every time it is reported and never changes the state', () => {
    const { state, steps } = run(['visibility:visible', 'pagehide', 'pagehide', 'pagehide']);
    expect(steps.slice(1)).toEqual([['save-now'], ['save-now'], ['save-now']]);
    expect(state).toEqual({ visibility: 'visible', sessionActive: true, suspended: false });
  });

  it('pagehide while suspended saves again but neither resumes nor suspends a second time', () => {
    const { state, steps } = run(['visibility:visible', 'visibility:hidden', 'pagehide']);
    expect(steps[2]).toEqual(['save-now']);
    expect(state.suspended).toBe(true);
  });

  it('the document hidden saves every time while the session is visible', () => {
    const { steps } = run(['visibility:visible', 'document:hidden', 'document:hidden']);
    expect(steps.slice(1)).toEqual([['save-now'], ['save-now']]);
  });

  it('a long walk over all the events keeps suspend and resume balanced and matches the table at every step', () => {
    const next = seededIndex(30);
    let state = createLifecycleState();
    let suspensions = 0;
    let resumes = 0;
    for (let step = 0; step < 5000; step += 1) {
      const event = ALL_EVENTS[next() % ALL_EVENTS.length]!;
      const before = state;
      const result = reduceLifecycle(before, event);
      const label = `step ${step}: ${JSON.stringify(before)} + ${event}`;
      expect(result.actions, label).toEqual(TABLE[event].actions(before));
      expect(result.state, label).toEqual({ ...before, ...TABLE[event].after(before) });
      suspensions += result.actions.filter((action) => action === 'suspend-input').length;
      resumes += result.actions.filter((action) => action === 'resume-input').length;
      // A suspension is always open (1) or closed (0): never two in a row, never a resume without one.
      expect(suspensions - resumes, label).toBe(result.state.suspended ? 1 : 0);
      state = result.state;
    }
    expect(suspensions).toBeGreaterThan(100);
    expect(resumes).toBeGreaterThan(100);
  });
});

describe('reduceLifecycle, idempotence and immutability', () => {
  it('applying an event twice leaves the same state as applying it once, from every starting state', () => {
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        const once = reduceLifecycle(before, event);
        const twice = reduceLifecycle(once.state, event);
        expect(twice.state, `${JSON.stringify(before)} + ${event}`).toEqual(once.state);
      }
    }
  });

  it('the second of two equal events asks for nothing, except the plain saves of the document and pagehide', () => {
    const saving: readonly LifecycleEvent[] = ['document:hidden', 'pagehide'];
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        const once = reduceLifecycle(before, event);
        const twice = reduceLifecycle(once.state, event);
        const label = `${JSON.stringify(before)} + ${event} twice`;
        if (saving.includes(event)) expect(twice.actions.every((action) => action === 'save-now'), label).toBe(true);
        else expect(twice.actions, label).toEqual([]);
      }
    }
  });

  it('does not touch the state it is given, for any event', () => {
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        const snapshot = JSON.stringify(before);
        const frozen = deepFreeze({ ...before });
        expect(() => reduceLifecycle(frozen, event), `${snapshot} + ${event}`).not.toThrow();
        expect(JSON.stringify(frozen)).toBe(snapshot);
      }
    }
  });

  it('returns a state that is not the one it was given when the state changes', () => {
    const before = createLifecycleState();
    const result = reduceLifecycle(before, 'visibility:hidden');
    expect(result.state).not.toBe(before);
    expect(before).toEqual({ visibility: 'non-immersive', sessionActive: false, suspended: false });
  });

  it('gives action lists that a caller cannot change, so one call cannot corrupt the next', () => {
    const first = reduceLifecycle(createLifecycleState(), 'visibility:hidden');
    expect(Object.isFrozen(first.actions)).toBe(true);
    expect(() => (first.actions as LifecycleAction[]).push('resume-input')).toThrow(TypeError);
    expect(() => (first.actions as LifecycleAction[]).pop()).toThrow(TypeError);
    const second = reduceLifecycle(createLifecycleState(), 'visibility:hidden');
    expect(second.actions).toEqual(['save-now', 'suspend-input']);
  });

  it('gives frozen empty and single-save lists too', () => {
    const none = reduceLifecycle(createLifecycleState(), 'document:visible');
    const save = reduceLifecycle(createLifecycleState(), 'pagehide');
    expect(Object.isFrozen(none.actions)).toBe(true);
    expect(Object.isFrozen(save.actions)).toBe(true);
  });

  it('gives the same result for the same inputs (no hidden state, no clock)', () => {
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        expect(reduceLifecycle(before, event)).toEqual(reduceLifecycle({ ...before }, event));
      }
    }
  });

  it('treats a state with a wrong event like the unknown event: nothing asked, same state values', () => {
    for (const before of allStates()) {
      for (const bad of ['', 'hidden', 'visibility:', 'Visibility:hidden', 'visibility:frozen', 'constructor', '__proto__']) {
        const result = reduceLifecycle(before, bad as LifecycleEvent);
        expect(result.actions, `${JSON.stringify(before)} + ${JSON.stringify(bad)}`).toEqual([]);
        expect(result.state).toEqual(before);
      }
    }
  });

  it('does not throw for a null or undefined event and asks for nothing', () => {
    const before = createLifecycleState();
    for (const bad of [null, undefined, 0, NaN, {}, []]) {
      expect(() => reduceLifecycle(before, bad as unknown as LifecycleEvent)).not.toThrow();
      expect(reduceLifecycle(before, bad as unknown as LifecycleEvent).actions).toEqual([]);
    }
  });
});

describe('visibilityEvent, every input', () => {
  it('turns each visibility name into an event whose result has that visibility', () => {
    for (const name of ALL_VISIBILITIES) {
      const event = visibilityEvent(name);
      expect(event, name).not.toBeNull();
      expect(reduceLifecycle(createLifecycleState(), event!).state.visibility, name).toBe(name);
    }
  });

  it('gives a different event for each name', () => {
    const events = ALL_VISIBILITIES.map((name) => visibilityEvent(name));
    expect(new Set(events).size).toBe(ALL_VISIBILITIES.length);
  });

  it('only returns events of the visibility family', () => {
    for (const name of ALL_VISIBILITIES) expect(visibilityEvent(name)).toMatch(/^visibility:/);
  });

  it('returns null, without throwing, for unknown, empty and misspelled values', () => {
    const values = ['', ' ', 'frozen', 'Hidden', 'HIDDEN', ' hidden', 'hidden ', 'visible-blurred ', 'visible_blurred', 'blurred', 'immersive', 'prerender', 'null', 'undefined', 'constructor', '__proto__', 'toString', 'hasOwnProperty'];
    for (const value of values) {
      expect(() => visibilityEvent(value), JSON.stringify(value)).not.toThrow();
      expect(visibilityEvent(value), JSON.stringify(value)).toBeNull();
    }
  });

  it('returns null, without throwing, for values that are not strings at all', () => {
    for (const value of [null, undefined, 0, 1, NaN, true, false, {}, [], ['hidden'], () => 'hidden']) {
      expect(() => visibilityEvent(value as unknown as string)).not.toThrow();
      expect(visibilityEvent(value as unknown as string)).toBeNull();
    }
  });

  it('an unknown value leaves the whole chain without any action', () => {
    const state = reduceLifecycle(createLifecycleState(), 'visibility:visible').state;
    const event = visibilityEvent('frozen');
    expect(event).toBeNull();
    // The caller skips a null event: the state it keeps is the same one.
    expect(state).toEqual({ visibility: 'visible', sessionActive: true, suspended: false });
  });
});

describe('suspends, every input', () => {
  it('is true for every subset of the actions that holds suspend-input, in any order, and false for the others', () => {
    const lists: (readonly LifecycleAction[])[] = [
      [],
      ['save-now'],
      ['resume-input'],
      ['suspend-input'],
      ['save-now', 'suspend-input'],
      ['suspend-input', 'save-now'],
      ['save-now', 'resume-input'],
      ['suspend-input', 'resume-input'],
      ['save-now', 'suspend-input', 'resume-input'],
    ];
    for (const list of lists) expect(suspends(list), JSON.stringify(list)).toBe(list.includes('suspend-input'));
  });

  it('agrees with the reducer: true exactly for the transitions that suspend', () => {
    for (const before of allStates()) {
      for (const event of ALL_EVENTS) {
        const { state, actions } = reduceLifecycle(before, event);
        expect(suspends(actions), `${JSON.stringify(before)} + ${event}`).toBe(!before.suspended && state.suspended);
      }
    }
  });

  it('does not change the list it is given', () => {
    const list = deepFreeze<LifecycleAction[]>(['save-now', 'suspend-input']);
    expect(() => suspends(list)).not.toThrow();
    expect(list).toEqual(['save-now', 'suspend-input']);
  });
});
