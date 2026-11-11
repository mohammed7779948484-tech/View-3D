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
| 8 3D select/move | proven locally, CI pending | 4 e2e; 2D edit = 3D edit, byte-identical |
| 9 model contract | proven locally, CI pending | 15 Vitest; three's loader agrees |
| 10b ranking | in progress | test-writer handoff next |
| 10c swap and relocate | to do | |
| 10d free-standing counter | to do | |
| 10e L-block without right angle | to do | |
| 10f service side | to do | will be parked: owner names rear-access products |
| 10g score weights | to do | will be parked: owner looks at the gallery |

## 3. Next step
10b, ranking rule (decision 0003, owner ruling): key = placed + (complete checkout block ? 1 : 0),
highest first; tie: complete block first, then higher score, then strategy id (today's last
tie-break). "Complete" = the counter is placed and every requested glass showcase (category
showcase, placement freestanding) stands in `cashWrap`. Make the comparator a pure exported function
in `src/layout/rank.ts` (`compareOptions(a, b, requested)` or on a small key), used by search.ts.
Tests: a comparison table (10 inc, 80) vs (9 comp, 70) -> the 9; (10 inc) vs (8 comp) -> the 10;
(9 comp, 60) vs (9 inc, 90) -> comp; both complete 10 vs 9 -> 10; fast-check: the order is a total
order (antisymmetric, transitive on triples, fixed seed). Then regenerate golden hashes and the
gallery only if any scenario's ranking changes, with before/after against snapshots/before-m3.

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
- 3D editing: `BoxEditing` in view-3d.tsx uses the 2D commands; tests drive it via `__view3dScene.screenOf` in Top view.
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
