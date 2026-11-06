import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { createSavePlanner, pickRestorable, serializeForSave } from '../../src/logic/persistence';
import {
  DEFAULT_TOOL,
  TOOLS,
  createInitialState,
  createStore,
  deserialize,
  isToolId,
  placeFurniture,
  reduce,
  restoreSaved,
  serialize,
  setMiniature,
  setTool,
  type Action,
  type AppState,
  type ToolId,
} from '../../src/logic/state';

const initial = (): AppState => createInitialState({ ...DEFAULT_PARAMS, house: 'apartment-a' });
const run = (state: AppState, ...actions: Action[]): AppState => actions.reduce(reduce, state);

describe('the tool in the hands (D36)', () => {
  it('starts as furnish', () => {
    expect(DEFAULT_TOOL).toBe('furnish');
    expect(initial().tool).toBe('furnish');
  });

  it('knows exactly furnish and measure', () => {
    expect([...TOOLS]).toEqual(['furnish', 'measure']);
    expect(isToolId('measure')).toBe(true);
    expect(isToolId('furnish')).toBe(true);
    for (const bad of ['', 'Measure', 'ruler', null, undefined, 1, {}]) expect(isToolId(bad)).toBe(false);
  });

  it('setTool switches the tool and back', () => {
    const on = reduce(initial(), setTool('measure'));
    expect(on.tool).toBe('measure');
    expect(reduce(on, setTool('furnish')).tool).toBe('furnish');
  });

  it('the same tool again returns the same state object (no listener runs)', () => {
    const s = initial();
    expect(reduce(s, setTool('furnish'))).toBe(s);
    const on = reduce(s, setTool('measure'));
    expect(reduce(on, setTool('measure'))).toBe(on);
  });

  it('an unknown tool is ignored', () => {
    const s = initial();
    expect(reduce(s, setTool('ruler' as unknown as ToolId))).toBe(s);
    expect(reduce(s, setTool(undefined as unknown as ToolId))).toBe(s);
  });

  it('changes nothing else', () => {
    const s = run(initial(), placeFurniture('chair', 3, 3, 0, 'living'), setMiniature(0.07, 30));
    const on = reduce(s, setTool('measure'));
    expect({ ...on, tool: 'furnish' }).toEqual(s);
  });

  it('notifies a store listener once per real change', () => {
    const store = createStore(initial());
    const seen: ToolId[] = [];
    store.subscribe((state) => seen.push(state.tool));
    store.dispatch(setTool('measure'));
    store.dispatch(setTool('measure'));
    store.dispatch(setTool('furnish'));
    expect(seen).toEqual(['measure', 'furnish']);
  });

  it('does not change the furniture history (not an undoable action)', () => {
    const s = run(initial(), placeFurniture('chair', 3, 3, 0, 'living'));
    const on = reduce(s, setTool('measure'));
    expect(on.history).toBe(s.history);
    expect(on.furniture).toBe(s.furniture);
  });
});

