// Arbitration of the pinches (task T2.10b, decisions D15 and D28). Pure logic: no imports from
// @iwsdk/core or three.
//
// A pinch of a hand can mean different things (pick a menu item, grab a piece, zoom the model with
// two hands, drag the model with one hand, select a room). Each meaning is an "owner". An owner
// claims a hand when it starts to use its pinch; only one owner holds a hand at a time. When two
// owners want the same hand the one with the higher priority wins:
//
//   menu > furniture > two-hands > pan > room
//
// A claim on a hand that is free, or held by a lower priority owner, succeeds (the previous owner
// is told that its claim was taken away). A claim on a hand held by an equal or higher priority
// owner is refused. Two more rules keep a held piece safe: a hand can never start `two-hands` or
// `pan` while a `furniture` claim exists on any hand (the second pinch is the tap that rotates the
// piece, not a new gesture).

export type ClaimHand = 'left' | 'right';
export type ClaimOwner = 'menu' | 'furniture' | 'two-hands' | 'pan' | 'room';

/** Higher number = higher priority. */
export const CLAIM_PRIORITY: Readonly<Record<ClaimOwner, number>> = {
  menu: 5,
  furniture: 4,
  'two-hands': 3,
  pan: 2,
  room: 1,
};

const HANDS: readonly ClaimHand[] = ['left', 'right'];

/** Why an owner lost a hand: a higher priority owner took it, or the session ended. */
export type RevokeReason = 'taken' | 'session-end';

export type RevokeListener = (hand: ClaimHand, reason: RevokeReason, by: ClaimOwner | null) => void;

export interface Claims {
  /**
   * Claims `hand` for `owner`. Returns true if the owner now holds it (also when it already did).
   * Refused when the hand is held by an owner of equal or higher priority, or, for `two-hands` and
   * `pan`, while a `furniture` claim exists on any hand.
   */
  claim(hand: ClaimHand, owner: ClaimOwner): boolean;
  /** Claims both hands for `owner` or none (nothing changes when one of them is refused). */
  claimBoth(owner: ClaimOwner): boolean;
  /** Releases `hand` if it is held by `owner`; a release by another owner is ignored. */
  release(hand: ClaimHand, owner: ClaimOwner): void;
  ownerOf(hand: ClaimHand): ClaimOwner | null;
  /** True if `owner` holds any hand, or, without an argument, if any hand is claimed. */
  anyClaimed(owner?: ClaimOwner): boolean;
  /** Frees every hand (the XR session ended). The owners are told with reason `session-end`. */
  endSession(): void;
  /** Calls `listener` when `owner` loses a hand it held (not on its own release). Returns the unsubscribe function. */
  onRevoked(owner: ClaimOwner, listener: RevokeListener): () => void;
}

export function createClaims(): Claims {
  const held: Record<ClaimHand, ClaimOwner | null> = { left: null, right: null };
  const listeners: Record<ClaimOwner, Set<RevokeListener>> = {
    menu: new Set(),
    furniture: new Set(),
    'two-hands': new Set(),
    pan: new Set(),
    room: new Set(),
  };

  const anyClaimed = (owner?: ClaimOwner): boolean => {
    if (owner === undefined) return held.left !== null || held.right !== null;
    return held.left === owner || held.right === owner;
  };

  const canClaim = (hand: ClaimHand, owner: ClaimOwner): boolean => {
    if ((owner === 'two-hands' || owner === 'pan') && anyClaimed('furniture')) return false;
    const current = held[hand];
    if (current === null || current === owner) return true;
    return CLAIM_PRIORITY[owner] > CLAIM_PRIORITY[current];
  };

  const revoke = (hand: ClaimHand, reason: RevokeReason, by: ClaimOwner | null): void => {
    const previous = held[hand];
    if (previous === null) return;
    held[hand] = null;
    for (const listener of listeners[previous]) listener(hand, reason, by);
  };

  const take = (hand: ClaimHand, owner: ClaimOwner): void => {
    if (held[hand] === owner) return;
    if (held[hand] !== null) revoke(hand, 'taken', owner);
    held[hand] = owner;
  };

  return {
    claim(hand, owner) {
      if (!canClaim(hand, owner)) return false;
      take(hand, owner);
      return true;
    },
    claimBoth(owner) {
      if (!canClaim('left', owner) || !canClaim('right', owner)) return false;
      for (const hand of HANDS) take(hand, owner);
      return true;
    },
    release(hand, owner) {
      if (held[hand] === owner) held[hand] = null;
    },
    ownerOf: (hand) => held[hand],
    anyClaimed,
    endSession() {
      for (const hand of HANDS) revoke(hand, 'session-end', null);
    },
    onRevoked(owner, listener) {
      listeners[owner].add(listener);
      return () => {
        listeners[owner].delete(listener);
      };
    },
  };
}
