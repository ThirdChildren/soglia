import { describe, expect, it } from 'vitest';
import {
  CONTROL_SLOTS,
  HOME_ACTION_HEIGHT,
  HOME_ACTION_WIDTH,
  HOME_ACTIONS_TOP_Y,
  HOME_CHIP_HEIGHT,
  HOME_CHIP_WIDTH,
  HOME_FOOTER_TOP_Y,
  HOME_GAP_X,
  HOME_GAP_Y,
  HOME_HINT_HEIGHT,
  HOME_HINT_TOP_Y,
  AGENT_ROLE_AVAILABLE,
  HOME_ROLES,
  HOME_TOP_Y,
  ISSUE_BAR_HEIGHT,
  ISSUE_PANEL,
  ISSUE_PANEL_EXTENT,
  ISSUE_SECTION_GAP,
  controlStableId,
  homeSlotIds,
  createRoleObserver,
  formatRoleChanged,
  formatRoleSet,
  homeActions,
  homeControls,
  homeHint,
  issueCount,
  roleControlId,
  roleOfControl,
  screenControls,
  type IssueControlId,
  type StaticControlId,
} from '../../src/logic/issue-panel';
import { pickRect, type PickSlot } from '../../src/logic/menu';
import { can } from '../../src/logic/permissions';
import { ROLES, type Role } from '../../src/logic/params';
import { createInitialState, createStore, setRole } from '../../src/logic/state';
import { strings } from '../../src/ui/strings';
import { loadJson, readText } from '../helpers/load-json';

// Task T4.6b, decision D47 and D41: the `home` screen of the Issues panel. For each role, EXACTLY the controls the
// permission table asks for exist (no more, no fewer), they are inside the panel, they do not overlap, and the texts that
// are drawn on them fit them. Measured with the real layout file and the real font metrics.

const ALL_ROLES: readonly Role[] = ['visitor', 'agent', 'tenant', 'landlord'];

