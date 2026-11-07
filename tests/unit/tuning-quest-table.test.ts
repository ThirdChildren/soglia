// The copy of the names and limits in `scripts/quest/lib.mjs` (used by `npm run quest:tune`) against the registry of the app
// (task T6.A1): the script cannot import TypeScript without a build, so a test keeps the two tables from drifting.
import { describe, expect, it } from 'vitest';
import { TUNING_LIMITS } from '../../scripts/quest/lib.mjs';
import { TUNING_NAMES, TUNING_TABLE } from '../../src/logic/tuning';

describe('quest:tune table against src/logic/tuning.ts', () => {
  it('has the same names in the same order', () => {
    expect(Object.keys(TUNING_LIMITS)).toEqual([...TUNING_NAMES]);
  });

  for (const entry of TUNING_TABLE) {
    it(`${entry.name} has the same limits`, () => {
      const limits = (TUNING_LIMITS as Record<string, readonly number[]>)[entry.name];
      expect(limits).toEqual([entry.min, entry.max]);
    });
  }
});
