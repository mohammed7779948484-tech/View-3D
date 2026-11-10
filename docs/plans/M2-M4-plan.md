# Plan for Milestones 2, 3 and 4

**Status:** proposal, waiting for the owner's approval. Nothing here is built.

Rules that apply to every issue below: a failing test first in its own commit; full suite green
on Ubuntu and Windows; every library proven by a spike test and recorded in `../STACK.md`
before it is used; code goes where `../ARCHITECTURE.md` says (the app in `app/`, anything that
must also run without a browser in `src/`).

## Decisions needed from the owner before Milestone 2 starts

1. **Hosting** (section 5). Without it the phone cannot send measurements and the app cannot be
   installed from a link.
2. **Editing layer** (section 4): confirm "our own editor".
3. **Outer width of the wood gondola**, and the other open catalog questions in `../NOTES.md`.

## 1. Milestone 2: app shell, 2D plan editor, room capture

**Goal.** The owner opens the app on his laptop, draws or types a customer's shop, and gets a
correct room in a design document saved as a file. On the phone he can enter the same room wall
by wall.

**Done when**
- a room of any polygon shape, with columns, doors, windows and ceiling height, can be entered
  numerically and drawn, and the result passes `validateRoom`;
- every length shown equals the document within 1 mm, in mm, cm, m, inches or feet;
- the closure check names the suspect wall, the diagonal check works, sanity warnings show;
- the UI runs in Arabic, right to left, and in English;
- projects save to and load from a folder on disk; undo and redo work;
- the phone screen works offline and hands its room over by file, link or QR code (hosted sync
  only if hosting is decided).

**Issues, in order**

| # | Issue | Proving test | Lives in |
|---|---|---|---|
| 1 | App shell: Vite + React, routing, build, CI job | spike tests for each library; Playwright smoke test: the app loads and shows an empty project | `app/` |
| 2 | Document state with undo/redo | unit tests: every edit yields a schema-valid document; undo restores the exact previous JSON | `app/state` |
| 3 | Wall-by-wall capture model (length + angle → polygon) | property tests: entered walls reproduce the polygon within 1 µm per vertex; round trip with `normalizeOutline` | `src/capture` (pure, portable: the phone and the laptop share it) |
| 4 | Closure check that points at the suspect wall | hand-built cases: one wall mistyped by 100 mm or 5°; the check must name that wall and its likely correction | `src/capture` |
| 5 | Diagonal check and sanity warnings | cases: a wrong diagonal flags the room; a 30 mm wall, a 40 m wall, a 2° corner give warnings | `src/capture` |
| 6 | 2D editor: draw and edit the outline with numeric length and angle fields | Playwright: type lengths and angles for the L-shaped fixture room, compare the saved document with the fixture exactly | `app/editor-2d` |
| 7 | Doors, windows, columns, ceiling height | Playwright + `validateRoom`: openings that overhang or overlap are refused with the owner-readable message | `app/editor-2d` |
| 8 | Units and number entry (mm, cm, m, in, ft-in, fractions) | table tests of the parser; what was typed is kept (`Entered`) | `src/core` (parser), `app/` (fields) |
| 9 | Arabic and RTL | Playwright in `ar`: screenshots, mirrored layout, numbers still left-to-right; no untranslated key | `app/i18n` |
| 10 | Save, load, duplicate projects as files | round trip is byte-identical; a file from Milestone 1 loads; a broken file gives a readable error | `app/storage` |
| 11 | Phone capture screen as a PWA | Playwright with a phone viewport, offline: enter a room, export it, import it on the laptop | `app/phone` |
| 12 | Phone → laptop transfer | file, link and QR code round trips; hosted inbox only after the hosting decision | `app/sync` |

**Spikes before use** (each a small passing test, then a `STACK.md` entry): Vite 8 + React 19;
SVG-in-React editing with pointer events on a 200-vertex room at 60 fps on integrated graphics;
zustand + immer patches for undo; react-i18next with `dir="rtl"`; Tailwind 4 logical properties
with Radix; File System Access API with a persisted folder permission in Edge on Windows (and
the fallback: download/upload); vite-plugin-pwa offline start; a QR code library.

**Risks**
- File System Access permission may not persist between sessions on the owner's browser →
  fallback to explicit open/save, tested in the spike.
- Angle entry on site is error-prone → the closure and diagonal checks are issues 4 and 5, before
  the editor, so they are designed on real numbers.
- RTL bugs in a canvas-like editor → the plan itself is never mirrored; only the UI around it.

## 2. Milestone 3: manual layout in 2D and 3D, live validation

**Goal.** The owner places, moves and rotates fixtures in 2D and 3D, sees problems as he works,
and can ask for automatic layouts without the screen freezing.

