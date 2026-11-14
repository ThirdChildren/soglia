import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { pickRestorable } from '../../src/logic/persistence';
import { createInitialState, deserialize, serialize } from '../../src/logic/state';
import { checkCatalog } from '../../src/logic/catalog';

// UI fixes 2 and 4: the FitCheck and the tape measure are gone. A state saved by an older build may still carry their traces
// (`tool`, a `fit` tab, unknown keys): it must still load and the stale fields must be ignored.
describe('a state saved before the FitCheck and the tape measure were removed', () => {
  const base = JSON.parse(serialize(createInitialState({ ...DEFAULT_PARAMS })));

  it('loads, and ignores `tool` and any other stale key', () => {
    const old = { ...base, tool: 'measure', measure: { points: [1, 2] }, prefs: { ...base.prefs, tab: 'fit', fitSeen: true } };
    const state = deserialize(JSON.stringify(old));
    expect(state).not.toBeNull();
    expect(state && 'tool' in state).toBe(false);
    expect(state && Object.keys(state.prefs).sort()).toEqual(Object.keys(base.prefs).sort());
  });

  it('is never written again with the stale keys', () => {
    const old = { ...base, tool: 'measure' };
    const state = deserialize(JSON.stringify(old));
    expect(state).not.toBeNull();
    expect(JSON.parse(serialize(state!))).not.toHaveProperty('tool');
  });

  it('comes back through the restore path with its pieces and preferences', () => {
    const old = JSON.stringify({ ...base, tool: 'measure' });
    const picked = pickRestorable(old, { houseId: 'apartment-a', catalogIds: new Set<string>(), roomIds: new Set<string>() });
    expect(picked).not.toBeNull();
    expect(picked?.prefs.leftHandMenu).toBe(false);
  });

  it('keeps the catalog data format: mobility items and disassemblable are still valid', () => {
    const check = checkCatalog({
      items: [
        { id: 'wheelchair', name: 'Wheelchair', kind: 'mobility', size: [0.7, 1, 0.9], disassemblable: false, owner: 'me' },
        { id: 'bed', name: 'Bed', kind: 'furniture', size: [1.6, 2, 0.5], disassemblable: true, owner: 'me' },
      ],
    });
    expect(check.ok).toBe(true);
  });
});
