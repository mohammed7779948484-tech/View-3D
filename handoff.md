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
| 1 catalog | proven locally, CI pending | 35 Vitest + 8 e2e |
| 2 place/move/rotate 2D | in progress | test-writer handoff next |
| 3 live validation | to do | |
| 4 snapping | to do | |
| 5 worker | to do | |
| 6 option picker | to do | |
| 7 3D view | to do | |
| 8 3D select/move | to do | |
| 9 model contract | to do | |
| 10b ranking | to do | |
| 10c swap and relocate | to do | |
| 10d free-standing counter | to do | |
| 10e L-block without right angle | to do | |
| 10f service side | to do | will be parked: owner names rear-access products |
| 10g score weights | to do | will be parked: owner looks at the gallery |

## 3. Next step
Issue 2, place / move / rotate / duplicate / delete in 2D on the project screen. Pure parts first:
- `src/rules/snap.ts`: `quarterTurn(room, center, rotationUdeg)` = next rotation counter-clockwise in
  90-degree steps from the nearest wall's angle (distance from the centre to each wall segment; ties
  -> lowest wall index). Hand values (angledWall fixture, wall 2 = 116 565 051 udeg): from 0 at
  (7000, 3800) mm -> 26 565 051 -> 116 565 051 -> 206 565 051 -> 296 565 051 -> 26 565 051;
  rectangular wall: 0 -> 90 000 000.
- `app/renderer/editor-2d/placement-commands.ts`: place (embeds the product from the catalog once),
  move by a snapped delta, rotate (quarterTurn), duplicate (beside along local +x: tower 600 at
  (2000, 300) mm, 0 deg -> (2600, 300); 90 deg -> (2000, 900)), delete; new id = smallest unused p<n>.
  Each is an immer recipe used by 2D now and 3D in issue 8.
- Playwright: place a tower from the catalog list, drag +1000 mm on the 100 mm grid ->
  (3 000 000, 300 000) um, rotate, duplicate, delete; typed x / y / rotation fields exact; save and
  compare with the document by hand. The catalog must be loaded on the project screen (lift it out of
  CatalogScreen into a small store).

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
Traps: Electron needs `--no-sandbox` as root (the e2e launcher adds it). With no GPU there is no
WebGL unless Electron starts with `--enable-unsafe-swiftshader` (tests only).

## 6. Decisions made this milestone
- Catalog: `src/catalog/catalog-file.ts` (pure) + `app/main/catalog-file.ts`; tests isolate it with `launchApp({ userDataDir })` (`--user-data-dir`).
- Worker: `app/renderer/worker/layout.worker.ts` answers with JSON text; same bytes as Node (`docs/STACK.md`).
- 3D: three 0.187.0 + R3F 9.8.2, instanced Lambert boxes, units.ts only conversion; tests read `window.__view3dScene.describe()` (`docs/STACK.md`).
- 10a: layout engine in phase files; `test/layout/golden-hashes.json` guards output (`pnpm snapshots:update` rewrites it).
- Ranking key `placed + complete block`, tie: complete block, then score (`docs/decisions/0003`).
- Catalog file on the laptop, seeded from the repo; Confirm marks a product verified (plan, rulings).
- No drei, no UI kit (`docs/STACK.md`). Red fixtures in 3D. Rear access = staff zone. Software 3D off. Benchmark on Diagnostics.
