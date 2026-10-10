import { describe, expect, it } from 'vitest';
import { roomSelectionAllowed, type RoomSelectionInputs } from '../../src/logic/menu-button';
import { CLAIM_PRIORITY, createClaims, type ClaimHand, type ClaimOwner, type RevokeReason } from '../../src/logic/pinch-claims';

const OWNERS: readonly ClaimOwner[] = ['menu', 'furniture', 'viewpoint', 'two-hands', 'pan', 'room'];
const HANDS: readonly ClaimHand[] = ['left', 'right'];
const otherHand = (h: ClaimHand): ClaimHand => (h === 'left' ? 'right' : 'left');

/**
 * Written by hand, not derived from CLAIM_PRIORITY. Row = owner that holds the hand, column = owner that claims the
 * SAME hand (order: menu, furniture, viewpoint, two-hands, pan, room). True = the claim is granted: a free pass for the
 * same owner and for any higher priority owner (menu > furniture > viewpoint > two-hands > pan > room).
 */
const SAME_HAND: Readonly<Record<ClaimOwner, readonly boolean[]>> = {
  menu: [true, false, false, false, false, false],
  furniture: [true, true, false, false, false, false],
  viewpoint: [true, true, true, false, false, false],
  'two-hands': [true, true, true, true, false, false],
  pan: [true, true, true, true, true, false],
  room: [true, true, true, true, true, true],
};

/**
 * Row = owner that holds one hand, column = owner that claims the OTHER (free) hand. Only a held piece blocks, and only
 * viewpoint, two-hands and pan: the second pinch is the tap that rotates the piece.
 */
const OTHER_HAND: Readonly<Record<ClaimOwner, readonly boolean[]>> = {
  menu: [true, true, true, true, true, true],
  furniture: [true, true, false, false, false, true],
  viewpoint: [true, true, true, true, true, true],
  'two-hands': [true, true, true, true, true, true],
  pan: [true, true, true, true, true, true],
  room: [true, true, true, true, true, true],
};

