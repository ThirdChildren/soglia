---
name: m5-block-r
description: M5 Block R (T5.R1-R6) decisions and traps - list rows, agent chip, violet baseline, no-catalog persistence, debug-only params
metadata:
  type: project
---

Built 2026-11-06 on branch `claude/charming-cori-mccw6h` (plan `docs/plans/M5.md`).

- Debug-only params (`failmodels`, `failmy`, `failcatalog`, `glyphs`) are dropped in `mergeParams` without `debug=1`, with the warning
  `param <key> ignored: needs debug=1` in that order. Adding a param key means updating `params.test.ts` (defaults, "parses every key",
  "ignores unknown keys" key lists, `formatParamsLine` object, the dev-file `it.each`).
- Persistence without catalog: `pickRestorable` with empty `catalogIds` already parks every piece; undo history is emptied (steps act on
  pieces not on show) and the next save writes it empty. Role/issues/prefs/view/counters are kept.
- Agent chip: `AGENT_ROLE_AVAILABLE` (src/logic/issue-panel.ts) -> `HOME_ROLES`; the uikitml still has the chip, the UI sets `display: none`;
  `CONTROL_SLOTS['role-agent']` stays for the type but is not in `screenControls`. T5.10 flips the constant (tests follow it).
- List rows (T5.R4): the plan's "status word + 20 chars" does NOT fit one 2.4 cm line (Progress = 10.7 cm, 20 chars = 26 cm of 33.6).
  Rows are now two lines, 5.4 cm (border 0.3), 4 per page, heading 2.4 + 0.2; text cut to 22 chars incl. ASCII `...` (the Inter atlas has
  no U+2026). The move-in report keeps `LIST_ROW_HEIGHT` 4 and `rowTextBudget`. Heading + 4 rows = 25.1 of 25.4 cm: do not grow rows.
- Detail: only the head (status/urgency) got a 0.5 cm margin (`DETAIL_HEAD_*`); narrowing all detail lines breaks the history lines.
- Baseline colour is `0x9b59d0` / name `violet` (src/logic/issues.ts, uikitml dots too).
- One pinch on a row (list and move-in) opens the detail; `issues row selected` log and `onIssueSelected` are gone.
- `console.error` in index.ts -> `swarn('start failed: ' + describeError(e))` (src/log.ts).
