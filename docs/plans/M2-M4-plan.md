# Plan for Milestones 2, 3 and 4

**Status:** proposal, updated with the owner's decisions of 2026-11-11. Nothing here is built.
Milestone 2 does not start until the owner approves this plan.

Rules that apply to every issue below: a failing test first in its own commit; full suite green
on Ubuntu and Windows; every library proven by a spike test and recorded in `../STACK.md`
before it is used; code goes where `../ARCHITECTURE.md` says (the app in `app/`, anything that
must also run without the app in `src/`).

## Owner decisions this plan is built on (2026-11-11)

- **V1 is a laptop-only, fully local desktop app built with Electron** (electron-vite +
  electron-builder; unsigned installer, the one-time SmartScreen warning is accepted). See
  `../decisions/0007-local-electron-desktop-app.md`.
- **Removed from V1:** phone screen, PWA, phone sync, hosting, File System Access API, QR
  transfer, IndexedDB outbox. They are listed under "Future" (section 6).
- **Storage:** project JSON files through native open/save dialogs.
- **PDF:** Electron/Chromium `printToPDF` from our SVG/HTML.
- **Editing layer:** our own editor (section 4).
- **Room input:** numeric wall-by-wall entry and the 2D editor, with closure and diagonal
  checks; plus a scan importer as the last issue of Milestone 2.
- **Not now:** Python, Blender, photoreal rendering. Electron keeps that open.
- **Catalog:** the wood gondola stays unplaceable (outer width unknown); the "4 FT FULL VIEW"
  showcase stays 72 in, pending the owner's final confirmation.

## 1. Milestone 2: desktop app shell, 2D plan editor, room capture

**Goal.** The owner installs the app on his Windows laptop, draws or types a customer's shop,
or imports a room scan, and gets a correct room in a design document saved as a file.

**Done when**
- the app installs from an unsigned Windows installer and starts offline;
- a room of any polygon shape, with columns, doors, windows and ceiling height, can be entered
  numerically and drawn, and the result passes `validateRoom`;
- every length shown equals the document within 1 mm, in mm, cm, m, inches or feet;
- the closure check names the suspect wall, the diagonal check works, sanity warnings show;
- the UI runs in Arabic, right to left, and in English;
- projects open and save as JSON files through native dialogs; undo and redo work;
- a room scan exported by a scan app can be imported, and the app shows what is missing or
  assumed so the owner completes it in the editor.

**Issues, in order** (owner ruling 2026-11-11: worked in the order 1, 2, 3, 4, 5, 8, 10, 6, 7, 9, 11, numbers unchanged, because issue 6 needs the parser of issue 8 and proves itself through the save of issue 10)

| # | Issue | Proving test | Lives in |
|---|---|---|---|
| 1 | Electron shell: electron-vite, main + renderer, build, Windows installer with electron-builder, CI job | spike tests for each library; Playwright-for-Electron smoke test: the packaged app starts and shows the start screen (no document until a room exists); installer builds on the Windows CI job | `app/main`, `app/renderer` |
| 2 | Document state with undo/redo | unit tests: every edit yields a schema-valid document; undo restores the exact previous JSON | `app/renderer/state` |
| 3 | Wall-by-wall capture model (length + angle → polygon) | property tests: entered walls reproduce the polygon within 1 µm per vertex; round trip with `normalizeOutline` | `src/capture` (pure, portable) |
| 4 | Closure check that points at the suspect walls | hand-built cases: one wall mistyped by 100 mm or one corner by 5°; the check returns the smallest set of walls (or corners) that closes the room exactly, each with its correction, and the mistyped one is in that set (walls with a parallel partner cannot be told apart from lengths alone; the diagonal of issue 5 decides) | `src/capture` |
| 5 | Diagonal check and sanity warnings | cases: a wrong diagonal flags the room; the diagonal picks the right wall from issue 4's suspect set; a 30 mm wall, a 40 m wall, a 2° corner give warnings | `src/capture`, thresholds in `src/rules/config.ts` |
| 8 | Units and number entry (mm, cm, m, in, ft-in, fractions) | table tests of the parser; what was typed is kept (`Entered`) | `src/core` (parser), `app/renderer` (fields) |
| 10 | Open, save, save-as and duplicate projects as JSON files via native dialogs | round trip is byte-identical; a file from Milestone 1 loads; a broken file gives a readable error; the renderer never touches the disk directly (main process only, through a narrow preload API) | `app/main` (dialogs, file access), `app/renderer/storage` |
| 6 | 2D editor: draw and edit the outline with numeric length and angle fields | Playwright: type lengths and angles for the L-shaped fixture room, compare the saved document with the fixture exactly | `app/renderer/editor-2d` |
| 7 | Doors, windows, columns, ceiling height | Playwright + `validateRoom`: openings that overhang or overlap are refused with the owner-readable message | `app/renderer/editor-2d` |
| 9 | Arabic and RTL | Playwright in `ar`: screenshots, mirrored layout, numbers still left-to-right; no untranslated key | `app/renderer/i18n` |
| 11 | Scan import (last issue of M2), see below | per-adapter fixture files → the same internal scan model; normalization tests on hand-built messy scans; the RoomTrace sample imports and lists exactly what is missing or assumed | `src/import-scan` (portable), `app/renderer` (review screen) |

