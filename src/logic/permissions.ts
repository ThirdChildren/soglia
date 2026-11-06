// Permissions per role and action (D43 in docs/plans/M4.md) as a declarative table.
// No imports from @iwsdk/core or three. The state machine (`issue-state.ts`) and the UI ask `can`.

import { ROLES } from './params';
import type { Role } from './params';
import type { Issue, IssueStatus } from './issues';

/** What a role may try. `take-on`, `resolve`, `confirm` and `reopen` are the status transitions of D43. */
export const PERMISSION_ACTIONS = [
  'view-pins',
  'create',
  'take-on',
  'resolve',
  'confirm',
  'reopen',
  'view-move-in',
  'view-info',
  'stage',
  'change-role',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** The four status transitions. */
export type TransitionAction = Extract<PermissionAction, 'take-on' | 'resolve' | 'confirm' | 'reopen'>;

/**
 * The roles that may do each action. The agent has no issue tools: it sees the info points (`view-info`, shared with the visitor,
 * who never sees the pins of the issues) and furnishes or clears the house (`stage`, D57 in docs/plans/M5.md).
 */
export const PERMISSION_TABLE: Readonly<Record<PermissionAction, readonly Role[]>> = {
  'view-pins': ['tenant', 'landlord'],
  create: ['tenant'],
  'take-on': ['landlord'],
  resolve: ['landlord'],
  confirm: ['tenant'],
  reopen: ['tenant'],
  'view-move-in': ['tenant', 'landlord'],
  'view-info': ['visitor', 'agent'],
  stage: ['agent'],
  'change-role': ['visitor', 'agent', 'tenant', 'landlord'],
};

/** The status an issue must have for each transition (the same pairs as `docs/DATA_FORMATS.md`). */
export const TRANSITION_FROM: Readonly<Record<TransitionAction, IssueStatus>> = {
  'take-on': 'open',
  resolve: 'in_progress',
  confirm: 'resolved',
  reopen: 'resolved',
};

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

export function isPermissionAction(v: unknown): v is PermissionAction {
  return typeof v === 'string' && (PERMISSION_ACTIONS as readonly string[]).includes(v);
}

export function isTransitionAction(v: unknown): v is TransitionAction {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TRANSITION_FROM, v);
}

/** Table lookup only: may this role ever do this action? Unknown role or action: false. */
export function roleAllows(role: Role, action: PermissionAction): boolean {
  if (!isRole(role) || !isPermissionAction(action)) return false;
  return PERMISSION_TABLE[action].includes(role);
}

/**
 * May this role do this action? With `issue` given, a transition also needs an `issue` entry in the status
 * the transition starts from (so `can('landlord', 'resolve', openIssue)` is false). Without `issue`, only
 * the role is checked, which is what a button that appears for a role needs.
 */
export function can(role: Role, action: PermissionAction, issue?: Pick<Issue, 'kind' | 'status'>): boolean {
  if (!roleAllows(role, action)) return false;
  if (issue === undefined || !isTransitionAction(action)) return true;
  return issue.kind === 'issue' && issue.status === TRANSITION_FROM[action];
}
