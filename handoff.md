# Handoff: Milestone 3

## 1. Where we are
- Milestone 3 (plan: `docs/plans/M2-M4-plan.md` section 2, with the owner's rulings of 2026-11-11).
- Branch `claude/milestone-2-delivery-wgd3q6` (restarted from `main` after PR #2 merged). Draft PR: see the PR table.
- Draft PR: https://github.com/mohammed7779948484-tech/View-3D/pull/3
- Last commit: the 10a checkpoint (see `git log -1`).

## 2. Status
| Item | Status | Note |
|---|---|---|
| 10a engine split | proven | golden hashes + snapshots unchanged; CI green Ubuntu + Windows |
| Spike: 3D (three + R3F, WebGL) | proven | CI green Ubuntu + Windows; laptop number waits for the owner's run |
| Spike: worker from file:// | proven | worker bytes = Node bytes; CI green |
| 1 catalog | proven | 35 Vitest + 8 e2e; CI green |
| 2 place/move/rotate 2D | proven | 26 Vitest + 12 e2e (incl. 6 drag regression); CI green Ubuntu, Windows, installer |
| 3 live validation | proven | 70 Vitest + 3 e2e; 16.2 ms for 40 fixtures; CI green |
| 4 snapping | proven | 15 Vitest + 2 e2e; CI green |
| 5 worker | proven | 9 Vitest + 2 e2e; same bytes as Node; CI green |
| 6 option picker | proven locally, CI pending | 52 Vitest + 3 e2e |
| 7 3D view | proven locally, CI pending | 4 e2e; boxes = document within 1 mm |
| 8 3D select/move | in progress | test-writer handoff next |
| 9 model contract | to do | |
| 10b ranking | to do | |
| 10c swap and relocate | to do | |
| 10d free-standing counter | to do | |
| 10e L-block without right angle | to do | |
| 10f service side | to do | will be parked: owner names rear-access products |
| 10g score weights | to do | will be parked: owner looks at the gallery |

## 3. Next step
Issue 8, select and move in 3D on the same document. In View3D: clicking a box selects it (R3F
pointer event `instanceId` -> placement id; shares `selectedId` with 2D, so the Selected fixture panel
works in 3D too); dragging a selected box moves it on the floor plane (y = 0): plan point = scene
(x, -z), snapped to the same grid as 2D (`snap` in editor-2d/geometry.ts with the 100 mm grid), the
move = `together(movePlacement, snapPlacement)` exactly as 2D. Proof (test-writer): the same edit
sequence done in 2D and done in 3D (Top view, so screen points map to the floor deterministically:
expose the floor point under a screen point? simpler: drive the 3D drag with the Top view camera and
compute the screen point from the camera in the test via a `window.__view3dScene.screenOf(x, z)`
helper) gives byte-identical saved files: place a Counter via the panel, move +1000 mm x, Rotate 90°,
Duplicate, Delete the copy.

## 4. Waiting for the owner
- Run Diagnostics > Test 3D speed on the laptop once, send a photo (30 fps proof).
- Open questions in `docs/NOTES.md`.

## 5. How to resume
```bash
pnpm install
node node_modules/electron/install.js   # this container skips Electron's download script; run once
pnpm typecheck && pnpm test
xvfb-run -a pnpm test:e2e
```
Traps: Electron needs `--no-sandbox` as root (the e2e launcher adds it). A visible window gets
software WebGL without a GPU; the no-WebGL case needs `--disable-gpu --disable-software-rasterizer`.

## 6. Decisions made this milestone
- 3D: `app/renderer/view-3d/view-3d.tsx`; no-WebGL test = `--disable-gpu --disable-software-rasterizer` (a visible window has software WebGL otherwise).
- Option picker: `useLayoutOption` in placement-commands; `unplacedText` words did-not-fit by code.
- Live validation: `violationText` in `app/renderer/i18n/messages.ts`, keys `violations.<rule>.<detail|default>`.
- 2D editing: commands in `app/renderer/state/placement-commands.ts` (recipes, one undo step each); `quarterTurn` in `src/rules/snap.ts`.
- Catalog: `src/catalog/catalog-file.ts` (pure) + `app/main/catalog-file.ts`; tests isolate it with `launchApp({ userDataDir })` (`--user-data-dir`).
- Worker: `app/renderer/worker/layout.worker.ts` answers with JSON text; same bytes as Node (`docs/STACK.md`).
- 3D: three 0.187.0 + R3F 9.8.2, instanced Lambert boxes, units.ts only conversion; tests read `window.__view3dScene.describe()` (`docs/STACK.md`).
- 10a: layout engine in phase files; `test/layout/golden-hashes.json` guards output (`pnpm snapshots:update` rewrites it).
- Ranking key `placed + complete block`, tie: complete block, then score (`docs/decisions/0003`).
- Catalog file on the laptop, seeded from the repo; Confirm marks a product verified (plan, rulings).
- No drei, no UI kit (`docs/STACK.md`). Red fixtures in 3D. Rear access = staff zone. Software 3D off. Benchmark on Diagnostics.
