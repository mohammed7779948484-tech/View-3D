# Architecture

The single source of truth for how the code is organised and grown. If the code and this
document disagree, fix one of them in the same change. `test/architecture/imports.test.ts`
enforces the import rules below.

## 1. The idea in one picture

```
            design document (JSON, integer micrometres)      <- the single source of truth
                               |
   +---------------+-----------+-----------+----------------+
   |               |                       |                |
 rules          layout                 render-svg      (later) 3D view, PDF, BOM
 "is it valid?"  "place it for me"      "draw it"        all read the same document
```

Nothing keeps its own copy of the layout. The 2D plan, the 3D view, the bill of materials and
every export are computed from the document each time. Editing means producing a new document.

## 2. Module map

One package, folders under `src/`. Each folder exports its public API from `index.ts`; import
from the folder's index, not from files inside another folder.

| Folder | Owns | Public API (main names) |
|---|---|---|
| `src/core` | Units and the design-document schema | `toUm`, `fromUm`, `formatLength`, `DesignDocumentSchema`, `parseDesignDocument`, `migrate`, types `DesignDocument`, `Room`, `Opening`, `Product`, `Variant`, `Placement` |
| `src/geometry` | Exact 2D geometry on integer micrometres | `cross`, `orientation`, `area2`, `pointInPolygon`, `validateRoomOutline`, `wallSegments`, `rectCorners`, `rectsOverlap`, `rectInsidePolygon`, `rectIntersectsPolygon`, `minClearance`, `openingSegment`, `doorSwingZone`, `insetPolygon`, `offsetPolygon`, `unionPolygons`, `differencePolygons`, `intersectPolygons` |
| `src/catalog` | The real product list and helpers | `seedProducts`, `findProduct`, `isPlaceable` |
| `src/rules` | Planning numbers and every validity rule | `defaultConfig`, `configSources`, `validateRoom`, `normalizeOutline`, `keepClearZones`, `accessZones`, `validateLayout`, `walkingViolations`, `snapToWall` |
| `src/layout` | Automatic layout | `autoLayout`, `describeObstacles`, types `LayoutRequest`, `LayoutOption`, `LayoutResult` |
| `src/render-svg` | The 2D plan as SVG; PNG export | `renderPlanSvg` (portable), `svgToPng` in `png.ts` (Node only) |

## 3. Dependency direction

An arrow means "may import".

```
core        (imports nothing)
geometry    (imports nothing)
catalog     -> core
rules       -> core, geometry
layout      -> core, geometry, rules
render-svg  -> core, geometry
```

- Nothing under `src/` imports from `test/`.
- `clipper2-ts` is imported only by `src/geometry/clip.ts`; `@resvg/resvg-js` only by
  `src/render-svg/png.ts`. A wrapped library has one importer so it can be replaced in one place.
- `core`, `geometry`, `catalog`, `rules` and `layout` are portable: no Node built-ins and no
  DOM. They must run unchanged in a browser, a Web Worker and Node.
- `rules` does not import `catalog`: rules work on the products embedded in the document.

Adding a folder or an arrow means editing the table in `test/architecture/imports.test.ts` and
this section together.

## 4. Where new code goes

| You are adding | Put it in | And |
|---|---|---|
| A planning number (an aisle width, a depth) | `src/rules/config.ts` with its source in `configSources` | No number inline anywhere else |
| A validity rule | `src/rules/validate.ts` (a new `RuleId`); walking-type rules in `walkingViolations` | A "violates" and a "passes" test in `test/rules`, an oracle case in `test/oracle`, and the engine's local check in `src/layout/engine.ts` if the engine must respect it while placing |
| A check on the room itself | `src/rules/room.ts` (`validateRoom`) | A test per case in `test/rules/room.test.ts` |
| A new kind of fixture behaviour | A field on `Product` in `src/core/schema.ts` (bump nothing unless old documents break; see section 5), then `accessZones` in `src/rules/zones.ts`, then the engine phase that places it | Seed and test fixtures updated |
| A real product | `src/catalog/seed.ts`, website values only, `unverified` until the owner confirms | The table in `test/catalog/seed.test.ts` |
| A layout behaviour | `src/layout/engine.ts`, as a phase or a search dimension | A scenario in `test/layout/scenarios.ts`, a quality test, regenerated snapshots |
| A drawing change | `src/render-svg/plan.ts` | `test/render-svg`, regenerated snapshots |
| A new export (PDF, BOM, quote) | A new folder `src/export-<name>` that reads the document (and `render-svg` for the plan) | Its arrow added in section 3 and in the architecture test |
| Geometry | `src/geometry`, integer in and out | Property tests with fixed seeds |
| The app (Milestone 2 on) | `app/` beside `src/`, see section 9 | It imports the engine; the engine never imports it |

## 5. The design document

- Defined once, in `src/core/schema.ts` (zod). `parseDesignDocument` is the only way in.
- Self-contained: the products used are embedded, so a saved project never changes when the
  catalog changes.
- `schemaVersion` is checked by `migrate`. A change that old files cannot satisfy needs a new
  version and a migration step with a test; an added optional field does not.