describe('the controls of home for each role', () => {
  // The Agent chip is hidden until T5.10 turns AGENT_ROLE_AVAILABLE on (T5.R3): then there are four chips again.
  const chips = ['visitor', 'agent', 'tenant', 'landlord']
    .filter((r) => r !== 'agent' || AGENT_ROLE_AVAILABLE)
    .map((r) => `role-${r}`);

  it.skipIf(AGENT_ROLE_AVAILABLE)('while the Agent role is not available, home has three chips and no Agent chip (T5.R3)', () => {
    expect(chips).toEqual(['role-visitor', 'role-tenant', 'role-landlord']);
    for (const role of ALL_ROLES) {
      expect(homeControls(role)).not.toContain('role-agent');
      expect(screenControls('home', role)).not.toContain('role-agent');
    }
    expect([...HOME_ROLES]).toEqual(['visitor', 'tenant', 'landlord']);
    // an agent that came in through role=agent still has Close and no buttons
    expect(homeControls('agent')).toEqual([...chips, 'close']);
  });

  it('the visitor has the chips and Close, nothing else', () => {
    expect(homeControls('visitor')).toEqual([...chips, 'close']);
    expect(homeActions('visitor')).toEqual([]);
    expect(homeActions('visitor', true)).toEqual([]);
  });

  it('the agent has Furnish only in a house with staging, and Clear always (no dead button, T5.10)', () => {
    expect(homeActions('agent', true)).toEqual(['agent-furnish', 'agent-clear']);
    expect(homeActions('agent', false)).toEqual(['agent-clear']);
    expect(homeControls('agent', true)).toEqual([...chips, 'agent-furnish', 'agent-clear', 'close']);
    expect(homeControls('agent', false)).toEqual([...chips, 'agent-clear', 'close']);
    expect(screenControls('home', 'agent', true)).toEqual(homeControls('agent', true));
    // Nobody else may stage, whatever the house has.
    for (const role of ['visitor', 'tenant', 'landlord'] as const) {
      expect(homeActions(role, true), role).not.toContain('agent-furnish');
      expect(homeActions(role, true), role).not.toContain('agent-clear');
    }
  });

  it('the buttons of the agent take the two places of the row and keep them (Clear stays on the right without Furnish)', () => {
    expect(homeSlotIds('agent')).toEqual(['agent-furnish', 'agent-clear']);
    for (const role of ['visitor', 'tenant', 'landlord'] as const) expect(homeSlotIds(role)).toEqual(['open-list', 'open-movein']);
    expect(CONTROL_SLOTS['agent-furnish']).toEqual({ ...CONTROL_SLOTS['open-list'], id: 'agent-furnish' });
    expect(CONTROL_SLOTS['agent-clear']).toEqual({ ...CONTROL_SLOTS['open-movein'], id: 'agent-clear' });
  });

  it('names the buttons of the agent ui:agent-furnish and ui:agent-clear', () => {
    expect(controlStableId('agent-furnish')).toBe('ui:agent-furnish');
    expect(controlStableId('agent-clear')).toBe('ui:agent-clear');
    expect(controlStableId('open-list')).toBe('ui:issue-open-list');
  });

  it('the tenant and the landlord have the chips, the list, the move-in report and Close', () => {
    for (const role of ['tenant', 'landlord'] as const) {
      expect(homeControls(role), role).toEqual([...chips, 'open-list', 'open-movein', 'close']);
      expect(homeActions(role), role).toEqual(['open-list', 'open-movein']);
    }
  });

  it('follows the permission table: the list needs view-pins and the report view-move-in', () => {
    for (const role of ALL_ROLES) {
      expect(homeActions(role).includes('open-list'), role).toBe(can(role, 'view-pins'));
      expect(homeActions(role).includes('open-movein'), role).toBe(can(role, 'view-move-in'));
    }
  });

  it('there is no Back on home, and the other screens have Back and Close whatever the role', () => {
    for (const role of ALL_ROLES) {
      expect(screenControls('home', role)).not.toContain('back');
      for (const screen of ['list', 'detail', 'movein'] as const) expect(screenControls(screen, role)).toEqual(['back', 'close']);
      // The form of a new issue brings its own buttons (src/logic/issue-form.ts): none of the fixed ones.
      expect(screenControls('new', role)).toEqual([]);
    }
  });

  it('the stable ids are the ones of the plan', () => {
    expect(HOME_ROLES.map((r) => controlStableId(roleControlId(r)))).toEqual(
      [
        'ui:issue-role-visitor',
        'ui:issue-role-agent',
        'ui:issue-role-tenant',
        'ui:issue-role-landlord',
      ].filter((id) => id !== 'ui:issue-role-agent' || AGENT_ROLE_AVAILABLE),
    );
    expect(controlStableId('open-list')).toBe('ui:issue-open-list');
    expect(controlStableId('open-movein')).toBe('ui:issue-open-movein');
    expect([...HOME_ROLES]).toEqual(ROLES.filter((r) => r !== 'agent' || AGENT_ROLE_AVAILABLE));
  });

  it('roleOfControl reads the chips and nothing else', () => {
    for (const role of ALL_ROLES) expect(roleOfControl(roleControlId(role))).toBe(role);
    for (const id of ['back', 'close', 'open-list', 'open-movein'] as const) expect(roleOfControl(id)).toBeNull();
    expect(roleOfControl('role-owner' as IssueControlId)).toBeNull();
  });

  it('every control of every set has a slot', () => {
    for (const role of ALL_ROLES) {
      for (const screen of ['home', 'list'] as const) {
        for (const id of screenControls(screen, role)) expect(CONTROL_SLOTS[id], `${screen}/${role}/${id}`).toBeDefined();
      }
    }
  });
});

describe('the hint of home', () => {
  it('the tenant is told how to report, the visitor to pick a role, the agent what its buttons do, the landlord nothing', () => {
    expect(homeHint('tenant')).toBe('report');
    expect(homeHint('visitor')).toBe('pick-role');
    expect(homeHint('agent', true)).toBe('stage');
    expect(homeHint('agent', false)).toBe('stage-clear');
    expect(homeHint('landlord')).toBeNull();
  });

  it('the texts are the ones of the scenarios', () => {
    expect(strings.issues.hints.report).toBe('Hold a pinch on an appliance or a spot to report an issue.');
    expect(strings.issues.hints['pick-role']).toBe('Pick Tenant to report an issue or Landlord to manage them.');
    expect(strings.issues.roles).toEqual({ visitor: 'Visitor', agent: 'Agent', tenant: 'Tenant', landlord: 'Landlord' });
    expect(strings.issues.openList(4)).toBe('Issues (4)');
    expect(strings.issues.openMoveIn).toBe('Move-in report');
  });
});

