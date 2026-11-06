// Accessibility preferences (M5, D58): high contrast and large text. Pure logic: the log lines the QA reads and the
// rule for which source set the value. The colours are in src/ui/theme.ts, the sizes in the layout models of the panels.
// No imports from @iwsdk/core or three.

/** Where a value came from: the URL (or the dev file), the saved state, or a press on the View panel. */
export type AccessSource = 'url' | 'saved' | 'ui';

/** Large text is 3.0 cm where the normal text is 2.4: the size of the text, and of the boxes that must hold it, grows by this (D58). */
export const LARGE_TEXT_FACTOR = 1.25;

/** Size of the text of the menu while the large text is on: the menu v2 keeps 2.4 cm (T5.16 is below the line, D58). */
export const MENU_TEXT_WITH_LARGE = 'normal';
/**
 * Size of the text of the Issues panel while the large text is on: it keeps 2.4 cm. Its six screens are packed to the millimetre
 * (rows, chips, wrapped notes) and need a layout of their own for 3.0 cm, which was cut from T5.13 (see docs/plans/M5.md, D53).
 */
export const ISSUES_TEXT_WITH_LARGE = 'normal';

/** `access contrast=on source=ui` */
export function formatAccessContrast(on: boolean, source: AccessSource): string {
  return `access contrast=${on ? 'on' : 'off'} source=${source}`;
}

/**
 * `access text=large source=ui menu=normal issues=normal` (`menu=` and `issues=` say whether those two panels follow: they do not
 * while T5.16 and the Issues layout are cut). Large text with `menu=normal` is not a failure: it is what is declared.
 */
export function formatAccessText(large: boolean, source: AccessSource): string {
  return `access text=${large ? 'large' : 'normal'} source=${source} menu=${MENU_TEXT_WITH_LARGE} issues=${ISSUES_TEXT_WITH_LARGE}`;
}

/** `access applied recolored=7`: the preference was applied to the panels and materials that already existed. */
export function formatAccessApplied(recolored: number): string {
  return `access applied recolored=${recolored}`;
}

/**
 * What to log at the start about the two preferences: a value named in the URL always (`0` and `normal` too, so the QA sees
 * that the explicit value won), a saved value only when it is on. Nothing for the plain defaults.
 */
export function startupAccessLines(input: {
  readonly contrast: boolean;
  readonly largeText: boolean;
  readonly contrastExplicit: boolean;
  readonly textExplicit: boolean;
  readonly contrastSaved: boolean;
  readonly textSaved: boolean;
}): string[] {
  const lines: string[] = [];
  if (input.contrastExplicit) lines.push(formatAccessContrast(input.contrast, 'url'));
  else if (input.contrastSaved) lines.push(formatAccessContrast(input.contrast, 'saved'));
  if (input.textExplicit) lines.push(formatAccessText(input.largeText, 'url'));
  else if (input.textSaved) lines.push(formatAccessText(input.largeText, 'saved'));
  return lines;
}
