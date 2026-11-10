# Notes

Running log and decisions. Checkpointed after every step so work survives a restart.

## Decisions

### Units and tolerance
- Stored unit: **integer micrometres (µm)**. 1 in = 25 400 µm exactly; 1 ft = 304 800; 1 mm = 1 000.
  1/16 in = 1 587.5 µm rounds with a 0.5 µm error, far below any build tolerance.
- Why integers: no floating-point drift, exact equality, and Clipper works on integers.
- Every entered value keeps what was typed (value + unit) beside the µm value, so the owner sees
  his own number back.
- Tolerances: geometry contact tolerance 2 µm (`DEFAULT_TOLERANCE_UM`): penetration of 2 µm or
  less is touching, not overlapping. It absorbs integer rounding of rotated corners. Rendered and
  exported dimensions must match the document within **±1 mm**.
- Precision: a 100 m coordinate is 1e8 µm, so a product of two coordinates reaches 1e16, above
  2^53 (about 9.007e15). Cross products and areas therefore must not use plain floating-point
  multiplication. `src/geometry/exact.ts` uses exact integer math; `test/geometry/exact.test.ts`
  proves it at 100 m × 100 m and shows the naive formula failing:

  | Input | Naive float | Exact |
  |---|---|---|
  | twice the area, shop 99 999 999 × 100 000 001 µm | 20000000000000000 | 19999999999999998 |
  | orientation of 3 points 1 µm off a line at 100 m | 0 (collinear) | −1 (clockwise) |
- Rotation is stored as integer micro-degrees, so a 1.2 m fixture on an angled wall is aligned to
  about 0.02 µm, below rounding.

### Coordinates
- 2D plan: x to the right, y up, counter-clockwise room outline, origin chosen by the document.
- Rotations: quarter turns relative to a wall direction (V1).

### Architecture (owner decision 2026-11-11, `decisions/0007`)
- V1 is a laptop-only, fully local Electron desktop app; all compute on the laptop's CPU/GPU.
- Unsigned installer: the one-time SmartScreen warning is accepted by the owner.
- Projects are JSON files opened and saved through native dialogs.
- No phone screen, PWA, sync or hosting in V1 (listed as "Future" in the plan).
- Room scans come as files from a separate iPhone scan app (not chosen yet), via an importer.
- Later Blender photoreal rendering can be started by Electron's main process; the engine and
  exports stay free of browser-only APIs.

### Retail planning numbers (config values, with sources)
| Rule | Value | Source |
|---|---|---|
| Main aisle | ≥ 1200 mm | Owner requirement |
| Secondary aisle | ≥ 915 mm | Owner decision 2026-11-10 (ADA 2010 §403.5.1) |
| Staff space behind counter | ≥ 915 mm (36 in) | POS vendor guidance (koronapos.com cash-wrap guide); not a code |
| Door approach, pull side | 1525 mm deep, 455 mm beyond latch | ADA 2010 §404.2.4 |
| Entrance decompression zone | door wide, a third of the shop depth, 3 m at most | Owner decision 2026-11-10 |
| Window rule | a fixture higher than the sill may not stand in front of that window | Owner decision 2026-11-10 (replaces the 54 in threshold) |
| Showcase supervision | near the counter | No published number found; our own rule, flagged |

### Catalog facts (newhorizonfixture.com, read 2026-11-09)
- Custom Next.js site, 18 products, no product feed. Dimensions are inconsistent and often
  missing, so the catalog is entered by hand and confirmed by the owner.
- Stated sizes used as `unverified` seed data:
  - 6FT EXTRA VIEW SHOWCASE: "72″L x 22″W x 38″H" — /products/6ft-extra-view-showcase
  - 4 FT FULL VIEW LED lights Showcase: "72″L x 20″W x 38″/42”H" — /products/6ft-full-view-led-lights-showcase
    (title says 4 FT, text says 72 in: contradiction flagged for the owner)
  - Counter: "24x20x38inch" — /products/c
  - Gondola wood 4 feet: "48(inside )*24*54inch" — /products/jan
  - Gondola 4 feet: "L4*W3*H5'" — /products/g
  - Stand showcases: "48*20*72" (axis order not stated: flagged) — /products/s-1
- No stated size, so `unknown` and not auto-placeable: Showcase 6 feet (/products/s), Cigarette
  display stand, Dip and cigarettes rack.
- No "tower" category exists on the site today.

### Auto-layout: what is and is not in V1 (superseded by `decisions/0003-rule-based-layout-engine.md`)
- Counter candidates are parallel to a wall with staff space behind. A counter standing free in
  the room (island cash wrap) is not tried.
- Showcases go in one line with the counter; an L-shaped counter line is not tried.
- Gondola rows follow one direction per option, taken from the entrance wall. Rows are packed on
  a 100 mm grid, then centred.
- No random search: every option is the result of fixed rules, so it can be explained.
- The planned "local improvement pass" is the row centring only. Swapping or re-ordering fixtures
  to squeeze more in is not implemented; the over-full report says what did not fit instead.
- Score weights (50 placed, 15 counter near entrance, 10 counter facing, 10 showcases near
  counter, 10 gondolas in rows, 5 open entrance) are our own first guess, to be tuned with the owner.

## Open questions for the owner
1. Wood gondola ("Gondola wood 4 feet"): what is the OUTER width? The site gives only the inside
   width (48 in), so it cannot be placed.