describe('the number in "Issues (n)"', () => {
  it('counts the issues and not the move-in baseline', () => {
    expect(issueCount([])).toBe(0);
    expect(issueCount([{ kind: 'issue' }, { kind: 'baseline' }, { kind: 'issue' }, { kind: 'issue' }])).toBe(3);
  });
});

describe('the slots of home', () => {
  const homeSlots = (role: Role) => screenControls('home', role).map((id) => CONTROL_SLOTS[id]);
  const rect = (id: StaticControlId) => {
    const slot = CONTROL_SLOTS[id];
    return { left: slot.dx - slot.halfWidth, right: slot.dx + slot.halfWidth, bottom: slot.dy - slot.halfHeight, top: slot.dy + slot.halfHeight };
  };

  it('are inside the panel (the extent whose cone and distance were measured)', () => {
    for (const slot of Object.values(CONTROL_SLOTS)) {
      expect(slot.dx - slot.halfWidth).toBeGreaterThanOrEqual(-ISSUE_PANEL_EXTENT.halfWidth - 1e-9);
      expect(slot.dx + slot.halfWidth).toBeLessThanOrEqual(ISSUE_PANEL_EXTENT.halfWidth + 1e-9);
      expect(slot.dy - slot.halfHeight).toBeGreaterThanOrEqual(ISSUE_PANEL_EXTENT.bottom - 1e-9);
      expect(slot.dy + slot.halfHeight).toBeLessThanOrEqual(ISSUE_PANEL_EXTENT.top + 1e-9);
    }
  });

  it('do not overlap each other, for any role', () => {
    for (const role of ALL_ROLES) {
      const ids = screenControls('home', role);
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const a = rect(ids[i]);
          const b = rect(ids[j]);
          const apart = a.right <= b.left + 1e-9 || b.right <= a.left + 1e-9 || a.top <= b.bottom + 1e-9 || b.top <= a.bottom + 1e-9;
          expect(apart, `${role}: ${ids[i]} / ${ids[j]}`).toBe(true);
        }
      }
    }
  });

  it('the chips are two by two, in reading order, and the buttons sit under the hint with the footer below them', () => {
    const [visitor, agent, tenant, landlord] = ROLES.map((r) => CONTROL_SLOTS[roleControlId(r)]);
    expect(visitor.dy).toBeCloseTo(agent.dy, 12);
    expect(tenant.dy).toBeCloseTo(landlord.dy, 12);
    expect(visitor.dx).toBeLessThan(0);
    expect(agent.dx).toBeGreaterThan(0);
    expect(visitor.dy).toBeGreaterThan(tenant.dy);
    expect(CONTROL_SLOTS['open-list'].dx).toBeLessThan(0);
    expect(CONTROL_SLOTS['open-movein'].dx).toBeGreaterThan(0);
    expect(CONTROL_SLOTS['open-list'].dy).toBeCloseTo(CONTROL_SLOTS['open-movein'].dy, 12);
    expect(CONTROL_SLOTS['open-list'].dy).toBeLessThan(tenant.dy);
    // The footer starts under the buttons and its text (2.4 x 1.1) ends above the bottom of the body.
    const bodyBottom = ISSUE_BAR_HEIGHT + ISSUE_SECTION_GAP + 0.4;
    expect(HOME_FOOTER_TOP_Y - 2.4 * 1.1).toBeGreaterThanOrEqual(bodyBottom);
  });

  it('are 2.4 cm or more on each side (a pinch is not asked for millimetres)', () => {
    for (const slot of homeSlots('tenant')) {
      expect(slot.halfWidth * 200).toBeGreaterThanOrEqual(HOME_CHIP_HEIGHT - 1e-9);
      expect(slot.halfHeight * 200).toBeGreaterThanOrEqual(HOME_CHIP_HEIGHT - 1e-9);
    }
  });

  it('a pinch in the middle of each rectangle picks that control, and only the ones the role has', () => {
    const frame = { x: 0, y: 0, z: 0, w: 1 };
    for (const role of ALL_ROLES) {
      const slots: (PickSlot & { id: IssueControlId })[] = screenControls('home', role).map((id) => ({
        id,
        x: CONTROL_SLOTS[id].dx,
        y: CONTROL_SLOTS[id].dy,
        z: 0,
        halfWidth: CONTROL_SLOTS[id].halfWidth,
        halfHeight: CONTROL_SLOTS[id].halfHeight,
      }));
      for (const id of Object.keys(CONTROL_SLOTS) as StaticControlId[]) {
        const hit = pickRect({ x: CONTROL_SLOTS[id].dx, y: CONTROL_SLOTS[id].dy, z: 0 }, slots, frame);
        if (screenControls('home', role).includes(id)) expect(hit?.id, `${role} ${id}`).toBe(id);
        // The two buttons of the agent share the places of Issues and Move-in report: another role's button may sit there.
        else if (id !== 'back' && !BUTTON_PLACES.includes(id)) expect(hit, `${role} ${id}`).toBeNull();
      }
    }
  });
});

