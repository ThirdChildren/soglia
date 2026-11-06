---
name: m4-issues-ui
description: How the M4 issue UI, pins, long pinch and persistence are built (decisions and traps that cost time)
metadata:
  type: project
---

Built 2026-11-02/04 (plan `docs/plans/M4.md`). Complements [[m3-lifecycle-and-joints]].

- One UIKit root `ui:issue-panel` (36 x 37.6 cm like the v2 menu); every screen (`home|new|list|detail|movein`) is rewritten IN PLACE with
  `setProperties` (setHome/setForm/setList/setDetail/setMoveIn), never by recreating the document. Controls are light anchors with `pickRect`.
  A `\n` inside a UIKit text does NOT break the line: wrap in pure logic and give each line its own box. Button widths are packed from the real
  bold atlas advances; tests measure with the real atlases (see `issue-form.test.ts`).
- Panels are disposed only with `disposePanelEntity`; `PanelDisposalSystem` flushes every frame (no longer inside the palm menu).
- Pins: ONE instanced mesh `pin:instances` (+1 draw call), instance scale = size / modelScale (constant world size), draft and selection ring are
  extra instances placed right after the pins; `mesh.count` draws only the used instances. Entities `pin:<id>` are light, for QA only.
- Long pinch (`long-press.ts`): 0.8 s, 1.5 cm, settle 0.15 s; the decision is delayed because other pinch systems claim the hand in their own
  listeners. Claim owner `issue` sits between `pan` and `room`; blocked by a held piece, the measure tool, real scale and transitions.
- `transitionIssue` takes the role from the caller: always pass `store.get().role` (the reducer does not compare it with `state.role`).
- Persistence: role, issues, nextIssue, issuesSeeded, prefs.moveInVisible are additive (version 1); `explicit` params win over the saved role;
  the seed is applied once and makes every load save the state; own pieces whose catalog is missing are parked and rewritten identical.
  Restore/save only start when the catalog loaded (known gap if `catalog.json` fails).
- Tabletop button: 0.13 x 0.05 m, 0.55 m ahead and 0.22 m below the eyes, yaw only; re-anchors after 0.5 s beyond 35 deg (glide 0.3 s).
- Pinned menu: `pinnedMenuAnchor(head, yaw, out, pitch)` clamps the pitch to +-8 deg; real window +12.0 / -14.3 deg (not +13.1 / -15.1).
