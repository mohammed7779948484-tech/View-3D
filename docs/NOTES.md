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
- Score weights (`SCORE_WEIGHTS`), decided 2026-11-12 (M3 issue 10g, question 15): 30 placed, 12
  counter near entrance, 8 counter facing, 10 showcases near counter, 10 gondolas in rows, 15 even
  use of the floor, 15 open entrance. Before: 45/12/8/10/10/10/5.

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

13. M3 10c (swap-and-relocate pass) is parked. Measured: every test shop already places everything it
    can; in the over-full 4 x 5 m shop no extra tower or wall shelf fits along any wall of any option
    (brute force, every 50 mm, all rules). A relocation pass would only show a gain on a shop built to
    trap the engine. Recommended: wait until one of your real shops shows the engine leaving out
    something a person could fit; that shop becomes the test. Or say "build it now" and a constructed
    case is used.

14. M3 10f: which of your products are served from the back (staff stand behind them, e.g. rear
    sliding doors)? The app now supports it: such a product needs 915 mm of staff space behind it and
    is never put with its back to a wall. No real product has it set; you set it yourself in the
    catalog ("Served from: The back"), or tell me and I set it. The website text does not say which
    ones open from the back. Candidates (every showcase in the catalog):
    - 6FT EXTRA VIEW SHOWCASE (`nhf-6ft-extra-view-showcase`, anywhere on the floor; the M3 plan
      says it has rear sliding doors, so it is most likely "back": please confirm)
    - 4 FT FULL VIEW LED lights Showcase (`nhf-6ft-full-view-led-lights-showcase`, anywhere on the floor)
    - Showcase 6 feet (`nhf-s`, anywhere on the floor; size still unknown)
    - Stand showcases (`nhf-s-1`, against a wall: if served from the back it cannot stand on a wall)
    Only a product placed "anywhere on the floor" can be served from the back: the catalog form offers
    the choice only for those, and a project file with it on any other kind is refused. If Stand
    showcases opens from the back, its placement must change to "anywhere on the floor" too.

15. M3 10g, score weights. Today: placed 45, counter near the entrance 12, counter faces the
    entrance 8, showcases with the counter 10, islands in rows 10, even use of the floor 10, open
    view from the entrance 5. Measured: since 10b ranks by fixtures placed first, the 45 points for
    "placed" never decide anything; they only make the printed score look high. Proposal: placed 30,
    even use 15, open view 15, the rest unchanged (still 100). On every test shop it moves nothing
    and changes no rank; the printed scores change (rendered and compared, every drawing). Before
    you decide, look at the two pairs in `snapshots/README.md` (section 10g) and say which option of
    each you would show a customer first. Your answers set how much the open view counts against
    even use and the counter's distance: pair 1 flips if even use counts more than 2.6 times the
    open view; pair 2 flips only if the open view gets more than about 21 points (the others as
    proposed; today it has 5). Nothing is changed in the app until you answer.

16. M3 10d (counter not only parallel to a wall) is built as a trial and parked; nothing of it is in
    the app. Measured: a checkout block in open floor, facing the entrance, becomes option 1 in the
    angled-entrance shop (counter 3100 mm from the door instead of 5801, all 10 fixtures) and in
    the L-shaped shop (2702 instead of 3406, all 17). In the glass-fronted corner shop it is valid
    and nearer (2354 instead of 3163 mm, all 7) but ranks 5th, because it stands in the view
    straight in from the door. Costs: the benchmark shop takes about 2.9 s instead of 2.2 s (the
    budget is 3 s), and it showed that the search's pick between two nearly equal arrangements can
    flip when the same shop is drawn at an angle. Please choose: (a) try the open-floor block
    instead of the third counter wall (no extra time; options from the third wall disappear), (b)
    add it and raise the time budget to 4 s, or (c) leave it until one of your shops needs it.
    Recommended: (a).