**Issue 11 in detail: room-scan importer.** The scan app is **not chosen yet**, and formats
differ per app, so the importer has two layers:

1. **One adapter per scan app**, each mapping that app's file to one internal scan model
   (walls as segments with height, openings with whatever the file knows, source and units).
   Formats: **JSON only in M2, no USDZ.** A DXF adapter waits until a real DXF sample from a
   chosen scan app exists (owner ruling 2026-11-11); no DXF reader is spiked or added before then.
2. **Shared normalization** from the scan model to a room for the editor:
   - order the walls and join them into a closed outline;
   - close small gaps and report each one;
   - attach windows and doors to the nearest wall;
   - list everything missing or assumed, so the owner completes it in the editor. Nothing is
     invented: an unknown sill height or door stays unknown and is shown as such.

   The result goes through `normalizeOutline` and `validateRoom` like any other room.

What a first sample showed (a RoomTrace export, its own schema v2, not Apple's `CapturedRoom`):
walls are unordered and have gaps (one of about 0.47 m, probably an undetected door); `doors`
and `floorPolygon` are empty; windows carry only centre, width and height, with no wall
reference and no sill height. The normalization rules above come from that sample, and it
becomes a test fixture. Other apps will need their own adapter and their own fixture.

**Spikes before use** (each a small passing test, then a `STACK.md` entry): electron-vite with
React 19; electron-builder producing an unsigned NSIS installer on the Windows CI job;
Playwright driving the Electron app; SVG-in-React editing with pointer events on a 200-vertex
room at 60 fps on integrated graphics; zustand + immer with a stack of whole-document snapshots for undo (owner ruling 2026-11-11, instead of patches); react-i18next with
`dir="rtl"`; Tailwind 4 logical properties with Radix. (The DXF reader spike is dropped until a
real DXF sample exists.)

**Detail rulings (owner, 2026-11-11)**
- Every UI string goes through `t()` from issue 1; English only until issue 9 adds Arabic.
- No document exists until a room does: the app starts on a start screen (`document: null`).
- Scan windows with an unknown sill height stay "pending" until the owner types it; no schema change.
- Room checks added in issue 7: a window whose top is above the ceiling, a column outside the
  room. `RoomProblem` gains numeric fields so messages can be translated by code (issue 9).
- Issue 10 asks "Save changes?" before closing with unsaved edits.
- Columns are rectangles only in V1. Default unit cm, switchable. Digits 0-9 in both languages;
  Eastern Arabic digits are accepted as input.
- `pnpm test` stays Vitest; `pnpm test:e2e` builds and runs Playwright; both must be green.
- Capture thresholds are our own first guess until the owner confirms them (`../NOTES.md`).
- The Windows packaging CI job runs only when `app/`, `package.json`, the lockfile or
  `electron-builder.yml` change.

**Risks**
- Unsigned installer: SmartScreen warns once. Accepted by the owner; the install note must show
  the two clicks needed.
- Updates: without signing, auto-update is limited. V1 ships a new installer by hand; revisit
  with the owner if that becomes a burden.
- Electron size (about 100 MB or more) and a new major every 8 weeks: pin the version, update on
  purpose.
- Scan formats are unknown until the app is chosen: the adapter layer isolates that; only the
  RoomTrace adapter can be built and tested now.
- Scans are less accurate than a tape measure: the importer never silently "fixes" lengths; the
  closure and diagonal checks (issues 4 and 5) run on imported rooms too.
- Angle entry is error-prone: issues 4 and 5 come before the editor, so they are designed on
  real numbers.
- RTL in a canvas-like editor: the plan itself is never mirrored; only the UI around it.

## 2. Milestone 3: manual layout in 2D and 3D, live validation

**Goal.** The owner places, moves and rotates fixtures in 2D and 3D, sees problems as he works,
and can ask for automatic layouts without the window freezing.

**Done when**
- fixtures from the catalog can be placed, moved, rotated in 90° steps (relative to the nearest
  wall), duplicated and deleted, in both views, on one shared document;
- every rule of `validateLayout` is shown live, in words, on the fixture concerned;
- wall units snap to walls (`snapToWall`), and single-sided units to each other back to back;
- automatic layout runs off the UI thread with progress and cancel; picking an option replaces
  the placements and can be undone;
- 3D shows exact-size placeholders and holds 30 frames per second with 60 fixtures on
  integrated graphics;
- the model contract is written and tested with a sample model;
- engine quality round 2 (issue 10) is done.

**Issues, in order**

| # | Issue | Proving test | Lives in |
|---|---|---|---|
| 1 | Catalog management: add, edit, remove products and variants | unit tests on the catalog store; unknown sizes stay unplaceable; nothing invented | `app/renderer/catalog`, schema in `src/core` |
| 2 | Place, move, rotate in 2D | Playwright drags compared with the document; rotation steps relative to the wall, incl. the angled wall | `app/renderer/editor-2d` |
| 3 | Live validation overlay | for each `RuleId`, a hand-built layout shows the message on the right fixture; timing under 50 ms for 40 fixtures | `app/renderer/editor-2d`, uses `src/rules` |
| 4 | Snapping to walls and back to back | property tests in `src/rules` (snap result always passes the wall-unit rule); Playwright for the feel | `src/rules`, `app/renderer/editor-2d` |
| 5 | Engine off the UI thread (Web Worker in the renderer): progress, cancel, same result | the worker's options are byte-identical to `autoLayout` called directly; cancel leaves the document untouched | `app/renderer/worker`, `src/layout` unchanged |
| 6 | Option picker with the explained score and "did not fit" | Playwright: pick option 2, undo, redo | `app/renderer` |
| 7 | 3D view with placeholders, camera controls | dimension test: rendered box sizes read back from the scene equal the document within 1 mm; frame-time benchmark | `app/renderer/view-3d` |
| 8 | Selecting and moving in 3D (same document) | an edit in 3D and the same edit in 2D give identical documents | `app/renderer/view-3d` |
| 9 | Model contract: units, origin, axes, naming, file format | a sample glTF that follows the contract loads at the right size and place; one that breaks it is refused with the reason | `docs/MODEL_CONTRACT.md`, `src/model-contract` (validator) |
| 10 | Engine quality round 2, see below | new scenarios and quality tests first, for each sub-item | `src/layout`, `src/rules`, `src/core` |

**Issue 10 in detail: engine quality round 2** (owner decisions; no code before M3). Each
sub-item gets its own failing test and its own pair of commits.

- **10a. Split `src/layout/engine.ts` by phase** (checkout block, walls, island grid, search,
  scoring, report) with no change in output: the committed snapshots must stay byte-identical.
  Done first, so the items below land in small files.
- **10b. Ranking rule** (owner ruling 2026-11-11, replacing the first wording, which could
  loop). Options are sorted by the key `placed + (complete checkout block ? 1 : 0)`, highest
  first; on a tie a complete block wins, then the higher score. A complete checkout block means
  the counter is placed and every requested glass showcase stands in its block. A fast-check
  property proves the order never loops. Recorded in `../decisions/0003-rule-based-layout-engine.md`.
- **10c. A real swap-and-relocate improvement pass** that fits more fixtures: remove and
  re-place already placed fixtures to make room for unplaced ones, with a fixed step budget (no
  clock), accepted only when the layout stays valid and the count or score rises. Proof: at
  least one scenario places more than today, none places fewer.
- **10d. Counter placement not only parallel to a wall:** a free-standing or angled cash wrap
  near the entrance, with staff space behind.
- **10e. L-shaped checkout blocks without a right-angled inside corner:** the block turns in
  open floor or at an angled corner.
- **10f. Product "service side".** A new product field saying whether the fixture is served
  from the front or from the rear. Rear-access showcases (the three counter-height glass
  showcases, judged from the website photos on 2026-11-12) need staff space behind them and must **never** stand with their
  back to a wall. This touches the schema (`src/core`, optional `serviceSide: 'front' | 'rear'`),
  the access zones (`src/rules`: a staff zone behind a rear-access product; no separate rule,
  owner ruling 2026-11-11), the oracle and the engine. Which real products are rear-access is
  product data: the owner confirms each one; until then no seed product carries the field.
- **10g. Score weights** tuned with the owner on the gallery. The weights in code today are
  45 placed, 12 counter near entrance, 8 counter facing, 10 showcases near counter, 10 rows,
  10 even use, 5 open entrance.

**Detail rulings (owner, 2026-11-11, M3 detail plan)**
- Order: 10a, then the 3D and worker spikes, then issues 1 to 6, 7 to 9, 10b to 10g.
- Catalog: one catalog file on the laptop (`userData/catalog.json`, read and written by
  `app/main` through the preload bridge), filled on first start from the seed in the repository
  (no network). Website products stay `unverified` until the owner presses Confirm; products he
  types himself are `verified`. Projects keep their own embedded copy and never change when the
  catalog does.
- No drei (three.js's own camera controls); plain CSS with logical properties and the native
  `<dialog>`, no Tailwind or shadcn.
- 3D shows fixtures with a problem in red; the worded problem list sits beside both views.
- Software 3D (SwiftShader) is not turned on by the shipped app; the tests start Electron with
  `--enable-unsafe-swiftshader`. (Measured later the same day: a visible window falls back to
  Chromium's own software WebGL without any switch; see `../STACK.md`.) With no WebGL the 3D view
  says so and 2D keeps working.
- The "Test 3D speed" benchmark lives on a Diagnostics page.

**Corrections to the table above, found while planning (approved 2026-11-11)**
- Issue 1 needs the catalog file above: `src/catalog` (file schema, pure edits), `app/main`
  (the file), the preload bridge, `app/renderer/catalog`.
- Issue 2: rotation in 90-degree steps relative to the nearest wall is a pure function in
  `src/rules`; every edit is one shared command that the 3D view (issue 8) also calls.
- Issue 3: a `Violation` gains `values` (numbers by name), like `RoomProblem`, so each message is
  translated by code; the English messages stay as they are. `unknown-product` cannot occur in
  the app (the schema refuses such a document), so it is tested in `src/rules` only.
- Issue 4: `snapToWall` must not snap a back across a door (today it can, and the wall-unit rule
  then refuses the result); `snapBackToBack` is new.
- Issue 5: progress needs an optional `onProgress` callback in `src/layout`, which never changes
  the result; cancel ends the worker.
- Issue 6 needs a screen for choosing products and quantities for the automatic layout; picking
  an option also embeds the option's products.
- Issue 7: the 30 fps target on integrated graphics is proven only by the owner's benchmark run;
  CI reports its own (software) numbers.
- Issue 9: glTF's front is +Z, ours is local +y, which is -Z in the scene; the contract states
  the fixed half turn applied when a model is placed.
- 10a is guarded by a hash of the full `autoLayout` output per scenario, not only the SVGs.

**Spikes before use:** three.js + React Three Fiber with the WebGL renderer on integrated
graphics (instanced boxes, 60 fixtures, shadows off/on); a Web Worker built by electron-vite
importing `src/layout`, loaded from `file://` under the app's CSP; glTF loading and
bounding-box measurement; `three-mesh-bvh` only if picking is slow.

**Risks**
- 3D on integrated graphics → WebGL, no post-processing, instancing; measured in the spike
  before any feature work.
- Two views editing one document → one store, views are pure functions of it (issue 8 proves it).
- Worker and determinism → issue 5 compares bytes.
- Issue 10 is large and changes layouts the owner has already seen → every sub-item regenerates
  the gallery with before/after, and 10a is proven by unchanged snapshots.

## 3. Milestone 4: outputs

**Goal.** From one document the owner produces what he shows and sends to a customer.

**Done when** he can export high-resolution 3D images, a dimensioned 2D plan as PDF (Arabic and
English), and a bill of materials with a quote; and save, load and duplicate whole projects with
their options. Every number in every export is traceable to the document.

**Issues, in order**

| # | Issue | Proving test | Lives in |
|---|---|---|---|
| 1 | Bill of materials from the document | hand-counted documents; unverified prices and sizes are marked; unknown prices are not summed silently | `src/export-bom` |
| 2 | Quote (quantities, prices, totals, customer and shop details) | arithmetic in integer cents, table tests; currency formatting for `ar` and `en` | `src/export-bom`, `app/renderer` |
| 3 | Dimensioned plan sheet as HTML + SVG (title block, plan, dimensions, legend), in `ar` and `en` | dimensions read back from the sheet's SVG equal the document within 1 mm; the sheet is a pure function of the document | `src/export-sheet` (reuses `src/render-svg`) |
| 4 | PDF through Electron/Chromium `printToPDF` | page size and scale are true at A3 and A4 (a 1 m scale bar measures 1 m at the stated scale in the PDF); Arabic text extracted from the PDF is correct and in order; output stays vector | `app/main` (printing), `src/export-sheet` (content) |
| 5 | High-resolution 3D images | image size as requested (e.g. 4K); a fixture's on-image size matches the camera maths within 1 %; same camera gives the same image | `app/renderer/view-3d` |
| 6 | Projects: versions and options kept, duplicate, backup as one file | round trips; a backup restores byte-identical documents | `app/main`, `app/renderer/storage` |
| 7 | Print and share flows (files only, nothing public) | Playwright: produce the three exports for the real-catalog scenario | `app/renderer` |

**Why `printToPDF`.** Chromium already shapes Arabic and handles right-to-left text, and it
prints our own SVG as vectors, so the PDF is the same drawing the tests already check. This
replaces the earlier pdfkit + bidi-js proposal. **Fallback note:** if `printToPDF` cannot hold
the scale or the vector output in the spike, pdfkit with an embedded Arabic font plus bidi-js
(or jsPDF + svg2pdf.js) is the fallback; neither is adopted now.

**Spikes before use:** `printToPDF` on an A3 sheet with an Arabic sentence containing numbers:
extracted text must be correct, the scale bar true, the plan vector; reading dimensions back
from a PDF in a test; large off-screen WebGL render (4K) on integrated graphics.

**Risks**
- `printToPDF` ties the PDF to the Electron main process, so it cannot be produced by the
  headless engine alone. The sheet content stays in `src/export-sheet` (portable HTML + SVG);
  only the last step, printing, lives in the app.
- Exact print scale depends on page and margin settings → proven in the spike before any
  feature work.
- 4K off-screen rendering may exceed the integrated GPU's limits → tile rendering as fallback,
  decided in the spike.
- Prices are unverified today → the quote must show that until the owner confirms each price.

## 4. Editing layer: our own editor (confirmed by the owner)

Looked at on 2026-11-10 from the published packages only (downloaded and read, not run):
`@pascal-app/core`, `@pascal-app/viewer`, `@pascal-app/editor`, all version 1.1.0, published
2026-11-10, MIT. The owner confirmed "our own editor" on 2026-11-11. The comparison is kept as
the record of why.

| Criterion | Pascal Editor packages | Our own (SVG 2D + React Three Fiber 3D) |
|---|---|---|
| Numeric length and angle input | Now present: `number-input`, `dimension-drive`, `DimensionInput`, measurement tools. (Our earlier spike found none; this has changed.) | To build: plain numeric fields bound to walls. Part of M2 issue 6 |
| Our JSON as the single source of truth | Its own scene store (`createSceneStore`, zustand) with a building schema in floating-point metres (walls, roofs, slabs, assemblies; 692 files in core). We would map our integer-micrometre document to its scene and back on every edit, and keep two models in step | Views read our document directly. No adapter, no second model |
| Arabic and RTL | Locales shipped: en, ja, es, fr, zh-CN. No Arabic and no right-to-left handling found in the sources | Built in from the first screen (M2 issue 9) |
| Performance on integrated graphics | The viewer uses the WebGPU renderer and post-processing. Not measured on the owner's class of machine | WebGL, instanced boxes, no post-processing; measured in a spike before use |
| Effort and weight | `@pascal-app/editor` is 15 MB unpacked, ships as source, requires Next.js ≥ 15 as a peer (27 files import `next/*`) and brings about 40 dependencies. Its UI is for architecture: roofs, levels, materials | More code to write for editing, but only what a shop planner needs; the engine, rules and plan drawing already exist |

Not measured: Pascal's frame rate on integrated graphics. What stays worth borrowing is ideas,
not code: their dimension-drive interaction for typing a wall length while drawing.

**Update 2026-11-12, see `../decisions/0008-pascal-editor-foundation.md` (proposed).** The owner
reopened this choice: Pascal's packages (1.1.4) as the editing layer inside our Electron app, our
engine connected by a plugin and an adapter. Tried on his laptop: it builds without Next.js, shows
the L-shaped test shop in 2D and 3D, and keeps 46 to 50 fps on the integrated GPU with 60 shelf
units (Pascal caps itself at 50; the target is 30); it needs
CSP and offline-asset work in Electron. Until 0008 is accepted, this section and the plan above
stand; the source-of-truth question (NOTES, question 18) needs the owner's yes first.

## 5. Where the decisions of 2026-11-11 land

| Decision | Where |
|---|---|
| Own editor | M2 issues 6–7, M3 issues 2–4, 7–8 |
| Wood gondola unplaceable; "4 FT FULL VIEW" 72 in pending | catalog seed as it is; `../NOTES.md` |
| Hosting cancelled; phone, PWA, sync removed from V1 | section 6 |
| Electron desktop app, native file dialogs | M2 issues 1 and 10 |
| Scan importer | M2 issue 11 |
| Ranking exception for a complete checkout block | M3 issue 10b |
| Swap-and-relocate pass, free-standing counter, L-blocks without a right angle, service side, engine split | M3 issues 10a, 10c–10f |
| PDF via `printToPDF` | M4 issues 3–4 |

## 6. Future (not in V1)

Kept as a list so they are not forgotten; none is planned or designed.

- **Phone capture screen**, as a PWA or otherwise, for entering measurements on site.
- **Phone → laptop sync** and anything hosted (a static site, a store-and-forward inbox). An
  earlier proposal (Cloudflare Pages + Worker + D1) is recorded in the superseded
  `../decisions/0002-local-web-app-pwa.md`.
- **Browser-only pieces** that went with the PWA: File System Access API, QR or link transfer,
  an IndexedDB outbox.
- **Photoreal rendering** with headless Blender, and any Python tooling. Not now. Electron keeps
  it open: the main process can start a local program, and the design document plus the model
  contract (M3 issue 9) are what such a renderer would read. Until then nothing in Milestones 2
  to 4 may put layout data anywhere but the document.
- **Auto-update and a signed installer**, if shipping installers by hand becomes a burden (this
  costs money, so it needs the owner's yes).
- **Scanning inside our own app** (Apple RoomPlan, LiDAR). V1 only imports files that a
  separate scan app exports.
