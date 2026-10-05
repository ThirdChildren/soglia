import { describe, expect, it } from 'vitest';
import {
  CLAIM_PRIORITY,
  createClaims,
  type ClaimOwner,
  type RevokeReason,
} from '../../src/logic/pinch-claims';

const OWNERS: ClaimOwner[] = ['menu', 'furniture', 'two-hands', 'pan', 'room'];

describe('pinch claims: priority', () => {
  it('orders the owners menu > furniture > two-hands > pan > room', () => {
    const ordered = [...OWNERS].sort((a, b) => CLAIM_PRIORITY[b] - CLAIM_PRIORITY[a]);
    expect(ordered).toEqual(['menu', 'furniture', 'two-hands', 'pan', 'room']);
  });

  it('a free hand is granted to anyone', () => {
    for (const owner of OWNERS) {
      const claims = createClaims();
      expect(claims.claim('left', owner)).toBe(true);
      expect(claims.ownerOf('left')).toBe(owner);
      expect(claims.ownerOf('right')).toBeNull();
    }
  });

  it('a higher priority owner takes the hand, a lower or equal one is refused (all pairs)', () => {
    // two-hands and pan are skipped against furniture: that rule has its own test.
    for (const first of OWNERS) {
      for (const second of OWNERS) {
        if (first === second) continue;
        const claims = createClaims();
        expect(claims.claim('right', first)).toBe(true);
        const granted = claims.claim('right', second);
        expect(granted).toBe(CLAIM_PRIORITY[second] > CLAIM_PRIORITY[first]);
        expect(claims.ownerOf('right')).toBe(granted ? second : first);
      }
    }
  });

  it('claiming twice by the same owner is fine', () => {
    const claims = createClaims();
    expect(claims.claim('left', 'furniture')).toBe(true);
    expect(claims.claim('left', 'furniture')).toBe(true);
    expect(claims.ownerOf('left')).toBe('furniture');
  });

  it('the two hands are independent', () => {
    const claims = createClaims();
    claims.claim('left', 'menu');
    expect(claims.claim('right', 'room')).toBe(true);
    expect(claims.ownerOf('left')).toBe('menu');
    expect(claims.ownerOf('right')).toBe('room');
  });
});

describe('pinch claims: release', () => {
  it('releases a hand held by the owner', () => {
    const claims = createClaims();
    claims.claim('left', 'pan');
    claims.release('left', 'pan');
    expect(claims.ownerOf('left')).toBeNull();
    expect(claims.anyClaimed()).toBe(false);
  });

  it('ignores a release by the wrong owner', () => {
    const claims = createClaims();
    claims.claim('left', 'furniture');
    claims.release('left', 'room');
    claims.release('left', 'menu');
    expect(claims.ownerOf('left')).toBe('furniture');
  });

  it('ignores a release of a free hand', () => {
    const claims = createClaims();
    expect(() => claims.release('right', 'menu')).not.toThrow();
    expect(claims.ownerOf('right')).toBeNull();
  });

  it('lets a lower owner in after a release', () => {
    const claims = createClaims();
    claims.claim('left', 'menu');
    expect(claims.claim('left', 'room')).toBe(false);
    claims.release('left', 'menu');
    expect(claims.claim('left', 'room')).toBe(true);
  });
});

describe('pinch claims: anyClaimed', () => {
  it('reports any owner, or one owner on any hand', () => {
    const claims = createClaims();
    expect(claims.anyClaimed()).toBe(false);
    claims.claim('right', 'furniture');
    expect(claims.anyClaimed()).toBe(true);
    expect(claims.anyClaimed('furniture')).toBe(true);
    expect(claims.anyClaimed('menu')).toBe(false);
    claims.claim('left', 'menu');
    expect(claims.anyClaimed('menu')).toBe(true);
  });
});

