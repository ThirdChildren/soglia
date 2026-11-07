// The `info` screen of the Issues panel (task T5.9, decision D57 in docs/plans/M5.md): what a pinch on a cyan diamond shows. Pure
// logic: no imports from @iwsdk/core or three.
//
// Top to bottom: the category and the room of the point (`Plumbing · Bathroom`), the text of the note (up to 4 lines, wrapped
// here with the font table so no line is wider than its box) and, under it, the words `Sample data` (rule 7: every note of the demo
// is made up). No status, no urgency and NO buttons: only `Back` and `Close` of the bar. The title is `Info`.

import { DETAIL_ELLIPSIS, DETAIL_LINE_WIDTH, cutToWidth, wrapText } from './issue-detail';
import type { InfoPoint } from './info-points';
import type { IssueCategory } from './issues';
import type { Role } from './params';
import { can } from './permissions';

/** Most lines of the note, and the heights of the blocks (centimetres; public/ui/issue-panel.uikitml says the same, a test keeps them equal). */
export const INFO_TEXT_LINES = 4;
export const INFO_META_HEIGHT = 2.4;
export const INFO_TEXT_LINE_HEIGHT = 2.5;
export const INFO_SAMPLE_HEIGHT = 2.4;
/** Space above the words `Sample data`. */
export const INFO_SAMPLE_GAP = 0.8;
/** Text size of the screen: the minimum of the panel. */
export const INFO_TEXT_SIZE = 2.4;
export { DETAIL_ELLIPSIS as INFO_ELLIPSIS };

/** The texts the screen needs (from `strings.issues.info`; the logic does not import the strings). */
export interface InfoTexts {
  readonly title: string;
  readonly sampleData: string;
  readonly missing: string;
  readonly categories: Readonly<Record<IssueCategory, string>>;
  /** Between the category and the room (` · `, or ` - ` when the panel font has no middle dot). */
  readonly separator: string;
}

export interface InfoModel {
  readonly id: string;
  /** The point does not exist for this role (or at all): only `missingText` is shown. */
  readonly missing: boolean;
  readonly missingText: string;
  readonly title: string;
  /** `Plumbing · Bathroom`, cut to the line. */
  readonly meta: string;
  /** The note, wrapped to the width of the screen. */
  readonly textLines: readonly string[];
  /** `Sample data`. */
  readonly sampleText: string;
}

/** A model for a point that cannot be shown (unknown id, or a role that may not `view-info`). */
export function missingInfo(id: string, texts: InfoTexts): InfoModel {
  return { id, missing: true, missingText: texts.missing, title: texts.title, meta: '', textLines: [], sampleText: '' };
}

/**
 * The screen of info point `point` for `role`; `roomName` is the room of its place (null: none). A role that may not `view-info`
 * (tenant, landlord) or an undefined point gets the missing model, like an unknown id.
 */
export function buildInfoModel(point: InfoPoint | undefined, id: string, role: Role, roomName: string | null, texts: InfoTexts): InfoModel {
  if (point === undefined || !can(role, 'view-info')) return missingInfo(id, texts);
  const category = texts.categories[point.category];
  const joined = roomName === null || roomName === '' ? category : `${category}${texts.separator}${roomName}`;
  return {
    id: point.id,
    missing: false,
    missingText: texts.missing,
    title: texts.title,
    meta: cutToWidth(joined, DETAIL_LINE_WIDTH),
    textLines: wrapText(point.text, DETAIL_LINE_WIDTH, INFO_TEXT_LINES),
    sampleText: texts.sampleData,
  };
}