- Frames: plan x to the right, y up; room outlines counter-clockwise; wall `i` runs from
  `outline[i]` to `outline[i + 1]`. A fixture's width runs along local +x, its depth along local
  +y, its FRONT faces local +y, and `rotationUdeg` turns it counter-clockwise.
- Derived data (footprints, zones, violations, scores, rows) is never stored in the document.

## 6. Units and precision

See `decisions/0001-units-and-precision.md`. In short: integer micrometres and micro-degrees;
names end in `Um` or `Udeg`; convert at the edges only (`toUm` on input, `formatLength` on
output); never multiply two coordinates outside `src/geometry/exact.ts`; contact tolerance 2 µm;
drawings within 1 mm of the document.

## 7. Conventions

**Naming and files.** Files are lower-case with dashes; one topic per file; a folder's
`index.ts` only re-exports. Types and functions are named for what they are in the shop
("aisle", "wall unit", "checkout block"), not for the algorithm. Every constant is named and
commented; no bare numbers in logic.

**Determinism.** No `Math.random`, no `Date`, no dependence on object key order or on the
order of an input array. Sort before you iterate when order could leak in. Compare distances
used as sort keys in whole millimetres, so a sub-micrometre difference never decides an order.

**Errors.**
- Something the owner or a file can cause (a bad room, an unknown size, a layout that breaks a
  rule) is returned as data with a stable code and a plain-English message: `RoomProblem`,
  `Violation`, `Unplaced`, `{ ok: false, errors }`. Never thrown.
- Something only a programming mistake can cause throws an `Error` (or `RangeError` for a bad
  argument), with a message that names the function.
- Messages are English sentences for now. Each carries a code, so translation (Arabic) can be
  added by code later without touching the logic.

**Tests** (`test/` mirrors `src/`).
- A failing test first, committed on its own, then the change.
- `test/fixtures`: rooms and synthetic products, all `testOnly`. `test/fixtures/rotate.ts`
  turns a whole room, for invariance tests.
- `test/layout/scenarios.ts`: the requests used by engine tests and the gallery.
- `test/oracle`: an independent judge that shares no code with `src/geometry`, `src/rules` or
  `src/layout`, with keep-clear areas worked out by hand per room. New rules get an oracle case.
- `test/snapshots`: SVG snapshots compared as text; see `decisions/0005-snapshots.md`.
- `test/architecture`: the import rules of section 3.
- After writing a test for a rule, break the rule once to see the test fail, then restore it.

## 8. Adding a dependency

1. Check `STACK.md`: is there already an answer for this capability?
2. Write a spike test in `test/spikes/libraries.test.ts` that proves it does the job.
3. Add the entry to `STACK.md`: version, release date, licence, evidence, alternatives, risk.
4. Pin the exact version. Wrap it in one file if it could ever be replaced.
5. Say why in the pull request. Paid or hosted things need the owner's yes first.

## 9. How the app will sit on the engine (Milestones 2 to 4)

Decided in outline (owner, 2026-11-11, `decisions/0007-local-electron-desktop-app.md`); details
in `plans/M2-M4-plan.md`. Nothing here exists yet.

V1 is a laptop-only, fully local **Electron** desktop app (electron-vite + electron-builder).

```
app/                          the desktop app                         imports ->  src/*
  main/                       Electron main process: windows, native open/save dialogs,
                              all disk access, printToPDF (M4)
  preload/                    the narrow, typed API the renderer may call (no Node in the renderer)
  renderer/                   the UI (React)
    state/                    the open document + undo history (the only mutable copy)
    editor-2d/                plan editor (room capture, manual layout)
    view-3d/                  3D view of the same document
    worker/                   runs src/layout off the UI thread
    catalog/  storage/  i18n/ owner's catalog, project files (via preload), Arabic/English
src/                          the engine (this document)              never imports app/
  capture/        (M2)        wall-by-wall entry, closure and diagonal checks   -> core, geometry
  import-scan/    (M2)        one adapter per scan app -> one scan model -> shared normalization
                              -> core, geometry, rules
  export-bom/     (M4)        bill of materials and quote                       -> core
  export-sheet/   (M4)        dimensioned plan sheet as HTML + SVG              -> core, geometry, render-svg
  model-contract/ (M3)        validator for product 3D files                    -> core
```

- The renderer never touches the disk: file access goes through `app/main` behind the preload API.
- The app holds one document in memory and replaces it on every edit; views read it.
- `validateLayout` runs on every edit (36 ms for 40 fixtures today); `autoLayout` runs in a
  worker (`decisions/0006-engine-speed-and-worker.md`).
- The planned `src/` folders above are portable like the rest of `src/`. Each one's import arrow is
  added to section 3 and to `test/architecture/imports.test.ts` in the issue that creates it.
- PDF: the sheet content is portable (`src/export-sheet`); only the final `printToPDF` step lives
  in `app/main`.
- Later (not V1): headless Blender or Python tools can be started by `app/main`; they read the
  same design document and the model contract, nothing else.
