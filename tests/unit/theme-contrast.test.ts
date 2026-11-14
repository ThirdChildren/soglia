import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HIGH_CONTRAST_PIN_SCALE,
  contrastRatio,
  floorColor,
  getPalette,
  getUiColors,
  highContrastPalette,
  highContrastUiColors,
  isHighContrast,
  isLargeText,
  luminance,
  notifyAccessChange,
  onAccessChange,
  palette,
  setAccessibility,
  themedColor,
  uiColors,
  type UiColors,
} from '../../src/ui/theme';
import { repoPath } from '../helpers/load-json';

afterEach(() => setAccessibility({ contrast: false, largeText: false }));

/** WCAG 2.x: 7:1 is the AAA level for normal text; 4.5:1 is the AA level; 3:1 is the level for borders and graphics. */
const AAA = 7;
const AA = 4.5;
const GRAPHICS = 3;

const textPairs = (c: UiColors): [string, string, string][] => [
  ['ink on surface', c.ink, c.surface],
  ['soft ink on surface', c.inkSoft, c.surface],
  ['selected text on selected background', c.activeInk, c.active],
];

describe('the contrast ratio', () => {
  it('is 21 for black on white, 1 for equal colours and does not depend on the order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
    expect(contrastRatio('#3a3f47', '#3a3f47')).toBeCloseTo(1, 9);
    expect(contrastRatio(0xffffff, '#000000')).toBeCloseTo(21, 6);
  });
  it('matches the known value for a mid grey (#767676 on white is 4.54:1)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
  it('has the luminance of the primaries of sRGB', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 9);
    expect(luminance('#ff0000')).toBeCloseTo(0.2126, 4);
    expect(luminance('#00ff00')).toBeCloseTo(0.7152, 4);
    expect(luminance('#0000ff')).toBeCloseTo(0.0722, 4);
  });
});

describe('the pairs of text and background of the panels', () => {
  it('are at least 4.5:1 in the normal set', () => {
    for (const [name, text, background] of textPairs(uiColors)) expect(contrastRatio(text, background), name).toBeGreaterThanOrEqual(AA);
  });
  it('are at least 7:1 in the high-contrast set (D58)', () => {
    for (const [name, text, background] of textPairs(highContrastUiColors)) {
      expect(contrastRatio(text, background), name).toBeGreaterThanOrEqual(AAA);
    }
  });
  it('have a border and a selected background that stand out from the surface (3:1 normal, 7:1 high)', () => {
    expect(contrastRatio(uiColors.border, uiColors.surface)).toBeGreaterThanOrEqual(GRAPHICS);
    expect(contrastRatio(uiColors.active, uiColors.surface)).toBeGreaterThanOrEqual(GRAPHICS);
    expect(contrastRatio(highContrastUiColors.border, highContrastUiColors.surface)).toBeGreaterThanOrEqual(AAA);
    expect(contrastRatio(highContrastUiColors.active, highContrastUiColors.surface)).toBeGreaterThanOrEqual(AAA);
  });
  it('the high-contrast set is the one in the spec: black, white, yellow', () => {
    expect(highContrastUiColors).toMatchObject({ surface: '#000000', ink: '#ffffff', border: '#ffd400' });
  });
});