2. "4 FT FULL VIEW" showcase: 72 in is used, pending your final confirmation.
3. Cigarette display stand, dip rack, "Showcase 6 feet": no sizes on the site.
4. Clearances per product (front, back, side) are not specified; planning aisles are used.
5. Prices are website prices, unverified.
6. Score weights: tune with the owner on the gallery (M3 issue 10g).
7. Which iPhone scan app to use (RoomTrace or another); its export becomes a test fixture.
8. Capture thresholds, our own first guess until you confirm them (`src/rules/config.ts`):
   closure tolerance 10 mm; diagonal tolerance 20 mm; wall shorter than 100 mm or longer than
   30 m warns; a corner sharper than 15 degrees warns; a scan gap of 50 mm or less is closed
   (and reported), a larger one is reported as a possible doorway; the corner angles must add up
   to (n - 2) x 180 degrees within 0.5 degrees.

Answered on 2026-11-11 (Milestone 2 detail plan): order 1, 2, 3, 4, 5, 8, 10, 6, 7, 9, 11; strings
through t() from issue 1; closure check gives the smallest suspect set; document null until a room
exists; unknown scan sill stays pending; JSON scan adapter only (DXF waits for a sample); room checks
for window above ceiling and column outside room; translatable room problems; "Save changes?"
prompt; `pnpm test:e2e` separate; rectangles-only columns; snapshot-stack undo; default unit cm;
digits 0-9 (Eastern Arabic accepted as input); Windows packaging job only on app or build changes.

Answered on 2026-11-11: own editor (not Pascal packages); hosting cancelled, V1 is a local Electron
app; ranking keeps fixtures placed first, except a complete checkout block wins when options differ
by one fixture (M3 issue 10b); wood gondola stays unplaceable; "4 FT FULL VIEW" stays 72 in pending
confirmation.

Answered on 2026-11-10: secondary aisle 915 mm; window rule by sill height; stand showcase is
W48 × D20 × H72 in; single-sided units go on walls or back to back; entrance decompression zone.

## Log
- 2026-11-10 Plan approved with changes. Initial README commit pushed to `main`.
- 2026-11-10 Issue 1: scaffold, pinned dependencies, library spikes green (5 tests), typecheck clean.
- 2026-11-10 Issue 2: units + schema, 35 tests. 16 mutations of the implementation each failed a test.
- 2026-11-10 Issue 4: catalog seed (9 products, 3 unknown) + test fixtures, 44 tests.
- 2026-11-10 Issue 3: geometry, 89 tests; 4 mutations each failed tests. Suite 173 green. Draft PR #1 open.
- 2026-11-10 Issues 5 and 6 were assigned to two builders; both were cut off by the usage limit
  before writing any implementation. Owner instruction: continue without subagents (Sonnet 5.5 if
  one is ever needed). From here the Lead writes the code; the Prover step is a fresh clone run.
- 2026-11-10 Issue 5: validation rules, 40 tests; 11 mutations each failed a test (one gap found
  and closed: the window sill check). validateLayout on 40 fixtures: 36 ms.
- 2026-11-10 Issue 6: SVG/PNG renderer, 9 tests + 5 room snapshots. Worst deviation between the
  SVG and the document: 0.64 um (tolerance 1 mm).
- 2026-11-10 Issues 7-9: auto-layout engine, 30 tests + 15 layout snapshots. Each scenario runs
  in under 1 s. Suite: 261 tests green.
- 2026-11-10 Independent review: "don't merge yet". Round 2, tests first, one pair of commits per
  finding: Windows line endings and CI matrix; room validation; no-entrance and ghost placements
  as errors; owner's rule decisions; back-to-back rule; engine rework (checkout block, one island
  grid, pairs, search, rotation-safe, dominant cause, speed); independent oracle; import-direction
  test; docs moved under `docs/` with decision records; plan for Milestones 2 to 4.
- 2026-11-10 Measured after round 2: benchmark 15 × 10 m, 35 fixtures about 2.2 s (target 3 s);
  rotation by 17, 33.3, 45 and 123.5 degrees gives the same fixtures, rows and ranking, scores
  within 0.5; the oracle caught a deliberately broken walking rule with 7 failing tests.
- 2026-11-11 Scope change (owner): laptop-only local Electron app; phone, PWA, sync and hosting moved to Future; scan importer added as the last issue of M2; PDF via Chromium printToPDF. Plan, STACK, ARCHITECTURE, TEAM_RULES and decision 0007 updated (docs only).
- 2026-11-11 Milestone 2 detail plan approved with rulings (see open questions 8 and the answers above). Plan table reordered; DXF spike dropped.
- 2026-11-11 M2 issue 1: Electron shell, locked-down window, unsigned NSIS installer job; smoke test 4/4 on the build and on the packaged app; CI green on Ubuntu and Windows.
  Each protection (popup handler, navigation block, sandbox, CSP) removed alone turns one smoke test red.
- 2026-11-11 M2 issues 2, 3, 4, 5, 8 (tests written in parallel by three test-writers in worktrees): document store 15 tests;
  capture 51 tests (L and angled rooms exact, closure suspects, diagonal pick, warnings); length entry 81 tests. Suite 509 green.
- 2026-11-11 Added to the open questions: the angle-sum tolerance 0.5 degrees (closure check), our own first guess.
