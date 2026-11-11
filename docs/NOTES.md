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
- Score weights, as in `SCORE_WEIGHTS` in the engine since the first review (45 placed, 12 counter
  near entrance, 8 counter facing, 10 showcases near counter, 10 gondolas in rows, 10 even use of
  the floor, 5 open entrance; the 50/15/10/10/10/5 written here before was out of date), are our
  own first guess, to be tuned with the owner (M3 issue 10g).

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
9. Should the app start in Arabic (and remember the language and the unit between runs)? Today it
   starts in English and cm each time; remembering needs a small settings file written by the app.
10. The repository is public, so the installer and screenshot artifacts on CI can be downloaded by any
    signed-in GitHub user. Acceptable, or build and test the installer without uploading it?
11. Scan import thresholds, our own first guess: a gap up to 50 mm is closed, larger ones become a wall;
    a window more than 200 mm from every wall is left out; wall heights within 10 mm of the ceiling agree.
12. RoomTrace axes: the scan is read as seen from above (x right, y up). Please compare the imported
    plan of the sample shop with the real shop once: if it is mirrored, the adapter flips it for good.

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
- 2026-11-11 M2 issue 10: open, save, save as, save a copy via native dialogs; unchanged save is byte-identical; close prompt. 10 e2e, also on the packaged app.
- 2026-11-11 M2 issue 6: type, draw and edit the outline; every label within 1 mm in 5 units. Windows CI found that a 100 mm sketch grid is finer than a pixel on a 1024x768 screen; the grid now grows (reproduced, then fixed).
- 2026-11-11 M2 issue 7: doors, windows, columns added through forms and refused with validateRoom's message; two new room checks (above ceiling, column outside).
- 2026-11-11 M2 issue 9: Arabic for every string, RTL around an unmirrored plan, messages translated by code (RoomProblem.values). Screenshots uploaded by CI (artifact screens-<os>).
- 2026-11-11 M2 issue 11: RoomTrace JSON importer. The owner's sample: 7 corners (two gaps of 811 and 471 mm drawn as walls,
  possible doorways), window on wall 2 at 614.403 mm with its sill left to the owner, ceiling 2256 mm. Suite: 575 Vitest, 52 e2e.
- 2026-11-11 Independent review of Milestone 2 (owner's request, read-only reviewer): 16 findings, 14 fixed test-first
  (diagonal corner 0 crash, default menu losing work, file:// reads, zero/negative entries, closure note, translated file
  errors, refused edits explained, zero-length wall, Save and close, Edit the walls, scan numbering/overhang/no-height/throw).
  Not changed: "Save a copy" starts a fresh history (by design); asar integrity fuse deferred (needs its own spike).
  Suite after the fixes: 602 Vitest, 64 e2e; CI green on Ubuntu, Windows and the installed app.
- 2026-11-11 Milestone 3 detail plan approved with rulings: order 10a, spikes, 1-6, 7-9, 10b-10g; ranking key placed + complete block (decision 0003); catalog file on the laptop; no drei, no UI kit; red fixtures in 3D; rear access by staff zone; software 3D off in the app; benchmark on a Diagnostics page.
  Found while planning: with no GPU, Electron has no WebGL unless started with --enable-unsafe-swiftshader (probe in this container: none without it, SwiftShader WebGL2 with it).
- 2026-11-11 M3 10a: engine.ts (1273 lines) split verbatim into 8 phase files, largest state.ts at 299 lines. Proof: golden SHA-256 of the full autoLayout JSON for all 7 scenarios and every SVG snapshot byte-identical after regeneration; suite 619 green.
  `snapshots/before-m3/` frozen as the "before" for the rest of issue 10.
- 2026-11-11 M3 3D spike: three 0.187.0 + @react-three/fiber 9.8.2 on WebGL. Diagnostics, "Test 3D speed": 60 real products, every box read back from the scene graph within 1 mm; CI (SwiftShader) 16.7 ms median for all four setups (capped by 60 Hz), 2 draw calls instanced vs 61 without.
  Owner: please run Diagnostics > Test 3D speed once on the laptop and send a photo; that is the only proof of the 30 fps target on integrated graphics.
- 2026-11-11 M3 worker spike: autoLayout runs in a Web Worker loaded from file:// under the existing CSP; its JSON is byte-identical (SHA-256) to a direct call in Node 22, so Electron's V8 and Node agree. 200 ms in the worker for the 9-product test shop. Diagnostics, "Test layout speed" lets the owner time it.
  CI 3D numbers from both runners recorded in STACK.md (Windows CI also uses SwiftShader).
- 2026-11-11 M3 issue 1: catalog file `<userData>/catalog.json`, seeded from `seedProducts` on first start; add, edit (several sizes per product), remove (asks first), confirm. 29 + 6 Vitest, 8 e2e; the bridge now has 7 functions (test list updated in its own commit).
  The owner can now answer open questions 1 to 3 and 5 in the app: type the missing sizes, confirm or correct website sizes and prices.
- 2026-11-11 M3 issue 2: place, move (snapped drag delta), rotate in quarter turns relative to the nearest wall (angled wall: 26.565051, 116.565051, 206.565051, 296.565051 degrees), duplicate (beside along local +x), delete; exact X, Y, Rotation fields. 10 + 16 Vitest, 6 e2e; suite 678 Vitest, 80 e2e.
- 2026-11-11 M3 issue 2, Windows CI red: a fixture drag was lost when pointer events came before React re-rendered (stale drag state). Reproduced locally with back-to-back events; the M2 corner drag had the same bug. Both fixed with a ref; 4 regression tests (`test/e2e/drag-timing.spec.ts`) red before, green after.
- 2026-11-11 M3 issue 2, installed-app job still red: the real cause was the plan scrolling out of view in a laptop-sized window (the drag pressed on nothing at y = -23 px). Reproduced by resizing the window to 1024 x 728; the plan is now sticky beside the panels. 2 regression tests red before, green after.
- 2026-11-11 M3 issue 3: live validation. Violations gain `detail` and `values` (and `columnId` for an access zone blocked by a column); English messages byte-identical. Plan marks problem fixtures; "Layout problems" list in en/ar. 24 + 46 Vitest, 3 e2e; validateLayout, 40 fixtures: median 16.2 ms (target 50). Suite 749 Vitest, 89 e2e.
  Spec fix during the issue: the column id was missing from my spec; the test change is its own commit (045ec76).
- 2026-11-11 M3, Windows CI red once on a docs-only commit (catalog Confirm saved nothing): Windows refuses to replace a file another process has open for a moment (EPERM/EACCES/EBUSY). The atomic save now retries the rename on those codes only (10 tries, about 1.1 s). 3 tests red before, green after; the same risk existed for project saves on the owner's laptop (antivirus, indexer).
- 2026-11-11 M3 issue 4: snapping. snapToWall never lands across a door (slides to the nearest free spot; the stand showcase by the entrance goes to x = 2390.4 mm); snapBackToBack new; the editor snaps on place and drop, one undo step. 15 Vitest (3 room properties, 1 back-to-back property), 2 e2e. Suite 766 Vitest, 91 e2e.
  Found by the property test: backIsCovered (M1) threw on any back-to-back pair not along an axis (fractional sample points into exact geometry); fixed by rounding the samples. No layout changed (golden hashes equal).