17. M3 10e (L-shaped checkout block without a right-angled corner) is parked. Measured on all 7 test
    shops: the two with angled corners (153 and 117 degrees) already have the counter and every
    showcase in one block in their best options; only options 3 and 4 of the angled-wall shop have
    an incomplete block. Turning the block in open floor needs the open-floor block of question 16
    first. Recommended: decide 16 first; then 10e is built only if one of your shops shows a split
    checkout block next to an angled corner.

21. Later item (not for now): textures in Pascal's 3D. They are off since 2026-11-13
    (`decisions/0008`, "No textures in this batch"). They need two things first: (1) texture
    images whose licence is verified, and (2) a way to decode them without `unsafe-eval`. Two
    ways: our own JPG/WebP set through a `pnpm patch` of Pascal's material paths, or a texture
    decoder built without eval. Pascal works without them: walls and floors are plain.

22. Open problem, to fix in phase 2 (owner, 2026-11-13): on Ubuntu CI the Pascal page once reported
    "Instance dropped in popErrorScope" twice (CI run 43522790928 on commit d7a4409, test "no error
    in the Pascal page or its workers"). Seen once in 6 Ubuntu runs; never on Windows CI or the
    owner's laptop.
    - Known: three's WebGPU backend calls `device.popErrorScope().then(...)` without a `catch`. When
      the device or its connection is lost while pipelines are being built, the page gets this
      unhandled error.
    - Not found: why the connection is lost on Ubuntu. Not reproduced on the laptop by killing
      Chromium's GPU process during and after loading, or with one CPU core.
    - The test's failure message now names the canvas kind, Pascal's "[viewer]" log and any
      Chromium child process that ended, so the next failure carries its evidence.
    - Next: reproduce on Linux (WSL Ubuntu 24.04 is on the laptop, with xvfb-run).

Answered by the owner on 2026-11-13 (questions 18 to 20; details in `decisions/0008`):
- 18 (should Pascal's scene be what is edited, with our micrometre document derived from it?): yes. Pascal's scene is edited; our micrometre document is always derived from it by one
  pure, deterministic function in `src/` and never edited by hand. Conditions: a property test
  for the round trip within 1 mm; the fixture node carries only the product id and version
  (unknown stays unknown and cannot be placed); engine, rules and catalog unchanged. Principle 3
  is updated in `CLAUDE.md` and `TEAM_RULES.md`.
- 19 (WebGPU-first 3D; measured 49.9 fps NVIDIA, 48.2 Intel with 60 shelves): yes, WebGPU first. Without WebGPU a clear message, the 2D editor stays fully usable, no
  software rendering.
- 20 (no Arabic in the Pascal editor): yes. The Pascal editor is English only; start, catalog, quotes and the PDF stay Arabic and
  English.

Answered on 2026-11-12 (questions 13 to 17). The owner asked Claude to decide after checking;
each answer is Claude's, with the evidence, and the owner can overrule any of them.
- 14: the website text does not say, so the owner asked Claude to judge from the website photos
  (2026-11-12). The three counter-height glass showcases (`nhf-6ft-extra-view-showcase`,
  `nhf-6ft-full-view-led-lights-showcase`, `nhf-s`) show two back glass panes overlapping like
  sliding doors: served from the back, each with a flag saying it was judged from the photo. The
  Stand showcase (`nhf-s-1`) has hinged doors on its front: stays front, on the wall. The
  "rear sliding doors" in the M3 plan had no source; the plan now says so.
- 15: weights 30/12/8/10/10/15/15. Both trade-off pairs keep today's order (open view at the door
  before the last empty part of the floor; counter near the entrance before a wider view), which
  is usual shop practice. Correction to the earlier claim "moves nothing": option 1 is unchanged in
  every test shop, but lower options reorder in two (angled-entrance options 2 and 3 swap: the one
  using all 6 parts of the floor goes ahead of the one using 4; benchmark: an option using all 9
  parts enters at 3). Measured by comparing every option's placements before and after.
- 16: (a), the open-floor checkout block in place of the third counter wall (no extra time). Built
  and measured on 2026-11-12, then parked again: the block itself lands in the same place in a turned
  shop, but the island rows placed after it do not (l-shape turned 17 degrees: the same strategy
  scores 86.1 instead of 84.3, other rows), so the rotation test fails in 5 cases. Shifting the
  block's grid 1 mm off whole millimetres did not help. In the glass-fronted shop the block is
  nearer (2354 mm against 3163) but ranks 5th: it stands in the view from the door. The code and its
  tests are kept as `docs/parked/m3-10d-open-floor-counter.patch` (apply with `git apply`). Needed
  first: island rows that do not depend on 1 um rounding next to a free-standing block.
- 13: wait until a real shop shows the engine leaving out something a person could fit.
- 17: after 16; built only if a real shop shows a split checkout block at an angled corner.

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

## Hands-on review of the app (2026-11-12)

Claude used the built app like the owner would (Playwright driving the real window, screenshots
read back): typed an 8 x 6 m room, added an entrance door, ran the automatic layout, used an
option, selected a fixture, placed one by hand, switched to 3D and to Arabic. What was wrong or
awkward, most important first. "Fixed" items have a test in `test/e2e/plan-readability.spec.ts`
or the file named.

1. (fixed) The door was invisible on the plan: drawn as a white gap, and the wall's length label sat on
   top of it (a door in the middle of a wall). No swing, no word "Entrance". A fixture placed in
   front of it was reported as "blocks the entrance" with nothing on the plan to show why.
2. (fixed) Fixtures on the plan had no names: a counter, a showcase and a gondola were all plain boxes.
3. (fixed) The walls had no numbers on the plan, but the door form asks for "Door wall" by number.
4. (fixed) The selected fixture's panel and the layout problems were at the bottom of the left column,
   below the four layout options (about 3500 px of page): the owner had to scroll away from the
   plan to edit a fixture or read why it is red.
5. (fixed: "Show option N on the plan") The four layout options cannot be seen before using one; options 1 and 2 had identical
   scores and notes, so they could not be told apart.
6. (fixed) Problems and score notes give lengths in mm whatever unit is chosen ("needs 915 mm clear"
   with the unit set to cm); the score notes stay English in Arabic.
7. (fixed) In Arabic, a product name mixed with numbers is jumbled ("FT FULL VIEW LED lights Showcase، 72 4")
   and "350 cm" reads "cm 350".
8. (fixed: angles start at 90) The wall table starts with empty angle fields: a plain rectangle needs "90" typed four times.
9. (fixed: the problems are listed in the options panel and under the plan) Running the layout in a room without an entrance says only "The room has problems"; the
   problem itself is at the very bottom of the page.
10. (fixed) The 3D view shows no doors or windows.
11. (fixed) The first door of a room without an entrance now starts as the entrance.

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
  CORRECTED in issue 7: that probe used a hidden window. A visible app window falls back to SwiftShader WebGL without any switch; only --disable-gpu --disable-software-rasterizer gives no WebGL (used by the no-WebGL test).
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
- 2026-11-11 M3 issue 5: automatic layout in the worker with progress (after each search block, at most 6) and cancel; same bytes as autoLayout in Node; cancel leaves the file byte-identical. 9 Vitest, 2 e2e; suite 775 Vitest, 93 e2e. Found by the e2e test: a quantity field read its value after React reused the event (page crash); fixed.
- 2026-11-11 M3 issue 6: option picker (score, terms, did not fit, Use option N = one undo step). 52 Vitest, 3 e2e; suite 827 Vitest, 96 e2e. Spec fix ab1cf15 (unknown-size sentence has no count). Limit: score notes stay the engine's English text; translating them needs codes in ScoreTerm (an engine output change, golden hashes move), proposed with 10g.
- 2026-11-11 M3 issue 7: the 3D view (switch, floor, walls, instanced boxes, red problems, Top/Corner camera, no-WebGL message). 4 e2e; suite 827 Vitest, 100 e2e. Test fix 57b421d: the no-WebGL case is --disable-gpu --disable-software-rasterizer (my earlier no-WebGL claim was wrong, see STACK.md), and the read-back waits for the scene to mount.
- 2026-11-11 M3 issue 8: editing in 3D (select, drag on the floor, place by a floor click) through the same commands as 2D. Proof: the same sequence in 2D and in 3D saves byte-identical files. 4 e2e; suite 827 Vitest, 104 e2e. Test fix 8b1ffbc by the main agent (the X field shows "500 cm").
- 2026-11-11 M3 issue 9: model contract (docs/MODEL_CONTRACT.md) and validateModel (src/model-contract, own GLB reader, no dependency). 15 Vitest incl. 2 checks with three's GLTFLoader as the independent measure; suite 842 Vitest. No real model built.
- 2026-11-11 M3 10b: ranking key placed + complete checkout block (decision 0003). 24 Vitest incl. 4 order properties. Layout change: only l-shape-with-column options 2 and 3 swap (both 17 placed; the complete block now first); option 1 unchanged everywhere. Golden + gallery regenerated in their own commit with before/after. The M2-era ranking test was updated to the new rule in its own commit (e23df86).
- 2026-11-11 M3, Windows installed-app job red once (catalog never loaded): two first-start catalog loads raced on the same temporary file (my issue 2 added the second caller). Catalog file operations now queue in call order; 4 concurrency tests red every run before, green after.
- 2026-11-11 M3 10c parked (question 13): no scenario leaves room for more (brute force on small-overfull: 0 extra wall spots in every option); a relocation pass would be speculative.
- 2026-11-11 M3 issue 10f: optional `serviceSide` on products; a rear-served product needs a 915 mm staff zone behind it (never its back to a wall), the engine and the oracle agree, the catalog form has "Served from". No real product set (question 14). One test-writer spec fix: the engine test first also forbade a side flush to a wall. Suite 895 Vitest, 107 e2e.
- 2026-11-11 M3 issue 10d: trial of an open-floor checkout block (facing the entrance first, then side on, then back to it; 200 mm grid, 5 m reach). Measured gains in 2 of 5 shops, +0.6 s on the benchmark, rounding-sensitive search picks (rotation test). Parked with question 16; failing tests kept on the local branch parked/m3-10d (container-local; the spec is in this note and the handoff).
- 2026-11-11 M3 issue 10e: measured, parked (question 17): every shop with an angled corner already has a complete checkout block in its best options; the open-floor turn depends on 10d.
- 2026-11-12 Review of PR 3 (one reviewer, every claim checked by a run): 8 real bugs fixed test-first. Snaps reached across the room (back to back 8 m along a line; wall snap in L-shaped rooms), old layout options could be used on another room, the catalog was read once, a used option kept old product copies, the 3D camera reset on every edit, an orbit drag placed a product, and rear service was accepted for non-freestanding kinds. Not fixed: pointer-cancel during a 3D drag (no deterministic test) and trig outside src/geometry (style). 908 Vitest, 112 e2e.
- 2026-11-12 Questions 13-17 decided by Claude on the owner's request (answers above). 10g done: weights 30/12/8/10/10/15/15, test first (7c12389, architecture test e457834); option 1 unchanged in every shop, golden hashes and gallery regenerated on purpose. 912 Vitest, 112 e2e.
- 2026-11-12 10f on real products: three counter showcases served from the back (judged from the website photos at the owner's request; flagged). The real-products shop changes: option 1 still places 9 of 12 with the counter 2351 mm from the door, now with staff space behind the showcases; options 2 and 3 changed (gallery regenerated).
- 2026-11-12 M3 10d (a) built and parked again: rotation test red in 5 cases (island rows after an open-floor block differ in a turned shop); patch kept in docs/parked/.
- 2026-11-12 Hands-on review of the app (10 findings, NOTES section above). Fixed test-first: door swing and "Entrance" on the plan, wall numbers, labels clear of doors, fixture names, inspector and problems under the plan (7 e2e). 915 Vitest, 119 e2e.
- 2026-11-12 UX round 2: option preview on the plan, problem lengths in the chosen unit, Arabic isolation of lengths and product names, wall-table angles start at 90, room problems named and under the plan, first door is the entrance (6 e2e + 2 test updates). 915 Vitest, 125 e2e.
- 2026-11-12 Owner: adopt shadcn/ui + Tailwind and drei (reverses rulings 4 and 5) and rebuild the UI with them before M4; call it a shop, not a room; licences are no obstacle for personal local use (paid things still need his yes). Plan in handoff.md section 3.
- 2026-11-12 "Shop" in every text the owner reads (en, ar, engine messages). Drawing by mouse fixed (close on first corner, line follows the mouse, grid and scale, Finish explains, labels never overlap, scan findings in the chosen unit). RoomTrace JSON v2 import checked on the owner's sample. 915 Vitest, 131 e2e.
- 2026-11-12 UI rebuilt on Tailwind + shadcn/ui (start screen, title bar, toolbar, cards; same roles and names, so the e2e suite proves it); 3D with drei: walls open at doors and windows, fixture names, contact shadows; score notes worded per code in the chosen language and unit. 919 Vitest, 136 e2e.
- 2026-11-12 Pascal editor trial on the owner's Windows laptop (decision 0008, proposed; branch claude/pascal-foundation): CLI 1.1.4 runs (WebGPU); our Vite host with packages 1.1.4 and no next builds in about 5 s with 0 errors and shows the L-shaped test shop (94.9 m2) in 2D and 3D; (speed figures first written here were browser frames; corrected in the next line). In a locked-down Electron 45 window it renders from file:// with base './', but our CSP blocks WebAssembly and a data: fetch (scene crash) and Pascal fetches textures, icons and the Draco decoder from the internet by default. Open questions 18-20 added. Docs only.
- 2026-11-12 Pascal speed re-measured on the owner's request, counting the frames Pascal really draws (WebGPU getCurrentTexture calls), not browser frames. Pascal caps itself at 50 fps. In a locked-down Electron 45 window with the L-shaped shop plus 60 bookshelf units, orbiting 3 x 5 s on the charger: NVIDIA 49.9 fps, Intel integrated 48.2 fps (19 of 720 frames over 33 ms); Edge on Intel 46.3 fps; walls only 49.4 to 50 everywhere. Slowest run 45.9 fps (target 30). The earlier 238.8 and 81.5 fps were browser animation frames. Table in decision 0008.
- 2026-11-13 Owner answered 18-20 (principle 3 now: Pascal's scene is edited, our document derived). Phase 1 of 0008 built on branch claude/pascal-phase-1:
  - Pascal's editor opens in its own locked-down window from the start screen. It is served as view3d://app/, offline: textures, icons, sounds and decoders are bundled (223 KTX2 textures downloaded once from editor.pascal.app; their original licence is not verified).
  - WebGPU gate with an Arabic/English message.
  - The Pascal page's CSP is ours plus 'wasm-unsafe-eval', connect-src data: and worker-src 'self' blob:; each one was proven necessary.
  - Tests: 936 Vitest; 140 e2e (4 new for Pascal; 2 bridge-list tests now include openPascal). The packaged app passes the Pascal and smoke tests.
- 2026-11-13 Fixes after an independent review of PR #5:
  - three's Basis texture decoder threw EvalError in its workers (it needs unsafe-eval, which is forbidden), and the first test missed it. A new e2e test reads page and worker errors (pageerror plus CDP Log). Textures are now off and not bundled (later item 21).
  - The 223 textures downloaded from Pascal's server were removed from the branch history (rewritten, force-pushed with lease); only icons, sounds and the cursor from Pascal's MIT repository stay, with their sources in STACK.md.
  - The WebGPU gate now asks for an adapter and a device exactly as Pascal does.
  - New guide: docs/UPGRADING_PASCAL.md.
