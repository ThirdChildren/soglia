import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FONT_PRELOAD_TIMEOUT_MS, preloadFonts, type FontLoader } from '../../src/logic/font-preload';
import { repoPath } from '../helpers/load-json';

// M5 gate finding F-D-1: the panel font atlases must be in UIKit's font cache before a panel is built, so that a text written right
// after the font is handed over is never laid out with the bundled ASCII font ("Missing glyph info for character ×").

const A = 'fonts/inter-regular.json';
const B = 'fonts/inter-bold.json';

describe('preloadFonts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves at once, with both atlases loaded, when the cache already has them (the callback runs inside load)', async () => {
    const load: FontLoader = (_url, onLoad) => onLoad();
    await expect(preloadFonts([A, B], load)).resolves.toEqual({ loaded: [A, B], missing: [] });
  });

  it('waits for the slowest atlas, whatever the order they arrive in', async () => {
    const pending = new Map<string, () => void>();
    const load: FontLoader = (url, onLoad) => void pending.set(url, onLoad);
    let result: unknown = null;
    void preloadFonts([A, B], load).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(100);
    expect(result).toBeNull();
    pending.get(B)!();
    await vi.advanceTimersByTimeAsync(100);
    expect(result).toBeNull();
    pending.get(A)!();
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual({ loaded: [A, B], missing: [] });
  });

  it('goes on after the limit with the atlas that did not come listed as missing', async () => {
    const load: FontLoader = (url, onLoad) => {
      if (url === A) onLoad();
    };
    let result: unknown = null;
    void preloadFonts([A, B], load).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(FONT_PRELOAD_TIMEOUT_MS - 1);
    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual({ loaded: [A], missing: [B] });
  });

  it('never waits for more than the limit given, and ignores a callback that comes after the end', async () => {
    let late: () => void = () => {};
    const load: FontLoader = (_url, onLoad) => {
      late = onLoad;
    };
    let result: { loaded: string[]; missing: string[] } | null = null;
    void preloadFonts([A], load, 250).then((r) => (result = r as typeof result));
    await vi.advanceTimersByTimeAsync(250);
    expect(result).toEqual({ loaded: [], missing: [A] });
    late();
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual({ loaded: [], missing: [A] });
  });

  it('does not wait for an atlas whose loader threw, and does not reject', async () => {
    const load: FontLoader = (url, onLoad) => {
      if (url === B) throw new Error('no parent');
      onLoad();
    };
    const result = await preloadFonts([A, B], load);
    expect(result).toEqual({ loaded: [A], missing: [B] });
  });

  it('resolves at once when every loader throws', async () => {
    const load: FontLoader = () => {
      throw new Error('boom');
    };
    await expect(preloadFonts([A, B], load)).resolves.toEqual({ loaded: [], missing: [A, B] });
  });

  it('answers an empty list at once, and counts a repeated url once', async () => {
    const never: FontLoader = () => {};
    await expect(preloadFonts([], never)).resolves.toEqual({ loaded: [], missing: [] });
    const load: FontLoader = (_url, onLoad) => onLoad();
    await expect(preloadFonts([A, A], load)).resolves.toEqual({ loaded: [A, A], missing: [] });
  });

  it('asks for each atlas exactly once', async () => {
    const load = vi.fn<FontLoader>((_url, onLoad) => onLoad());
    await preloadFonts([A, B], load);
    expect(load.mock.calls.map((c) => c[0])).toEqual([A, B]);
  });

  it('has a limit of about a second and a half: a slow device still starts quickly (review warning 7)', () => {
    expect(FONT_PRELOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    expect(FONT_PRELOAD_TIMEOUT_MS).toBeLessThanOrEqual(2000);
  });
});

describe('the start-up order of the panel font (src/ui/fonts.ts)', () => {
  const source = readFileSync(repoPath('src/ui/fonts.ts'), 'utf8');

  it('loads the atlases into UIKit before it hands the family to any panel', () => {
    const body = source.slice(source.indexOf('export async function loadPanelFonts'));
    const preload = body.indexOf('await preloadFonts(');
    const assign = body.indexOf('fontFamilies = { [PANEL_FONT_FAMILY]');
    expect(preload).toBeGreaterThan(0);
    expect(assign).toBeGreaterThan(preload);
  });

  it('does not import the UIKit font cache by its file (that entry breaks the order UIKit evaluates its modules in)', () => {
    expect(source).not.toMatch(/@pmndrs\/uikit\/dist\/text/);
  });

  it('disposes the probe texts it made', () => {
    expect(source).toMatch(/probe\.dispose\(\)/);
  });
});

describe('the start-up of the app (src/index.ts, review warning 7)', () => {
  const index = readFileSync(repoPath('src/index.ts'), 'utf8');
  const fonts = readFileSync(repoPath('src/ui/fonts.ts'), 'utf8');

  it('does not wait for the fonts before it asks for the house and the catalog: they load at the same time', () => {
    expect(index).not.toMatch(/await loadPanelFonts\(\)/);
    const started = index.indexOf('const fontsReady = loadPanelFonts()');
    const house = index.indexOf('loadHouse(params.house)');
    expect(started).toBeGreaterThan(0);
    expect(house).toBeGreaterThan(started);
  });

  it('still waits for the fonts before any panel is built (the glyph test and the house are built after the wait)', () => {
    const wait = index.indexOf('await Promise.all([loadHouse(params.house), catalogLoad, myLoad, fontsReady])');
    expect(wait).toBeGreaterThan(0);
    expect(index.indexOf('showGlyphTest(world)')).toBeGreaterThan(wait);
    expect(index.indexOf('createPalmMenu(', wait)).toBeGreaterThan(wait);
  });

  it('checks the two weights at the same time', () => {
    expect(fonts).toMatch(/Promise\.all\(WEIGHTS\.map/);
  });
});