describe('every colour of the UIKitML files', () => {
  const dir = repoPath('public/ui');
  const files = readdirSync(dir).filter((f) => f.endsWith('.uikitml'));
  const textColors = (source: string): string[] => [...source.matchAll(/[; "]color:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase());
  it('finds the files', () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
  });
  it.each(files)('%s: text is 4.5:1 on white as it is and 7:1 on black once themed', (file) => {
    const colors = textColors(readFileSync(`${dir}/${file}`, 'utf8'));
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) {
      setAccessibility({ contrast: false, largeText: false });
      expect(themedColor('color', c)).toBe(c);
      expect(contrastRatio(c, '#ffffff'), `${file} ${c} normal`).toBeGreaterThanOrEqual(AA);
      setAccessibility({ contrast: true, largeText: false });
      expect(contrastRatio(themedColor('color', c), highContrastUiColors.surface), `${file} ${c} high`).toBeGreaterThanOrEqual(AAA);
    }
  });
  it('the white surface turns black and the dark border turns yellow; nothing else that is not text changes', () => {
    setAccessibility({ contrast: true, largeText: false });
    expect(themedColor('backgroundColor', '#ffffff')).toBe('#000000');
    expect(themedColor('borderColor', '#1a1a1a')).toBe('#ffd400');
    // A status dot and the violet baseline keep their meaning.
    expect(themedColor('backgroundColor', '#9b59d0')).toBe('#9b59d0');
    expect(themedColor('backgroundColor', '#8a8f98')).toBe('#8a8f98');
    setAccessibility({ contrast: false, largeText: false });
    expect(themedColor('backgroundColor', '#ffffff')).toBe('#ffffff');
  });
});

describe('the model in high contrast (D58)', () => {
  it('has pure white walls, darker floors, a lighter threshold and the same other colours', () => {
    expect(highContrastPalette.wall).toBe(0xffffff);
    for (const key of Object.keys(palette.floor) as (keyof typeof palette.floor)[]) {
      expect(luminance(highContrastPalette.floor[key]), key).toBeLessThan(luminance(palette.floor[key]));
    }
    expect(luminance(highContrastPalette.door)).toBeGreaterThan(luminance(palette.door));
    expect(highContrastPalette.outlineValid).toBe(palette.outlineValid);
    expect(highContrastPalette.outlineInvalid).toBe(palette.outlineInvalid);
  });
  it('keeps the wall at 7:1 against every floor (and at least 2:1 in the normal set)', () => {
    for (const key of Object.keys(palette.floor) as (keyof typeof palette.floor)[]) {
      expect(contrastRatio(highContrastPalette.wall, highContrastPalette.floor[key]), `high ${key}`).toBeGreaterThanOrEqual(AAA);
      expect(contrastRatio(palette.wall, palette.floor[key]), `normal ${key}`).toBeGreaterThanOrEqual(2);
    }
  });
  it('the doorstep is lighter than before and stands out from every floor (4.5:1, more than the 3:1 a graphic needs)', () => {
    for (const key of Object.keys(palette.floor) as (keyof typeof palette.floor)[]) {
      expect(contrastRatio(highContrastPalette.door, highContrastPalette.floor[key]), `high ${key}`).toBeGreaterThanOrEqual(AA);
    }
  });
  it('makes the pin head 30 % bigger', () => {
    expect(HIGH_CONTRAST_PIN_SCALE).toBeCloseTo(1.3, 9);
  });
});

describe('what the getters answer', () => {
  it('is the normal set until the preference is on, and the high set while it is', () => {
    expect(isHighContrast()).toBe(false);
    expect(getPalette()).toBe(palette);
    expect(getUiColors()).toBe(uiColors);
    expect(setAccessibility({ contrast: true, largeText: false })).toBe(true);
    expect(isHighContrast()).toBe(true);
    expect(getPalette()).toBe(highContrastPalette);
    expect(getUiColors()).toBe(highContrastUiColors);
    expect(floorColor('wood')).toBe(highContrastPalette.floor.wood);
    expect(floorColor(undefined)).toBe(highContrastPalette.floor.concrete);
  });
  it('says whether anything changed, and keeps the two preferences apart', () => {
    expect(setAccessibility({ contrast: false, largeText: false })).toBe(false);
    expect(setAccessibility({ contrast: false, largeText: true })).toBe(true);
    expect(isLargeText()).toBe(true);
    expect(isHighContrast()).toBe(false);
    expect(setAccessibility({ contrast: false, largeText: true })).toBe(false);
  });
  it('calls the listeners with a sum, and not any more once removed', () => {
    const off1 = onAccessChange(() => 2);
    const off2 = onAccessChange(() => 3);
    expect(notifyAccessChange()).toBe(5);
    off1();
    expect(notifyAccessChange()).toBe(3);
    off2();
    expect(notifyAccessChange()).toBe(0);
  });
});
