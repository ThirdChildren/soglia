---
name: reference-m5-rerun-recipes
description: Working recipes from the M5 gate rerun (2026-11-06, cloud, CLI): bash helper functions, coach/K18/K3 procedure, merged-wall effects, baseline budget numbers after T5.RA
metadata:
  type: reference
---

Collected in `qa/reports/M5-2026-11-06-rerun.md`. Complements [[reference-m5-gate-traps]] (read that first).

## Helper library traps (scratchpad `lib.sh`)
- The scratchpad of the session may already hold earlier scripts (`k18.sh`, `lib.sh` with other function names): `Write` to `lib.sh` OVERWRITES silently ("updated"). Use a new file name or read first.
- Never name a shell variable `I` (or `R`, `S`) that the lib also uses: `PI=$(ft ...)` is safe, `I=$(...)` broke `ij` (`74: command not found`). `drop item $(w px pz)` takes WORLD coords (use `w` plan->world), not plan coords: passing plan coords drops the piece "outside-house".
- Useful functions: `setp "params"` (write file, reload, enter XR, hand mode, rest), `pof x y z` (pose for the pinch point with `PM=grip|g2|auto`), `lp x y z [hand] [dur]`, `press entity-name`, `epos name`, `ft regex`, `qe idx`, `fq idx Component`, `lg regex n sinceMs`, `st` (stats+groups), `stj` (state summary), `sweep T0` (error/warn since T0 + bad patterns), `palm_open/palm_close`, `holdat`, `relout`. Browser log `count` max 200.
- `browser logs` keeps only the last few minutes: sweep errors/warns at the end of EACH block, with the block's start ts.

## Recipes verified
- Coach (S5.7 v9): `setp`, room pinch (hand (-0.145,1.6,-0.495) + look-at (-0.145,1.35,-0.515), select 0.3), then `press ui:view-button-right` (or `ui:issue-button-right`) in the SAME script (coach start +2.6..2.9 s), sleep 25, `press ui:view-close`/`ui:issue-close`: coach back at once, timeout = 20.0 s of VISIBLE time (2.9 s + 17.2 s). Piece in hand: menu button -> `coach step=grab`, grab chair, hold: `step=done reason=timeout` 20.08 s after the grab step started (coach hidden meanwhile).
- K18: `k18b.sh` (issue-014 via `PM=g2 lp -0.254 1.3925 -0.3775 right 1.5`, phrase `ui:issue-phrase-leaks`, `ui:issue-report`, move-in toggle, 4 own pieces via palm/pinned menu `drop`, wheelchair onto sofa, my-sofa from model (3.81,5.6) onto bed (6.75,1.2)). Readings after T5.RA: 68 holding, 70 after release (stays 70 for 5 s), 64 at rest; 19-20 pieces; 32.7k tris.
- Budget numbers after T5.RA (14 pieces, A, 21 Dec 10:00, per view): K1 31 (36 cold with hint), K2 46 (49-52 while the hint is visible: it reappears after closing menu/panel), K3 60 (62 first 6 s), K12 23 (15 empty), K14 49 (57 first 6 s), K15 49 / 47 without Rotate, K16 57 / 62 menu+coach grab, K17 49. `house` group 8 (7 at real scale).
- Merged walls: `merged:walls` / `merged:thresholds` entities have only Transform/Visibility/LevelTag/StableId (no material readable): judge contrast by screenshot pixels (wall (207,210,210)->(216,222,229), floor (154,118,89)->(99,75,60), threshold (191,80,54)->(215,190,175)). Measure snap (`target=wall:w-living-bedroom`), `blocks-door`, FitCheck routes all still work (anchors keep StableId and pose).
- View panel rows via `pinch=auto` (`PM=auto`, T+(0,0.0245,0.012)) worked first time; month/hour presses: re-read the control each time (`press` does).
- V1 marker world position = O + (local - (5.5,0,3.6))*0.05 for A, y 1.4375; house B centre is (4.0,3.45) (house entity pos (-4,0,-3.45)): B/V1 world (-0.08,1.4375,-0.4925). Return button `ui:tabletop-button` at (0,1.38,-0.55) with the head at identity.
- Measure points F1/F2 of S3.2 are W(2.0;2.3)=(-0.175,1.39,-0.515) and W(3.0;2.3)=(-0.125,...): truncating the scenario coordinates gives cm=50 not 100.
- Palm menu: `sv left 1` then raising the left palm — rerun twice from a clean state (menu stays closed until 0.83 s after `pinch left end`); a spurious open right after another hand's palm menu was closed is a timing artefact of slow frames.