const BUTTON_PLACES: readonly StaticControlId[] = ['open-list', 'open-movein', 'agent-furnish', 'agent-clear'];

describe('the layout file says the same as the slots', () => {
  const source = readText('public', 'ui', 'issue-panel.uikitml');
  const styleOf = (id: string): Record<string, string> => {
    const match = new RegExp(`id="${id}"[^>]*style="([^"]*)"`).exec(source);
    if (!match) throw new Error(`element ${id} not found`);
    const style: Record<string, string> = {};
    for (const part of match[1].split(';')) {
      const colon = part.indexOf(':');
      if (colon > 0) style[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
    }
    return style;
  };
  const num = (style: Record<string, string>, key: string): number => Number.parseFloat(style[key]);

  it('the chips and the buttons have the size of their slots, and the rows the gaps', () => {
    for (const role of ALL_ROLES) {
      expect(num(styleOf(`issue-panel-role-${role}`), 'width')).toBeCloseTo(HOME_CHIP_WIDTH, 6);
      expect(num(styleOf(`issue-panel-role-${role}`), 'height')).toBeCloseTo(HOME_CHIP_HEIGHT, 6);
      const slot = CONTROL_SLOTS[roleControlId(role)];
      expect(slot.halfWidth * 200).toBeCloseTo(HOME_CHIP_WIDTH, 6);
      expect(slot.halfHeight * 200).toBeCloseTo(HOME_CHIP_HEIGHT, 6);
    }
    for (const id of ['open-list', 'open-movein'] as const) {
      expect(num(styleOf(`issue-panel-${id}`), 'width')).toBeCloseTo(HOME_ACTION_WIDTH, 6);
      expect(num(styleOf(`issue-panel-${id}`), 'height')).toBeCloseTo(HOME_ACTION_HEIGHT, 6);
    }
    // Two per row with the gap between them fill the width of the row.
    const row = num(styleOf('issue-panel-roles-1'), 'width');
    expect(2 * HOME_CHIP_WIDTH + HOME_GAP_X).toBeCloseTo(row, 6);
    expect(num(styleOf('issue-panel-actions'), 'width')).toBeCloseTo(row, 6);
    expect(num(styleOf('issue-panel-roles-2'), 'margin-top')).toBeCloseTo(HOME_GAP_Y, 6);
    expect(num(styleOf('issue-panel-hint-box'), 'margin-top')).toBeCloseTo(HOME_GAP_Y, 6);
    expect(num(styleOf('issue-panel-hint-box'), 'height')).toBeCloseTo(HOME_HINT_HEIGHT, 6);
    expect(num(styleOf('issue-panel-actions'), 'margin-top')).toBeCloseTo(HOME_GAP_Y, 6);
    expect(num(styleOf('issue-panel-footer'), 'margin-top')).toBeCloseTo(HOME_GAP_Y, 6);
    // The inner width of the body (36 less the two borders) holds the rows.
    expect(row).toBeCloseTo(ISSUE_PANEL.width - 2 * 0.4, 6);
  });

  it('the first row starts under the title, the body border and its padding', () => {
    expect(num(styleOf('issue-panel-body'), 'padding-top')).toBeCloseTo(0.4, 6);
    expect(HOME_TOP_Y).toBeCloseTo(32.4, 6);
    expect(HOME_HINT_TOP_Y).toBeCloseTo(HOME_TOP_Y - 2 * HOME_CHIP_HEIGHT - 2 * HOME_GAP_Y, 9);
    expect(HOME_ACTIONS_TOP_Y).toBeCloseTo(HOME_HINT_TOP_Y - HOME_HINT_HEIGHT - HOME_GAP_Y, 9);
  });
});

describe('the texts fit where they are drawn', () => {
  interface Atlas {
    chars: { char: string; xadvance: number }[];
    info: { size: number };
  }
  const advances = (file: string): Map<string, number> => {
    const atlas = loadJson<Atlas>('public/fonts', file);
    return new Map(atlas.chars.map((glyph) => [glyph.char, glyph.xadvance / atlas.info.size]));
  };
  const REGULAR = advances('inter-regular.json');
  const BOLD = advances('inter-bold.json');
  const width = (text: string, size: number, font: Map<string, number>): number => {
    let em = 0;
    for (const char of text) {
      const advance = font.get(char);
      if (advance === undefined) throw new Error(`glyph "${char}" is not in the panel font`);
      em += advance;
    }
    return em * size;
  };
  /** Lines needed by a greedy word wrap (no kerning: slightly generous). */
  const lines = (text: string, size: number, font: Map<string, number>, max: number): number => {
    let count = 1;
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (width(next, size, font) <= max || !line) line = next;
      else {
        count += 1;
        line = word;
      }
    }
    return count;
  };
  const BORDER = 0.4;

  it('each role name fits its chip with room at the sides', () => {
    for (const role of ALL_ROLES) {
      expect(width(strings.issues.roles[role], 2.4, BOLD), role).toBeLessThanOrEqual(HOME_CHIP_WIDTH - 2 * BORDER - 1);
    }
  });

  it('"Issues (n)" fits its button on one line up to 99 issues, "Move-in report" on at most two lines', () => {
    const inner = HOME_ACTION_WIDTH - 2 * BORDER - 1;
    expect(width(strings.issues.openList(99), 2.4, BOLD)).toBeLessThanOrEqual(inner);
    expect(lines(strings.issues.openMoveIn, 2.4, BOLD, inner)).toBeLessThanOrEqual(2);
    // Two lines of 2.4 at a line height of 1 and the borders fit the height of the button.
    expect(2 * 2.4 * 1 + 2 * BORDER).toBeLessThanOrEqual(HOME_ACTION_HEIGHT);
  });

  it('every hint fits the three lines that are kept for it; no text in view says "coming soon"', () => {
    for (const text of Object.values(strings.issues.hints)) {
      expect(lines(text, 2.4, REGULAR, 34.4), text).toBeLessThanOrEqual(3);
    }
    expect(3 * 2.4 * 1).toBeLessThanOrEqual(HOME_HINT_HEIGHT + 1e-9);
    expect(JSON.stringify(strings).toLowerCase()).not.toContain('coming soon');
  });
});

