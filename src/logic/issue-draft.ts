// The draft of a new issue (task T4.5, decisions D42, D45): what the long pinch decided before the form fills in the rest. Pure
// logic: no imports from @iwsdk/core or three. The form (T4.7) reads it with `getDraft()` and adds the category (free points),
// the phrase and the urgency; the draft itself holds only the anchor.

import type { IssueAnchor } from './issue-anchor';
import type { Vec3Tuple } from './furniture-pose';
import type { IssueCategory } from './issues';

export interface IssueDraft {
  /** `[x, y, z]` in house coordinates (metres): the fixture's own position when it snapped, else the rounded pinch. */
  readonly position: Readonly<Vec3Tuple>;
  /** Id of the fixture the draft snapped to (`washer`), or null for a free point. */
  readonly fixtureId: string | null;
  /** The room that holds the point (derived; the stored issue does not keep it). */
  readonly roomId: string;
  /** The category the fixture proposes; null for a free point (the user chooses it). */
  readonly category: IssueCategory | null;
}

/** The draft of an anchor (the position is copied, so later changes to the anchor do not reach the draft). */
export function draftFromAnchor(anchor: Readonly<IssueAnchor>): IssueDraft {
  return {
    position: [anchor.position[0], anchor.position[1], anchor.position[2]],
    fixtureId: anchor.fixture ? anchor.fixture.id : null,
    roomId: anchor.room.id,
    category: anchor.category,
  };
}

/** Why a draft was dropped (the `reason=` of the contract line): the user left the form, the session was suspended, the role changed. */
export type DraftCancelReason = 'user' | 'suspend' | 'role';

const fixed2 = (v: number): string => (Math.round(v * 100) / 100 + 0).toFixed(2);

/** `issue draft created at=0.42,0.85,5.05 fixture=washer category=appliances room=bathroom` (a free point: `fixture=- category=-`). */
export function formatDraftCreated(draft: Readonly<IssueDraft>): string {
  const at = `${fixed2(draft.position[0])},${fixed2(draft.position[1])},${fixed2(draft.position[2])}`;
  return `issue draft created at=${at} fixture=${draft.fixtureId ?? '-'} category=${draft.category ?? '-'} room=${draft.roomId}`;
}

/** `issue draft cancelled reason=user`. */
export function formatDraftCancelled(reason: DraftCancelReason): string {
  return `issue draft cancelled reason=${reason}`;
}

/** `issue denied action=create role=visitor`. */
export function formatCreateDenied(role: string): string {
  return `issue denied action=create role=${role}`;
}

/** Why a long pinch that is not denied by the role starts nothing: shown once, when the pinch has lasted as long as a long pinch. */
export type HoldIgnoredReason = 'no-anchor' | 'draft-open';

/** `issue hold ignored reason=no-anchor` (the pinch is outside the house, or not over a room). */
export function formatHoldIgnored(reason: HoldIgnoredReason): string {
  return `issue hold ignored reason=${reason}`;
}