**Done when**
- fixtures from the catalog can be placed, moved, rotated in 90° steps (relative to the nearest
  wall), duplicated and deleted, in both views, on one shared document;
- every rule of `validateLayout` is shown live, in words, on the fixture concerned;
- wall units snap to walls (`snapToWall`), and single-sided units to each other back to back;
- automatic layout runs in a Web Worker with progress and cancel; picking an option replaces the
  placements and can be undone;
- 3D shows exact-size placeholders and holds 30 frames per second with 60 fixtures on
  integrated graphics;
- the model contract is written and tested with a sample model.

**Issues, in order**

| # | Issue | Proving test | Lives in |
|---|---|---|---|
| 1 | Catalog management: add, edit, remove products and variants | unit tests on the catalog store; unknown sizes stay unplaceable; nothing invented | `app/catalog`, schema in `src/core` |
| 2 | Place, move, rotate in 2D | Playwright drags compared with the document; rotation steps relative to the wall, incl. the angled wall | `app/editor-2d` |
| 3 | Live validation overlay | for each `RuleId`, a hand-built layout shows the message on the right fixture; timing under 50 ms for 40 fixtures | `app/editor-2d`, uses `src/rules` |
| 4 | Snapping to walls and back to back | property tests in `src/rules` (snap result always passes the wall-unit rule); Playwright for the feel | `src/rules`, `app/editor-2d` |
| 5 | Engine in a Web Worker: progress, cancel, same result | the worker's options are byte-identical to `autoLayout` called directly; cancel leaves the document untouched | `app/worker`, `src/layout` unchanged |
| 6 | Option picker with the explained score and "did not fit" | Playwright: pick option 2, undo, redo | `app/` |
| 7 | 3D view with placeholders, camera controls | dimension test: rendered box sizes read back from the scene equal the document within 1 mm; frame-time benchmark on a software renderer as a floor | `app/view-3d` |
| 8 | Selecting and moving in 3D (same document) | an edit in 3D and the same edit in 2D give identical documents | `app/view-3d` |
| 9 | Model contract: units, origin, axes, naming, file format | a sample glTF that follows the contract loads at the right size and place; one that breaks it is refused with the reason | `docs/MODEL_CONTRACT.md`, `src/model-contract` (validator) |
| 10 | Engine quality round 2 from the owner's use (weights, free-standing cash wrap if wanted) | new scenarios and quality tests first | `src/layout` |

**Spikes before use:** three.js + React Three Fiber with the WebGL renderer on integrated
graphics (instanced boxes, 60 fixtures, shadows off/on); a Web Worker built by Vite importing
`src/layout`; glTF loading and bounding-box measurement; `three-mesh-bvh` only if picking is slow.

**Risks**
- 3D on integrated graphics → WebGL, no post-processing, instancing; measured in the spike
  before any feature work.
- Two views editing one document → one store, views are pure functions of it (issue 8 proves it).
- Worker and determinism → issue 5 compares bytes.

## 3. Milestone 4: outputs

**Goal.** From one document the owner produces what he shows and sends to a customer.

**Done when** he can export high-resolution 3D images, a dimensioned 2D plan as PDF (Arabic and
English), and a bill of materials with a quote; and save, load and duplicate whole projects with
their options. Every number in every export is traceable to the document.

**Issues, in order**

| # | Issue | Proving test | Lives in |
|---|---|---|---|
| 1 | Bill of materials from the document | hand-counted documents; unverified prices and sizes are marked; unknown prices are not summed silently | `src/export-bom` |
| 2 | Quote (quantities, prices, totals, customer and shop details) | arithmetic in integer cents, table tests; currency formatting for `ar` and `en` | `src/export-bom`, `app/` |
| 3 | Dimensioned plan PDF | vector output; dimensions read back from the PDF equal the document within 1 mm; scale printed on the sheet is true at A3 and A4 | `src/export-pdf` (reuses `src/render-svg`) |
| 4 | Arabic text in the PDF | shaping and right-to-left order checked on known strings (bidi + embedded font), compared visually and by extracted text | `src/export-pdf` |
| 5 | High-resolution 3D images | image size as requested (e.g. 4K); a fixture's on-image size matches the camera maths within 1 %; same camera gives the same image | `app/view-3d` |
| 6 | Projects: versions and options kept, duplicate, backup as one file | round trips; a zip of a project restores byte-identical documents | `app/storage` |
| 7 | Print and share flows (files only, nothing public) | Playwright: produce the three exports for the real-catalog scenario | `app/` |

**Spikes before use:** pdfkit with an embedded Arabic font plus bidi-js (or jsPDF + svg2pdf.js
if it fails): an Arabic sentence with numbers must extract correctly; reading vector dimensions
back from a PDF in a test; large off-screen WebGL render (4K) on integrated graphics.

