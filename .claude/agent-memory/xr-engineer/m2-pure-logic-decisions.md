---
name: m2-pure-logic-decisions
description: M2 pure-logic modules (T2.3-T2.7): conventions and numeric edge cases decided while writing them
metadata:
  type: project
---

- `Rect.angleRad` follows `wallFrame` (atan2(dz,dx)); furniture pieces use axis-aligned rects (quarter turns, angle 0 with swapped w/d).
- `evaluatePlacement` does NOT snap; callers run `snapPose` first. Door zones and walls use tolerance 0.005; furniture 0.06. Flat pieces (size[2] <= 0.02) skip furniture and door checks but not walls.
- `snapPose` loops up to 4 passes: grid rounding can push a piece into snap range, so a single pass is not idempotent.
- Wrist twist hysteresis: stay at step s while |twist - 90 s| <= 50 (exactly 140 deg is still step 1, 141 is step 2). `rotationDeg = base - 90 * steps`.
- Store history entries are `{action, id, furniture-before}`; `nextInstance` is the NEXT number to use and is raised (never lowered) by setFurniture/deserialize.
- Float boundaries in tests: `1.3 + 0.25 - 1.3` is not 0.25; test at 0.24/0.26 instead of the exact limit.
- D26 data fix applied: bookcase x 10.69, sofa-3seat z 3.10 in apartment-a staging; negative fixtures with the old poses live in tests/unit/staging.test.ts.

**Why:** these are the non-obvious choices the later systems (T2.9, T2.13) depend on.
**How to apply:** read before touching placement-rules, furniture-pose or the store.