describe('the role changes are observable', () => {
  it('the observer reports a change once and nothing for the same role', () => {
    const observer = createRoleObserver('tenant');
    expect(observer.role).toBe('tenant');
    expect(observer.observe('tenant')).toBeNull();
    expect(observer.observe('landlord')).toEqual({ from: 'tenant', to: 'landlord' });
    expect(observer.role).toBe('landlord');
    expect(observer.observe('landlord')).toBeNull();
    expect(observer.observe('visitor')).toEqual({ from: 'landlord', to: 'visitor' });
  });

  it('following the store, every real change of role is seen with its from and to, and the same role again is not', () => {
    const store = createStore(createInitialState({ house: 'apartment-a', role: 'tenant' } as never));
    const observer = createRoleObserver(store.get().role);
    const seen: string[] = [];
    store.subscribe((state) => {
      const change = observer.observe(state.role);
      if (change) seen.push(`${change.from}>${change.to}`);
    });
    store.dispatch(setRole('tenant'));
    store.dispatch(setRole('visitor'));
    store.dispatch(setRole('visitor'));
    store.dispatch(setRole('bogus' as never));
    store.dispatch(setRole('landlord'));
    expect(seen).toEqual(['tenant>visitor', 'visitor>landlord']);
  });

  it('the log lines are the ones of the contract', () => {
    expect(formatRoleChanged({ from: 'tenant', to: 'landlord' }, 'ui')).toBe('role changed from=tenant to=landlord source=ui');
    expect(formatRoleSet('landlord', 'panel')).toBe('role set landlord source=panel');
  });
});
