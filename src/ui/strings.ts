// Every user-visible string of the app lives here (plain, short English).

import { fitMessage, type FitItem, type FitResult, type FitTexts } from '../logic/fit-check';
import { formatSize, formatSizeCompact, lowerName, type ReasonKind } from '../logic/furniture-label';
import { CATEGORY_LABELS, PHRASES } from '../logic/issue-text';
import { measureLabelText } from '../logic/measure-tool';
import { formatRoomLabel } from '../logic/room-label';

/** Why a piece is not valid (D27): short texts shown next to it. */
const reason = {
  blocksDoor: 'Blocks the door',
  overlapsWall: 'Overlaps a wall',
  overlapsFurniture: (name: string): string => `Overlaps the ${lowerName(name)}`,
  outside: 'Outside the house',
} as const;

/** The sentences of the FitCheck (D34). Lengths are whole centimetres, `name` is the short lower case name. */
const fitTexts: FitTexts = {
  wontFitNarrow: (doorCm, name, sideCm) =>
    `Won't fit: the door is ${doorCm} cm wide, the ${name}'s shortest side is ${sideCm} cm`,
  wontFitMobility: (doorCm, name, needCm) => `Won't fit: the door is ${doorCm} cm wide, the ${name} needs ${needCm} cm`,
  wontFitLow: (doorCm, name, needCm) => `Won't fit: the door is ${doorCm} cm high, the ${name} needs ${needCm} cm`,
  disassembledNarrow: (doorCm, name, sideCm) =>
    `Fits when disassembled: the door is ${doorCm} cm wide, the ${name}'s shortest side is ${sideCm} cm`,
  disassembledLow: (doorCm, name, needCm) =>
    `Fits when disassembled: the door is ${doorCm} cm high, the ${name} needs ${needCm} cm`,
  fits: (narrowestCm) => `Fits: the narrowest door on the way is ${narrowestCm} cm wide`,
  noRoute: 'No route from the entrance to this room',
};