describe('pinch claims: the table of the six owners (hand-written)', () => {
  it('the priorities are 6 5 4 3 2 1', () => {
    expect(OWNERS.map((o) => CLAIM_PRIORITY[o])).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('the hand-written table is the one the priorities give (the table itself is consistent)', () => {
    for (const holder of OWNERS) {
      OWNERS.forEach((claimant, c) => {
        expect(SAME_HAND[holder][c], `${holder} vs ${claimant}`).toBe(CLAIM_PRIORITY[claimant] >= CLAIM_PRIORITY[holder]);
      });
    }
  });

  it.each(HANDS)('same %s hand: every holder against every claimant', (hand) => {
    for (const holder of OWNERS) {
      OWNERS.forEach((claimant, c) => {
        const claims = createClaims();
        expect(claims.claim(hand, holder)).toBe(true);
        const granted = claims.claim(hand, claimant);
        expect(granted, `${holder} holds, ${claimant} claims`).toBe(SAME_HAND[holder][c]);
        expect(claims.ownerOf(hand)).toBe(granted ? claimant : holder);
        expect(claims.ownerOf(otherHand(hand))).toBeNull();
      });
    }
  });

  it.each(HANDS)('the other hand: %s holds, the opposite hand is claimed by every owner', (held) => {
    for (const holder of OWNERS) {
      OWNERS.forEach((claimant, c) => {
        const claims = createClaims();
        claims.claim(held, holder);
        const granted = claims.claim(otherHand(held), claimant);
        expect(granted, `${holder} holds ${held}, ${claimant} claims the other`).toBe(OTHER_HAND[holder][c]);
        expect(claims.ownerOf(held)).toBe(holder);
        expect(claims.ownerOf(otherHand(held))).toBe(granted ? claimant : null);
      });
    }
  });

  it('the loser is told once with reason taken and the winner as the author; nobody is told on a refusal', () => {
    for (const hand of HANDS) {
      for (const holder of OWNERS) {
        OWNERS.forEach((claimant, c) => {
          if (holder === claimant) return;
          const claims = createClaims();
          const told: Array<[ClaimHand, RevokeReason, ClaimOwner | null]> = [];
          const toldOthers: string[] = [];
          for (const o of OWNERS) {
            if (o === holder) claims.onRevoked(o, (h, reason, by) => told.push([h, reason, by]));
            else claims.onRevoked(o, () => toldOthers.push(o));
          }
          claims.claim(hand, holder);
          const granted = claims.claim(hand, claimant);
          expect(granted).toBe(SAME_HAND[holder][c]);
          expect(told, `${holder} -> ${claimant}`).toEqual(granted ? [[hand, 'taken', claimant]] : []);
          expect(toldOthers).toEqual([]);
        });
      }
    }
  });
});

describe('pinch claims: a held piece blocks viewpoint, two-hands and pan on either hand', () => {
  const BLOCKED: readonly ClaimOwner[] = ['viewpoint', 'two-hands', 'pan'];

  it.each(HANDS)('piece in the %s hand: blocked owners are refused on both hands and nothing changes', (pieceHand) => {
    for (const owner of BLOCKED) {
      const claims = createClaims();
      claims.claim(pieceHand, 'furniture');
      for (const hand of HANDS) expect(claims.claim(hand, owner), `${owner} on ${hand}`).toBe(false);
      expect(claims.claimBoth(owner), `${owner} both`).toBe(false);
      expect(claims.ownerOf(pieceHand)).toBe('furniture');
      expect(claims.ownerOf(otherHand(pieceHand))).toBeNull();
    }
  });

  it.each(HANDS)('piece in the %s hand: menu, furniture and room are still allowed on the other hand', (pieceHand) => {
    for (const owner of ['menu', 'furniture', 'room'] as const) {
      const claims = createClaims();
      claims.claim(pieceHand, 'furniture');
      expect(claims.claim(otherHand(pieceHand), owner)).toBe(true);
    }
  });

  it('viewpoint is granted again as soon as the piece is released, from either hand', () => {
    for (const pieceHand of HANDS) {
      for (const viewHand of HANDS) {
        const claims = createClaims();
        claims.claim(pieceHand, 'furniture');
        expect(claims.claim(viewHand, 'viewpoint')).toBe(false);
        claims.release(pieceHand, 'furniture');
        expect(claims.claim(viewHand, 'viewpoint')).toBe(true);
        expect(claims.ownerOf(viewHand)).toBe('viewpoint');
      }
    }
  });

  it('a release of the piece by another owner does not unblock the viewpoint', () => {
    const claims = createClaims();
    claims.claim('right', 'furniture');
    claims.release('right', 'viewpoint');
    claims.release('right', 'room');
    claims.release('left', 'furniture');
    expect(claims.claim('left', 'viewpoint')).toBe(false);
  });

  it('a viewpoint that was already held keeps its hand when a piece is taken in the other hand', () => {
    const claims = createClaims();
    expect(claims.claim('left', 'viewpoint')).toBe(true);
    expect(claims.claim('right', 'furniture')).toBe(true);
    expect(claims.ownerOf('left')).toBe('viewpoint');
    expect(claims.ownerOf('right')).toBe('furniture');
  });
});

describe('pinch claims: claimBoth for every owner against every holder of one hand', () => {
  it.each(HANDS)('holder on the %s hand, the other free', (held) => {
    for (const holder of OWNERS) {
      OWNERS.forEach((owner, c) => {
        const claims = createClaims();
        claims.claim(held, holder);
        const granted = claims.claimBoth(owner);
        // Both hands: the held one follows the same-hand table, the free one the other-hand table.
        const expected = SAME_HAND[holder][c] && OTHER_HAND[holder][c];
        expect(granted, `${holder} holds ${held}, ${owner} claims both`).toBe(expected);
        if (granted) {
          expect(claims.ownerOf('left')).toBe(owner);
          expect(claims.ownerOf('right')).toBe(owner);
        } else {
          // All or nothing: the holder keeps its hand and the free hand stays free.
          expect(claims.ownerOf(held)).toBe(holder);
          expect(claims.ownerOf(otherHand(held))).toBeNull();
        }
      });
    }
  });

  it('on free hands every owner gets both', () => {
    for (const owner of OWNERS) {
      const claims = createClaims();
      expect(claims.claimBoth(owner)).toBe(true);
      expect(claims.anyClaimed(owner)).toBe(true);
    }
  });

  it('viewpoint can take both hands from pan or room, two-hands cannot take them from viewpoint', () => {
    for (const lower of ['pan', 'room'] as const) {
      const claims = createClaims();
      claims.claim('left', lower);
      claims.claim('right', lower);
      expect(claims.claimBoth('viewpoint')).toBe(true);
    }
    const claims = createClaims();
    claims.claimBoth('viewpoint');
    expect(claims.claimBoth('two-hands')).toBe(false);
    expect(claims.ownerOf('left')).toBe('viewpoint');
    expect(claims.ownerOf('right')).toBe('viewpoint');
  });
});

describe('pinch claims: release and resume', () => {
  it('a viewpoint taken by furniture is not released by furniture and is free to claim again after it', () => {
    const claims = createClaims();
    const told: string[] = [];
    claims.onRevoked('viewpoint', (hand, reason, by) => told.push(`${hand}:${reason}:${by}`));
    claims.claim('left', 'viewpoint');
    expect(claims.claim('left', 'furniture')).toBe(true);
    expect(told).toEqual(['left:taken:furniture']);
    // The old owner releasing a hand it lost is ignored: the piece keeps it.
    claims.release('left', 'viewpoint');
    expect(claims.ownerOf('left')).toBe('furniture');
    claims.release('left', 'furniture');
    expect(claims.ownerOf('left')).toBeNull();
    expect(claims.claim('left', 'viewpoint')).toBe(true);
    expect(told).toEqual(['left:taken:furniture']);
  });

  it('a menu that takes the viewpoint hand leaves it to the menu until the menu releases it', () => {
    const claims = createClaims();
    claims.claim('right', 'viewpoint');
    expect(claims.claim('right', 'menu')).toBe(true);
    expect(claims.claim('right', 'viewpoint')).toBe(false);
    claims.release('right', 'menu');
    expect(claims.claim('right', 'viewpoint')).toBe(true);
  });

  it('own release is silent and frees the hand for every owner', () => {
    for (const owner of OWNERS) {
      const claims = createClaims();
      let told = 0;
      claims.onRevoked(owner, () => (told += 1));
      claims.claim('left', owner);
      claims.release('left', owner);
      expect(told).toBe(0);
      expect(claims.anyClaimed()).toBe(false);
      expect(claims.claim('left', 'room')).toBe(true);
    }
  });
});

describe('pinch claims: endSession frees everything', () => {
  it('for every pair of owners on the two hands, both are freed, told once with session-end and no author', () => {
    for (const left of OWNERS) {
      for (const right of OWNERS) {
        const claims = createClaims();
        const events: string[] = [];
        for (const o of OWNERS) claims.onRevoked(o, (hand, reason, by) => events.push(`${o}:${hand}:${reason}:${by}`));
        expect(claims.claim('left', left)).toBe(true);
        const rightGranted = claims.claim('right', right);
        const heldRight = claims.ownerOf('right');
        expect(heldRight).toBe(rightGranted ? right : null);
        const before = events.length; // revokes caused by the claims themselves are not the ones of the session end
        claims.endSession();
        expect(claims.ownerOf('left')).toBeNull();
        expect(claims.ownerOf('right')).toBeNull();
        expect(claims.anyClaimed()).toBe(false);
        for (const o of OWNERS) expect(claims.anyClaimed(o)).toBe(false);
        const ended = events.slice(before).sort();
        const expected = [`${left}:left:session-end:null`, ...(heldRight === null ? [] : [`${heldRight}:right:session-end:null`])].sort();
        expect(ended, `${left} + ${right}`).toEqual(expected);
        // A second end is silent, and the hands can be claimed again by everybody.
        claims.endSession();
        expect(events.slice(before)).toHaveLength(expected.length);
        for (const o of OWNERS) {
          expect(claims.claim('left', o)).toBe(true);
          claims.release('left', o);
        }
      }
    }
  });

  it('after the end a held piece no longer blocks the viewpoint', () => {
    const claims = createClaims();
    claims.claim('left', 'furniture');
    expect(claims.claim('right', 'viewpoint')).toBe(false);
    claims.endSession();
    expect(claims.claim('right', 'viewpoint')).toBe(true);
  });

  it('a listener removed before the end is not called', () => {
    const claims = createClaims();
    let calls = 0;
    const off = claims.onRevoked('viewpoint', () => (calls += 1));
    claims.claim('left', 'viewpoint');
    off();
    claims.endSession();
    expect(calls).toBe(0);
  });
});

describe('roomSelectionAllowed with viewpointActive: the 2^5 table', () => {
  const KEYS = ['gestureActive', 'furnitureInteraction', 'panActive', 'menuHandPinching', 'viewpointActive'] as const;
  const fromMask = (mask: number): RoomSelectionInputs => ({
    gestureActive: (mask & 1) !== 0,
    furnitureInteraction: (mask & 2) !== 0,
    panActive: (mask & 4) !== 0,
    menuHandPinching: (mask & 8) !== 0,
    viewpointActive: (mask & 16) !== 0,
  });
  const MASKS = Array.from({ length: 32 }, (_, i) => i);

  it('exactly one of the 32 combinations allows the selection: all five blocks off', () => {
    const allowed = MASKS.filter((m) => roomSelectionAllowed(fromMask(m)));
    expect(allowed).toEqual([0]);
  });

  it.each(MASKS)('mask %i is allowed only when it is 0', (mask) => {
    expect(roomSelectionAllowed(fromMask(mask))).toBe(mask === 0);
  });

  it('each single block alone forbids it, the viewpoint one included', () => {
    const free: RoomSelectionInputs = { gestureActive: false, furnitureInteraction: false, panActive: false, menuHandPinching: false, viewpointActive: false };
    expect(roomSelectionAllowed(free)).toBe(true);
    for (const key of KEYS) expect(roomSelectionAllowed({ ...free, [key]: true }), key).toBe(false);
  });

  it('an absent viewpointActive is the same as false for the 16 old combinations', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const { viewpointActive: _drop, ...old } = fromMask(mask);
      void _drop;
      expect(roomSelectionAllowed(old), `mask ${mask}`).toBe(roomSelectionAllowed({ ...old, viewpointActive: false }));
    }
  });

  it('an explicit undefined viewpointActive is the same as absent', () => {
    const free: RoomSelectionInputs = { gestureActive: false, furnitureInteraction: false, panActive: false, menuHandPinching: false };
    expect(roomSelectionAllowed({ ...free, viewpointActive: undefined })).toBe(true);
  });

  it('is monotonic: adding a block never turns a forbidden selection into an allowed one', () => {
    for (const a of MASKS) {
      for (const b of MASKS) {
        if ((a & b) !== a) continue;
        if (roomSelectionAllowed(fromMask(b))) expect(roomSelectionAllowed(fromMask(a)), `${a} -> ${b}`).toBe(true);
      }
    }
  });
});
