import { describe, expect, it } from 'vitest';
import { formatAccessHand } from '../../src/logic/access';
import {
  buttonAnchors,
  createButtonPair,
  faceHead,
  issueButtonAnchors,
  menuButtonSide,
  pickButton,
  sideIndex,
  viewButtonAnchors,
} from '../../src/logic/menu-button';
import { DEFAULT_PARAMS } from '../../src/logic/params';
import { pickRestorable, serializeForSave, type RestoreContext } from '../../src/logic/persistence';
import { createInitialState, deserialize, reduce, restoreSaved, serialize, setLeftHandMenu, type AppState } from '../../src/logic/state';
import { buildViewModel, viewStepFor, viewToggleFor, type ViewTexts } from '../../src/logic/view-panel';
import { strings } from '../../src/ui/strings';

// UI fix 1: the Menu / Issues / View buttons are for the right hand, or, with the accessibility preference `leftHandMenu`, for the left.
const initial = (): AppState => createInitialState({ ...DEFAULT_PARAMS });
const ctx = (): RestoreContext => ({ houseId: 'apartment-a', catalogIds: new Set<string>(), roomIds: new Set<string>() });

describe('the preference leftHandMenu', () => {
  it('starts off: the right hand', () => {
    expect(initial().prefs.leftHandMenu).toBe(false);
    expect(menuButtonSide(initial().prefs.leftHandMenu)).toBe('right');
  });

  it('is set by its action; a repeated value keeps the same state object; a non-boolean is ignored; the other preferences stay', () => {
    const s = initial();
    const on = reduce(s, setLeftHandMenu(true));
    expect(on.prefs.leftHandMenu).toBe(true);
    expect(on.prefs).toEqual({ ...s.prefs, leftHandMenu: true });
    expect(reduce(on, setLeftHandMenu(true))).toBe(on);
    expect(reduce(on, setLeftHandMenu(false)).prefs.leftHandMenu).toBe(false);
    expect(reduce(s, setLeftHandMenu('left' as unknown as boolean))).toBe(s);
    expect(menuButtonSide(true)).toBe('left');
  });

  it('is saved and read back', () => {
    const on = reduce(initial(), setLeftHandMenu(true));
    expect(deserialize(serialize(on))?.prefs.leftHandMenu).toBe(true);
    expect(pickRestorable(serializeForSave(on, []), ctx())?.prefs.leftHandMenu).toBe(true);
    const restored = reduce(initial(), restoreSaved(pickRestorable(serializeForSave(on, []), ctx())!));
    expect(restored.prefs.leftHandMenu).toBe(true);
  });

  it('is backward compatible: a state saved before it existed reads as off, a broken value reads as off, and a restore without it keeps the session value', () => {
    const old = JSON.parse(serialize(initial()));
    delete old.prefs.leftHandMenu;
    expect(deserialize(JSON.stringify(old))?.prefs.leftHandMenu).toBe(false);
    old.prefs.leftHandMenu = 'yes';
    expect(deserialize(JSON.stringify(old))?.prefs.leftHandMenu).toBe(false);
    // A restore whose prefs do not name it (an older caller) leaves the session as it is.
    const session = reduce(initial(), setLeftHandMenu(true));
    const kept = reduce(session, restoreSaved({ furniture: [], nextInstance: {}, history: [], prefs: { onboardingStep: 'done', menuOpened: true } }));
    expect(kept.prefs.leftHandMenu).toBe(true);
  });

  it('is logged for the QA', () => {
    expect(formatAccessHand(true, 'ui')).toBe('access hand=left source=ui');
    expect(formatAccessHand(false, 'saved')).toBe('access hand=right source=saved');
  });
});

describe('the Hand row of the View panel', () => {
  const TEXTS: ViewTexts = {
    rows: strings.view.rows,
    sun: (a, c) => strings.view.sun(a, c),
    sunDown: strings.view.sunDown,
    turn: (d) => strings.view.turn(d),
    switches: strings.view.switches,
  };
  const inputs = { scale: 0.05, yawDeg: 0, sunTime: '2026-12-21T10:00', lat: 45.07, lon: 7.69 };

  it('shows Right by default and Left when the preference is on', () => {
    const hand = (leftHandMenu: boolean) => buildViewModel({ ...inputs, leftHandMenu }, TEXTS).rows.find((r) => r.id === 'hand');
    expect(hand(false)).toMatchObject({ label: 'Hand', value: 'Right' });
    expect(hand(true)).toMatchObject({ label: 'Hand', value: 'Left' });
  });

  it('`-` (the left button of the row, `L`) picks the left hand, `+` (`R`) the right hand', () => {
    const s = initial();
    const left = viewStepFor(s, 'hand', -1);
    expect(left.value).toBe('left');
    expect(reduce(s, left.action).prefs.leftHandMenu).toBe(true);
    const on = reduce(s, left.action);
    const right = viewStepFor(on, 'hand', 1);
    expect(right.value).toBe('right');
    expect(reduce(on, right.action).prefs.leftHandMenu).toBe(false);
  });

  it('a press on the value flips it', () => {
    const s = initial();
    const flipped = reduce(s, viewToggleFor(s, 'hand').action);
    expect(flipped.prefs.leftHandMenu).toBe(true);
    expect(reduce(flipped, viewToggleFor(flipped, 'hand').action).prefs.leftHandMenu).toBe(false);
  });
});

describe('the buttons of one side', () => {
  const anchor = { x: 0, y: 0.75, z: -0.5 };
  const pairs = () => {
    const menu = faceHead(buttonAnchors(anchor, 0.05, 0, createButtonPair()), { x: 0, y: 1.4, z: 0 });
    const issues = issueButtonAnchors(menu, createButtonPair());
    const view = viewButtonAnchors(issues, createButtonPair());
    return { menu, issues, view };
  };

  it('maps a side to its index in a pair (left first)', () => {
    expect(sideIndex('left')).toBe(0);
    expect(sideIndex('right')).toBe(1);
  });

  it('the left and right buttons are on the two sides of the model', () => {
    const { menu } = pairs();
    expect(menu[0].x).toBeLessThan(anchor.x);
    expect(menu[1].x).toBeGreaterThan(anchor.x);
  });

  it('a pinch on a button of the other side picks nothing when only one side is a target', () => {
    const { menu, issues, view } = pairs();
    const rightTargets = [menu[1], issues[1], view[1]];
    const leftTargets = [menu[0], issues[0], view[0]];
    const onLeftMenu = { x: menu[0].x, y: menu[0].y, z: menu[0].z };
    const onRightMenu = { x: menu[1].x, y: menu[1].y, z: menu[1].z };
    expect(pickButton(onLeftMenu, rightTargets)).toBeNull();
    expect(pickButton(onRightMenu, rightTargets)).toBe(menu[1]);
    expect(pickButton(onRightMenu, leftTargets)).toBeNull();
    expect(pickButton(onLeftMenu, leftTargets)).toBe(menu[0]);
  });
});
