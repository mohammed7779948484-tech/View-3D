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
| 7 3D view | in progress | test-writer handoff next |
| 8 3D select/move | to do | |
| 9 model contract | to do | |
| 10b ranking | to do | |
| 10c swap and relocate | to do | |
| 10d free-standing counter | to do | |
| 10e L-block without right angle | to do | |
| 10f service side | to do | will be parked: owner names rear-access products |
| 10g score weights | to do | will be parked: owner looks at the gallery |

## 3. Next step
Issue 7, the 3D view of the open project (reuse `app/renderer/view-3d/`: units.ts, boxes.ts
`sceneBoxes(doc)`, fixture-boxes.tsx instanced, scene-probe.tsx). A "2D / 3D" switch on the project
screen; 3D shows the room floor and walls (walls: thin boxes along the outline, ceiling height),
every placement as an exact box, fixtures with a problem in red (ruling), camera: three.js
OrbitControls from three/examples (no drei), presets "Top" and "Corner"; frameloop demand.
No WebGL -> a translated message, 2D keeps working (test: launch WITHOUT --enable-unsafe-swiftshader
on Linux is the no-WebGL case; launch.ts needs an option to leave it out).
Tests (test-writer): Playwright reads `window.__view3dScene.describe()` for a hand-built document on
the angled room: every box equals the document within 1 mm and 1e-4 rad (tower on wall 2 at
(6 731 672, 3 865 836) um, 116 565 051 udeg: corners by hand); problem fixtures marked in the
description (`problem: true`); the switch keeps the document unchanged.

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
