import { describe, expect, it } from 'vitest';
import {
  MENU_TEXT_WITH_LARGE,
  formatAccessApplied,
  formatAccessContrast,
  formatAccessText,
  startupAccessLines,
} from '../../src/logic/access';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { pickRestorable, serializeForSave, type RestoreContext } from '../../src/logic/persistence';
import { createInitialState, deserialize, reduce, restoreSaved, serialize, setContrast, setLargeText, type AppState } from '../../src/logic/state';

const initial = (extra: Partial<typeof DEFAULT_PARAMS> = {}): AppState => createInitialState({ ...DEFAULT_PARAMS, ...extra });
const ctx = (extra: Partial<RestoreContext> = {}): RestoreContext => ({
  houseId: 'apartment-a',
  catalogIds: new Set<string>(),
  roomIds: new Set<string>(),
  ...extra,
});
const saved = (state: AppState): string => serializeForSave(state, []);

describe('the preferences contrast and largeText (T5.11, D58)', () => {
  it('start off and follow contrast= and text= of the URL', () => {
    expect(initial().prefs).toMatchObject({ contrast: false, largeText: false });
    expect(initial({ contrast: true, text: 'large' }).prefs).toMatchObject({ contrast: true, largeText: true });
    expect(initial({ text: 'normal' }).prefs.largeText).toBe(false);
  });

  it('are set by their actions; a repeated value keeps the same state object; a non-boolean is ignored', () => {
    const s = initial();
    const on = reduce(s, setContrast(true));
    expect(on.prefs.contrast).toBe(true);
    expect(reduce(on, setContrast(true))).toBe(on);
    expect(reduce(on, setContrast(false)).prefs.contrast).toBe(false);
    expect(reduce(s, setLargeText(true)).prefs.largeText).toBe(true);
    expect(reduce(s, setLargeText('yes' as unknown as boolean))).toBe(s);
    expect(reduce(s, setContrast(1 as unknown as boolean))).toBe(s);
    // The two are independent and do not touch the other preferences.
    const both = reduce(reduce(s, setContrast(true)), setLargeText(true));
    expect(both.prefs).toEqual({ ...s.prefs, contrast: true, largeText: true });
  });

  it('are saved and read back; an older state without them reads as off; a broken value reads as off', () => {
    const on = reduce(reduce(initial(), setContrast(true)), setLargeText(true));
    const back = deserialize(serialize(on));
    expect(back?.prefs).toMatchObject({ contrast: true, largeText: true });
    const old = JSON.parse(serialize(initial()));
    delete old.prefs.contrast;
    delete old.prefs.largeText;
    expect(deserialize(JSON.stringify(old))?.prefs).toMatchObject({ contrast: false, largeText: false });
    old.prefs.contrast = 'yes';
    old.prefs.largeText = 1;
    expect(deserialize(JSON.stringify(old))?.prefs).toMatchObject({ contrast: false, largeText: false });
  });

  it('come back from the saved state', () => {
    const on = reduce(reduce(initial(), setContrast(true)), setLargeText(true));
    const picked = pickRestorable(saved(on), ctx());
    expect(picked?.prefs).toMatchObject({ contrast: true, largeText: true });
    const restored = reduce(initial(), restoreSaved(picked!));
    expect(restored.prefs).toMatchObject({ contrast: true, largeText: true });
  });

  it('are left out of the restore when the URL named them, so the explicit value wins (0 and normal too)', () => {
    const on = reduce(reduce(initial(), setContrast(true)), setLargeText(true));
    const picked = pickRestorable(saved(on), ctx({ contrastExplicit: true, textExplicit: true }));
    expect(picked?.prefs).not.toHaveProperty('contrast');
    expect(picked?.prefs).not.toHaveProperty('largeText');
    // The session was started with contrast=0&text=normal: the restore keeps it.
    const restored = reduce(initial({ contrast: false, text: 'normal' }), restoreSaved(picked!));
    expect(restored.prefs).toMatchObject({ contrast: false, largeText: false });
    // Only one of them named: the other one still comes back.
    const half = pickRestorable(saved(on), ctx({ textExplicit: true }));
    expect(half?.prefs).toHaveProperty('contrast', true);
    expect(half?.prefs).not.toHaveProperty('largeText');
  });

  it('are restored also when only the preferences come back (a staging preset replaces the pieces)', () => {
    const on = reduce(initial(), setContrast(true));
    const picked = pickRestorable(saved(on), ctx({ ignoreFurniture: true }));
    expect(picked?.prefs).toMatchObject({ contrast: true });
  });

  it('a restore without the two fields keeps what the session has', () => {
    const session = reduce(initial(), setContrast(true));
    const s = reduce(session, restoreSaved({ furniture: [], nextInstance: {}, history: [], prefs: { onboardingStep: 'done', menuOpened: true } }));
    expect(s.prefs).toMatchObject({ contrast: true, largeText: false, menuOpened: true });
  });
});

describe('the access log lines', () => {
  it('have the shape of the contract', () => {
    expect(formatAccessContrast(true, 'ui')).toBe('access contrast=on source=ui');
    expect(formatAccessContrast(false, 'url')).toBe('access contrast=off source=url');
    expect(formatAccessText(true, 'ui')).toBe(`access text=large source=ui menu=${MENU_TEXT_WITH_LARGE}`);
    expect(formatAccessText(false, 'saved')).toBe('access text=normal source=saved menu=normal');
    expect(formatAccessApplied(7)).toBe('access applied recolored=7');
  });

  it('say source=url for a named value (0 and normal too), source=saved only for a saved value that is on, nothing for the defaults', () => {
    const base = { contrast: false, largeText: false, contrastExplicit: false, textExplicit: false, contrastSaved: false, textSaved: false };
    expect(startupAccessLines(base)).toEqual([]);
    expect(startupAccessLines({ ...base, contrast: true, largeText: true, contrastSaved: true, textSaved: true })).toEqual([
      'access contrast=on source=saved',
      'access text=large source=saved menu=normal',
    ]);
    expect(startupAccessLines({ ...base, contrastExplicit: true, textExplicit: true })).toEqual([
      'access contrast=off source=url',
      'access text=normal source=url menu=normal',
    ]);
    // The URL wins over a saved value that is on.
    expect(startupAccessLines({ ...base, contrastExplicit: true, contrastSaved: true })).toEqual(['access contrast=off source=url']);
  });
});
