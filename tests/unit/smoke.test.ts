import { describe, expect, it } from 'vitest';

describe('smoke', () => {
  it('runs Vitest without the IWSDK dev plugin', () => {
    expect(1 + 1).toBe(2);
  });
});