describe('the tool is never saved or restored', () => {
  it('serialize leaves it out', () => {
    const on = reduce(initial(), setTool('measure'));
    const json = JSON.parse(serialize(on)) as Record<string, unknown>;
    expect('tool' in json).toBe(false);
    expect(serialize(on)).toBe(serialize(initial()));
  });

  it('deserialize gives furnish, also for a saved text that has a tool', () => {
    const base = JSON.parse(serialize(initial())) as Record<string, unknown>;
    expect(deserialize(JSON.stringify(base))?.tool).toBe('furnish');
    expect(deserialize(JSON.stringify({ ...base, tool: 'measure' }))?.tool).toBe('furnish');
  });

  it('a round trip is lossless for everything but the tool', () => {
    const s = run(initial(), placeFurniture('chair', 3, 3, 0, 'living'));
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it('turning the tool on or off does not make the autosave write (the saved text does not change)', () => {
    const s = run(initial(), placeFurniture('chair', 3, 3, 0, 'living'));
    expect(serializeForSave(reduce(s, setTool('measure')))).toBe(serializeForSave(s));
    let now = 0;
    const planner = createSavePlanner(() => now);
    planner.baseline(serializeForSave(s));
    planner.update(serializeForSave(reduce(s, setTool('measure'))));
    now = 10_000;
    expect(planner.nextDelay()).toBeNull();
    expect(planner.poll()).toBeNull();
  });

  it('a restore keeps the tool of the session and the saved text never brings one', () => {
    const s = reduce(initial(), setTool('measure'));
    const saved = pickRestorable(serialize(run(initial(), placeFurniture('chair', 3, 3, 0, 'living'))), {
      houseId: 'apartment-a',
      catalogIds: new Set(['chair']),
      roomIds: new Set(['living']),
    });
    expect(saved).not.toBeNull();
    if (!saved) return;
    const after = reduce(s, restoreSaved({ furniture: saved.furniture, nextInstance: saved.nextInstance, history: saved.history, prefs: saved.prefs }));
    expect(after.tool).toBe('measure');
    expect(after.furniture).toHaveLength(1);
  });
});

describe('the tool never reaches the saved text, whatever the state', () => {
  const states = (): AppState[] => [
    initial(),
    run(initial(), placeFurniture('chair', 3, 3, 0, 'living')),
    run(initial(), placeFurniture('chair', 3, 3, 0, 'living'), setMiniature(0.07, 30)),
  ];

  it('serialize, serializeForSave and the picked restorable have no tool key, with the tool on or off', () => {
    const ctx = { houseId: 'apartment-a', catalogIds: new Set(['chair']), roomIds: new Set(['living']) };
    for (const s of states()) {
      for (const tool of TOOLS) {
        const withTool = reduce(s, setTool(tool));
        expect(Object.keys(JSON.parse(serialize(withTool)) as object)).not.toContain('tool');
        expect(Object.keys(JSON.parse(serializeForSave(withTool)) as object)).not.toContain('tool');
        const picked = pickRestorable(serialize(withTool), ctx);
        expect(picked).not.toBeNull();
        expect(Object.keys(picked ?? {})).not.toContain('tool');
        expect(serialize(withTool)).toBe(serialize(s));
        expect(serializeForSave(withTool)).toBe(serializeForSave(s));
      }
    }
  });

  it('round trip with the tool on: serialize then deserialize gives the same state with the tool back to furnish', () => {
    for (const s of states()) {
      const on = reduce(s, setTool('measure'));
      expect(deserialize(serialize(on))).toEqual({ ...on, tool: 'furnish' });
      expect(deserialize(serialize(deserialize(serialize(on)) as AppState))).toEqual({ ...on, tool: 'furnish' });
    }
  });

  it('a saved text with a tool field is read without it, and every invalid tool value does no harm', () => {
    const base = JSON.parse(serialize(initial())) as Record<string, unknown>;
    for (const tool of ['measure', 'ruler', '', null, 3, {}, ['measure']]) {
      expect(deserialize(JSON.stringify({ ...base, tool }))?.tool).toBe('furnish');
    }
  });

  it('restoreSaved never takes a tool from its payload', () => {
    const s = reduce(initial(), setTool('measure'));
    const payload = { furniture: [], nextInstance: {}, history: [], prefs: s.prefs, tool: 'furnish' };
    expect(reduce(s, restoreSaved(payload)).tool).toBe('measure');
    const f = initial();
    expect(reduce(f, restoreSaved(Object.assign({}, payload, { tool: 'measure' }))).tool).toBe('furnish');
  });

  it('setTool keeps the other tool-like state: selected room, view and miniature stay', () => {
    const s = run(initial(), setMiniature(0.09, 45));
    const on = reduce(s, setTool('measure'));
    expect(on.miniature).toBe(s.miniature);
    expect(on.view).toBe(s.view);
    expect(on.selectedRoomId).toBe(s.selectedRoomId);
  });
});