export const strings = {
  errors: {
    houseNotFound: 'This home could not be found.',
    houseInvalid: 'This home file is not valid.',
    hint: 'Reload the page or choose another home.',
  },
  menu: {
    title: 'Furniture',
    undo: 'Undo',
    previous: 'Back',
    next: 'Next',
    recenter: 'Recenter',
    /** The fourth button of the bar at real scale (T3.12); the menu does not use it before that task. */
    tabletop: 'Tabletop',
    /** Short on purpose: the four tabs share one row of the menu at 2.4 cm text (D37). */
    tabs: {
      items: 'Items',
      mine: 'Mine',
      fit: 'Fit',
      measure: 'Measure',
    },
    /** Shown in the header when the catalog is missing; one line at 2.4 cm text. */
    catalogUnavailable: 'Catalog not loaded',
    /** The fixed buttons beside the model (T3.3b): they open and close the pinned menu with one hand. */
    button: 'Menu',
    /** "1 / 3" */
    page: (page: number, total: number): string => `${page} / ${total}`,
    /** "1.6 × 2.0 m" (plain x when the local panel font is missing). */
    itemSize: (width: number, depth: number, ascii = false): string => formatSize(width, depth, ascii),
    /** "0.35×0.35 m": the same without the spaces, for a measure that would touch the border of its card. */
    itemSizeCompact: (width: number, depth: number, ascii = false): string => formatSizeCompact(width, depth, ascii),
  },
  /** Shown above the model until the palm menu has been opened once (T2.16); plain ASCII. */
  hint: {
    palmMenu: 'Palm up for the menu',
  },
  /** Real scale (T3.12, T4.R1, D49): the button in front of the head that takes a one-handed user back to the model on the table. */
  viewpoint: {
    tabletopButton: 'Tabletop',
  },
  /** The View panel and its buttons (M5, D56): sun, zoom and turn of the model. */
  view: {
    /** The third floor of fixed buttons beside the model, above "Issues": they open and close the View panel with one hand. */
    button: 'View',
    title: 'View',
    close: 'Close',
    rows: { zoom: 'Zoom', turn: 'Turn', month: 'Month', hour: 'Hour' },
    less: '-',
    more: '+',
    /** `Sun 14° SE` (`deg` when the local panel font has no degree sign). */
    sun: (altitudeDeg: number, compass: string, ascii = false): string => `Sun ${altitudeDeg}${ascii ? ' deg' : '\u00b0'} ${compass}`,
    sunDown: 'Sun below the horizon',
    /** `15°`. */
    turn: (degrees: string, ascii = false): string => `${degrees}${ascii ? ' deg' : '\u00b0'}`,
  },
  /** The Issues panel and its buttons (M4, D47, D50). */
  issues: {
    /** The fixed buttons beside the model (T4.6a), above the "Menu" ones: they open and close the Issues panel with one hand. */
    button: 'Issues',
    back: 'Back',
    close: 'Close',
    /** Footer of the `home` screen: the roles are a demo, there are no accounts (rule 7, honesty). */
    footer: 'Demo roles, no accounts',
    /** The four roles of the grid of `home` (T4.6b). */
    roles: {
      visitor: 'Visitor',
      agent: 'Agent',
      tenant: 'Tenant',
      landlord: 'Landlord',
    },
    /** The buttons of `home` for the roles that see the issues: the number is the issues in the store (the baseline does not count). */
    openList: (count: number): string => `Issues (${count})`,
    openMoveIn: 'Move-in report',
    /** The line under the role chips: how to report (tenant), what to pick (visitor), and the agent, who has no issue tools yet. */
    hints: {
      report: 'Hold a pinch on an appliance or a spot to report an issue.',
      'pick-role': 'Pick Tenant to report an issue or Landlord to manage them.',
      stage: 'Furnish sets up the house in one pinch. Undo brings it back.',
      'stage-clear': 'Clear empties the house. Undo brings it back.',
    },
    /** The agent's buttons on `home` (T5.10, D57): a whole layout in one gesture, one undo step. */
    agent: {
      furnish: 'Furnish',
      clear: 'Clear',
    },
    /** The categories and the phrases of the form of a new issue (D40): the tables live in src/logic/issue-text.ts, which builds the saved sentence from the same labels. */
    categories: CATEGORY_LABELS,
    phrases: PHRASES,
    /** The form of a new issue (T4.7): hands only, no keyboard. */
    form: {
      urgency: { low: 'Low', medium: 'Medium', urgent: 'Urgent' },
      report: 'Report',
      cancel: 'Cancel',
      back: 'Back',
      /** Context line of the first step of a free spot. */
      pickCategory: 'What is it about?',
      /** The line where the sentence will appear, until a phrase is chosen. */
      pickPhrase: 'Pick what is wrong.',
      /** Context line of the second step: "Appliances · Bathroom" (with `ascii` a plain dash when the panel font has no middle dot). */
      context: (category: string, room: string, ascii = false): string => `${category}${ascii ? ' - ' : ' \u00b7 '}${room}`,
    },
    /** The list of issues (T4.8, D48). "Prev" and not "Back": `Back` of the bar already goes back to `home`. */
    list: {
      title: 'Issues',
      empty: 'No issues yet',
      history: 'History',
      sampleData: 'Sample data',
      /** The status next to the dot of a row: a word, so the colour is never the only sign. */
      status: { open: 'Open', in_progress: 'Progress', resolved: 'Resolved', archived: 'Archived' },
      urgency: { low: 'Low', medium: 'Medium', urgent: 'Urgent' },
      prev: 'Prev',
      next: 'Next',
      back: 'Back',
      close: 'Close',
      pageOf: (page: number, pageCount: number): string => `${page}/${pageCount}`,
    },
    /** The detail of one issue (T4.9, D43, D48): the status in words (the colour is not the only sign), the history and the actions. */
    detail: {
      title: 'Issue',
      missing: 'Issue not found',
      sampleData: 'Sample data',
      status: { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', archived: 'Archived' },
      urgency: { low: 'Low', medium: 'Medium', urgent: 'Urgent' },
      /** One line of the history is `28 Oct · landlord · Resolved`. */
      events: {
        created: 'Created',
        in_progress: 'In progress',
        resolved: 'Resolved',
        archived: 'Archived',
        reopened: 'Reopened',
        commented: 'Comment',
      },
      /** The buttons: only the ones the role may press on this issue exist. */
      actions: { 'take-on': 'Take on', resolve: 'Resolved', confirm: 'Confirm', reopen: 'Reopen' },
      more: (count: number): string => `+${count} more`,
      /** Title and status word of the detail of a move-in entry (a `baseline`: not an issue, so no Open / Resolved). */
      moveIn: 'Move-in',
    },
    /** The move-in report (T4.10, D48): the entries of the day the tenant moved in, and the switch that shows them on the model. */
    movein: {
      title: 'Move-in report',
      /** The title when the entries are sample data: the full title with "Sample data" would not fit one line. */
      shortTitle: 'Move-in',
      sampleData: 'Sample data',
      empty: 'No move-in entries',
      toggle: 'Show on model',
      on: 'On',
      off: 'Off',
      back: 'Back',
      close: 'Close',
    },
    /** An info point of the agent (T5.9, D57): the screen a pinch on a cyan diamond opens. Every note is made up, so it says so. */
    info: {
      title: 'Info',
      sampleData: 'Sample data',
      missing: 'Info not found',
    },
    /** Title of each screen. */
    screens: {
      home: 'Issues',
      new: 'New issue',
      list: 'Issues',
      detail: 'Issue',
      movein: 'Move-in report',
      info: 'Info',
    },
  },
  reason,
  /** The tape measure (T3.14, D36): the hint while it is on, and the label of a measure ("140 cm"). */
  measure: {
    hint: 'Pinch two points',
    label: (cm: number): string => measureLabelText(cm),
  },
  /** FitCheck texts (T3.7): `message` is the first line of the label, `note` the fixed second line. */
  fit: {
    ...fitTexts,
    /** Corridors are not checked: the house file has no corridor data. */
    note: 'Simplified check',
    message: (result: FitResult, item: Pick<FitItem, 'name' | 'kind'>): string => fitMessage(result, item, fitTexts),
  },
  /** The text of a reason; `withName` is the catalog name of the piece it overlaps (for `overlaps-furniture`). */
  reasonText: (kind: ReasonKind, withName?: string): string => {
    switch (kind) {
      case 'blocks-door':
        return reason.blocksDoor;
      case 'overlaps-wall':
        return reason.overlapsWall;
      case 'overlaps-furniture':
        return withName ? reason.overlapsFurniture(withName) : 'Overlaps another piece';
      case 'outside-house':
        return reason.outside;
    }
  },
  /**
   * Label of a selected room, for example "Study · 12.0 m²". With `ascii` ("Study: 12.0 m2") for
   * when the local panel font is missing and the bundled font has no middle dot or superscript two.
   */
  roomLabel: (name: string, areaM2: number, ascii = false): string =>
    formatRoomLabel(name, areaM2, ascii),
} as const;