**Risks**
- Arabic in PDF is the least certain piece (no library does bidi out of the box) → it is spike
  number one, before any PDF feature.
- 4K off-screen rendering may exceed the integrated GPU's limits → tile rendering as fallback,
  decided in the spike.
- Prices are unverified today → the quote must show that until the owner confirms each price.

## 4. Editing layer: Pascal Editor packages or our own?

Looked at again on 2026-11-10, from the published packages only (downloaded and read, not run):
`@pascal-app/core`, `@pascal-app/viewer`, `@pascal-app/editor`, all version 1.1.0, published
2026-11-10, MIT.

| Criterion | Pascal Editor packages | Our own (SVG 2D + React Three Fiber 3D) |
|---|---|---|
| Numeric length and angle input | **Now present**: `number-input`, `dimension-drive`, `DimensionInput`, measurement tools. (Our earlier spike found none; this has changed.) | To build: plain numeric fields bound to walls. Part of M2 issue 6 |
| Our JSON as the single source of truth | Its own scene store (`createSceneStore`, zustand) with a building schema in floating-point **metres** (walls, roofs, slabs, assemblies; 692 files in core). We would map our integer-micrometre document to its scene and back on every edit, and keep two models in step. Rounding back to our document is where "the measurement is the truth" would be lost | Views read our document directly. No adapter, no second model |
| Arabic and RTL | Locales shipped: en, ja, es, fr, zh-CN. No Arabic and no right-to-left handling found in the sources | Built in from the first screen (M2 issue 9) |
| Performance on integrated graphics | The viewer uses the WebGPU renderer and post-processing. Not measured on the owner's class of machine; heavy for placeholder boxes | WebGL, instanced boxes, no post-processing; measured in a spike before use |
| Effort and weight | `@pascal-app/editor` is 15 MB unpacked, ships as source, requires Next.js ≥ 15 as a peer (27 files import `next/*`) and brings about 40 dependencies (IFC converter, Manifold, audio, …). Its UI is for architecture: roofs, levels, materials. We would spend the effort hiding and adapting | More code to write for editing, but only what a shop planner needs, and the engine, rules and plan drawing already exist |

**Recommendation: build our own editor.** The numeric-input gap has closed, but the other four
criteria still point the same way: two sources of truth with a lossy adapter, no Arabic or RTL,
a Next.js requirement that conflicts with a local-first Vite app, and a heavy architectural UI.
What stays worth borrowing is ideas, not code: their dimension-drive interaction for typing a
wall length while drawing.

Not measured: Pascal's frame rate on integrated graphics. That would need running it, which the
brief ruled out.

## 5. Hosting: what the phone sync needs

Nothing is hosted today. The owner decides.

**What must be provided**

| Need | Why |
|---|---|
| Static HTTPS hosting for the app | A PWA can only be installed and updated from an HTTPS address |
| A small "inbox" the phone can write to and the laptop can read and empty | The laptop may be off or on another network when the measurement is taken |
| One shared secret, no accounts | One user; the phone and laptop are paired once by QR code |
| Encryption on the phone before upload | The host never sees the measurements |
| Free tier that does not pause | The shop may not use it for weeks |

**Options**

| Option | Static site | Inbox | Limits that matter | Notes |
|---|---|---|---|---|
| Cloudflare Pages + Worker + D1 (current proposal) | unmetered | 100 000 requests/day, 5 GB | none at this scale; does not pause | One vendor for both parts |
| GitHub Pages + no inbox | 1 GB site, 100 GB/month | none | — | Transfer by file, link or QR code only. Zero services to run |
| Supabase free | no (needs another host) | 500 MB database | **pauses after 7 days idle** | Poor fit for occasional use |
| Firebase Spark | yes | 20 000 writes/day | stops at quota | Google account, more lock-in |

Whatever is chosen, the file / link / QR path stays as the fallback and is built first (M2
issue 12), so the product never depends on a service being up.

## 6. Later: photoreal rendering with headless Blender

Out of scope for V1; the design stays ready for it.

- Blender cannot run inside a PWA. It will run on the owner's machine through a Tauri wrapper or
  a small local helper that the app talks to.
- What it needs from us is already how the project is shaped: one JSON document, exact
  positions in real units, and a model contract (M3 issue 9) that says how a product's 3D file
  maps to its footprint. A renderer reads the document and the models; nothing else.
- Exports live in `src/export-*` as portable code, so the same scene description can be written
  for Blender from Node as well as from the browser.
- Nothing in Milestones 2 to 4 may put layout data anywhere but the document, or the renderer
  would have a second source of truth.
