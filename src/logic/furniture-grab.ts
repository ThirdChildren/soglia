// Decisions of grabbing and placing a piece (task T2.13, decisions D14, D15, D17). Pure logic: no imports
// from @iwsdk/core or three. The system src/systems/furniture-grab.ts reads the hand, calls these
// functions and writes the result to the scene and the store.
//
// A piece is picked up from a menu item (a new piece) or from the model (a placed piece), held in ONE hand
// at a time, and released. While it is held, `evaluateHeld` gives the pose it would take (snapped to the
// walls and the grid, D16), whether it is valid and the colour of the preview frame. On release,
// `releaseAction` says what to do: place or move the piece, or send it back where it came from.

import type { CatalogItem } from './catalog';
import { snapPose, evaluatePlacement } from './placement-rules';
import type { PlacedLike, PlacementResult, Pose, Reason } from './placement-rules';

export type GrabSource = 'menu' | 'model';
export type GrabHand = 'left' | 'right';

/** The piece in the hand. `id` is the stable id it has (or will have) in the store. */
export interface HeldPiece {
  readonly id: string;
  readonly catalogId: string;
  readonly source: GrabSource;
  readonly hand: GrabHand;
}

/**
 * The one-piece-at-a-time state machine: `idle` -> `held` -> `idle`. `begin` refuses while a piece is held.
 */
export interface GrabMachine {
  readonly state: 'idle' | 'held';
  held(): HeldPiece | null;
  /** Starts holding `piece`. Returns false (nothing changes) when a piece is already held. */
  begin(piece: HeldPiece): boolean;
  /** Stops holding and returns the piece that was held, or null when idle. */
  end(): HeldPiece | null;
}

export function createGrabMachine(): GrabMachine {
  let current: HeldPiece | null = null;
  return {
    get state() {
      return current === null ? 'idle' : 'held';
    },
    held: () => current,
    begin(piece) {
      if (current !== null) return false;
      current = piece;
      return true;
    },
    end() {
      const previous = current;
      current = null;
      return previous;
    },
  };
}

/** What a held piece would become if it were released now. */
export interface HeldEval {
  /** Snapped pose (plan metres). */
  pose: Pose;
  result: PlacementResult;
  /** `valid`, or `invalid` for every other result (also outside the house, as in the log lines of D21). */
  status: 'valid' | 'invalid';
  /** Colour of the preview frame. */
  outline: 'green' | 'red';
  /** False when the hand is not over the model: there is no sensible place for the frame. */
  frameVisible: boolean;
  /** True when the hand is over the model. */
  overModel: boolean;
}

export interface EvalInput {
  house: Parameters<typeof evaluatePlacement>[0];
  item: Pick<CatalogItem, 'size'>;
  catalog: readonly Pick<CatalogItem, 'id' | 'size'>[];
  /** The other pieces in the model (the held one left out). */
  others: readonly PlacedLike[];
  /** The hand on the plan, [x, z], plan metres. */
  handPlan: Readonly<[number, number]>;
  /** The grab offset, piece centre minus hand at the start of the grab, plan metres (0 for a new piece). */
  offset: Readonly<[number, number]>;
  rotationDeg: number;
  /** Result of `isOverModel` for the hand. */
  overModel: boolean;
}

const OUTSIDE: PlacementResult = { status: 'outside', reasons: ['outside-house'], roomId: null, details: {} };

/** The pose the held piece would take on release, and whether that is valid. */
export function evaluateHeld(input: EvalInput): HeldEval {
  const raw: Pose = {
    x: input.handPlan[0] + input.offset[0],
    z: input.handPlan[1] + input.offset[1],
    rotationDeg: input.rotationDeg,
  };
  const pose = snapPose(input.house, input.item, raw);
  if (!input.overModel) {
    return { pose, result: OUTSIDE, status: 'invalid', outline: 'red', frameVisible: false, overModel: false };
  }
  const result = evaluatePlacement(input.house, input.item, pose, input.others, input.catalog);
  const valid = result.status === 'valid';
  return {
    pose,
    result,
    status: valid ? 'valid' : 'invalid',
    outline: valid ? 'green' : 'red',
    frameVisible: true,
    overModel: true,
  };
}

export type ReleaseAction =
  | { kind: 'place'; pose: Pose; roomId: string; status: 'valid' | 'invalid' }
  | { kind: 'move'; id: string; pose: Pose; roomId: string; status: 'valid' | 'invalid' }
  | { kind: 'return'; from: GrabSource };

/**
 * What to do when the hand lets go (D14): a pose in a room, valid or not, is kept (a new piece is placed,
 * a piece of the model is moved); a pose outside every room, or a hand that is not over the model, sends
 * the piece back (`from=menu` for a new piece, `from=model` for a piece that was in the model).
 */
export function releaseAction(held: Pick<HeldPiece, 'id' | 'source'>, ev: HeldEval): ReleaseAction {
  if (!ev.overModel || ev.result.status === 'outside' || ev.result.roomId === null) {
    return { kind: 'return', from: held.source };
  }
  if (held.source === 'menu') {
    return { kind: 'place', pose: ev.pose, roomId: ev.result.roomId, status: ev.status };
  }
  return { kind: 'move', id: held.id, pose: ev.pose, roomId: ev.result.roomId, status: ev.status };
}

/** The reasons of the preview as a plain list (`['outside-house']` outside, `[]` when valid). */
export function reasonsOf(ev: HeldEval): Reason[] {
  return ev.result.reasons;
}

/** `furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=1.13 rot=0 status=valid` (D21). */
export function formatPlacedLine(id: string, roomId: string, pose: Pose, status: 'valid' | 'invalid'): string {
  return `furniture placed ${id} room=${roomId} x=${pose.x.toFixed(2)} z=${pose.z.toFixed(2)} rot=${pose.rotationDeg} status=${status}`;
}