describe('pinch claims: session end', () => {
  it('frees every hand and tells the owners', () => {
    const claims = createClaims();
    const lost: string[] = [];
    claims.onRevoked('furniture', (hand, reason) => lost.push(`furniture:${hand}:${reason}`));
    claims.onRevoked('room', (hand, reason) => lost.push(`room:${hand}:${reason}`));
    claims.claim('left', 'furniture');
    claims.claim('right', 'room');
    claims.endSession();
    expect(claims.anyClaimed()).toBe(false);
    expect(lost.sort()).toEqual(['furniture:left:session-end', 'room:right:session-end']);
  });

  it('is a no-op when nothing is claimed, and the hands can be claimed again', () => {
    const claims = createClaims();
    expect(() => claims.endSession()).not.toThrow();
    expect(claims.claim('left', 'pan')).toBe(true);
  });
});

describe('pinch claims: pan promotion to two-hands', () => {
  it('two-hands takes the hand that had the pan, and the pan owner is told', () => {
    const claims = createClaims();
    const events: Array<[string, RevokeReason, ClaimOwner | null]> = [];
    claims.onRevoked('pan', (hand, reason, by) => events.push([hand, reason, by]));
    expect(claims.claim('right', 'pan')).toBe(true);
    // The other hand pinches: two-hands claims both hands.
    expect(claims.claimBoth('two-hands')).toBe(true);
    expect(claims.ownerOf('left')).toBe('two-hands');
    expect(claims.ownerOf('right')).toBe('two-hands');
    expect(events).toEqual([['right', 'taken', 'two-hands']]);
  });

  it('does not tell an owner that released by itself', () => {
    const claims = createClaims();
    let calls = 0;
    claims.onRevoked('pan', () => calls++);
    claims.claim('right', 'pan');
    claims.release('right', 'pan');
    expect(calls).toBe(0);
  });

  it('unsubscribes the listener', () => {
    const claims = createClaims();
    let calls = 0;
    const off = claims.onRevoked('pan', () => calls++);
    off();
    claims.claim('right', 'pan');
    claims.claim('right', 'menu');
    expect(calls).toBe(0);
  });
});

describe('pinch claims: a held piece blocks gestures', () => {
  it('refuses a pan while a piece is held, on either hand', () => {
    const claims = createClaims();
    claims.claim('right', 'furniture');
    expect(claims.claim('left', 'pan')).toBe(false);
    expect(claims.claim('right', 'pan')).toBe(false);
    expect(claims.ownerOf('left')).toBeNull();
  });

  it('refuses two-hands while a piece is held and leaves everything as it was', () => {
    const claims = createClaims();
    claims.claim('right', 'furniture');
    expect(claims.claimBoth('two-hands')).toBe(false);
    expect(claims.ownerOf('left')).toBeNull();
    expect(claims.ownerOf('right')).toBe('furniture');
  });

  it('still lets the menu and the room rules apply to the free hand', () => {
    const claims = createClaims();
    claims.claim('right', 'furniture');
    expect(claims.claim('left', 'menu')).toBe(true);
    claims.release('left', 'menu');
    expect(claims.claim('left', 'room')).toBe(true);
  });

  it('allows a pan again after the piece is released', () => {
    const claims = createClaims();
    claims.claim('right', 'furniture');
    claims.release('right', 'furniture');
    expect(claims.claim('left', 'pan')).toBe(true);
  });

  it('a piece takes over a hand that was panning', () => {
    const claims = createClaims();
    claims.claim('right', 'pan');
    expect(claims.claim('right', 'furniture')).toBe(true);
    expect(claims.ownerOf('right')).toBe('furniture');
  });
});

describe('pinch claims: claimBoth', () => {
  it('is all or nothing', () => {
    const claims = createClaims();
    claims.claim('left', 'menu');
    expect(claims.claimBoth('two-hands')).toBe(false);
    expect(claims.ownerOf('left')).toBe('menu');
    expect(claims.ownerOf('right')).toBeNull();
  });

  it('succeeds when both hands are free', () => {
    const claims = createClaims();
    expect(claims.claimBoth('two-hands')).toBe(true);
    expect(claims.anyClaimed('two-hands')).toBe(true);
  });
});
