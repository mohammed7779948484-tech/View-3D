# Handoff: Milestone 3

## 1. Where we are
- Milestone 3 (plan: `docs/plans/M2-M4-plan.md` section 2, with the owner's rulings of 2026-11-11).
- Branch `claude/milestone-2-delivery-wgd3q6` (restarted from `main` after PR #2 merged). Draft PR: see the PR table.
- Draft PR: https://github.com/mohammed7779948484-tech/View-3D/pull/3
- Last commit: the 10e checkpoint (see `git log -1`).

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
| 6 option picker | proven | 52 Vitest + 3 e2e; CI green |
| 7 3D view | proven | 4 e2e; boxes = document within 1 mm; CI green |
| 8 3D select/move | proven | 4 e2e; 2D edit = 3D edit, byte-identical; CI green |
| 9 model contract | proven | 15 Vitest; three's loader agrees; CI green |
| 10b ranking | proven | 24 Vitest; one option pair swapped (gallery); CI green |
| 10c swap and relocate | parked | no shop leaves room for more (measured); owner question 13 |
| 10d free-standing counter | parked | trial measured (gains in 2 shops, +0.6 s benchmark, rounding-sensitive pick); owner question 16 |
| 10e L-block without right angle | parked | no shop gains in its best options (measured); depends on 10d; owner question 17 |
| 10f service side | built, parked | proven, CI green (Ubuntu, Windows, installer); no real product set: owner question 14 |
| 10g score weights | prepared, parked | proposal 30/12/8/10/10/15/15 moves nothing in the test shops; two trade-off pairs in snapshots/README.md; owner question 15 |

## 3. Next step
Every item is proven or parked with an owner question (13 to 17). Next: the owner's answers. If
he picks new weights (15), change `SCORE_WEIGHTS`, regenerate snapshots and golden hashes as an
intended change. If the owner answers question 16 with (a): rebuild 10d. The trial: `placeFreeCashWrap` in
`src/layout/cash-wrap.ts` tries counter + showcases in one line, quarter turns from the entrance
wall (facing it first, then side on, then back to it), 200 mm grid up to 5 m in front of the
entrance, nearest first; `search.ts` adds a 'free' counter candidate and `LayoutStrategy.counterFree`.
Tests: `test/layout/free-counter.test.ts` (on local branch `parked/m3-10d` while this container lives;
its 3000 mm bound for the angled entrance must be 3200 mm: the 3000 came from the counter alone).
The search must then replace its kept arrangement only when the score is better by more than 0.5
(rounding noise), or the rotation tests fail.

## 4. Waiting for the owner
- Run Diagnostics > Test 3D speed on the laptop once, send a photo (30 fps proof).
- Open questions in `docs/NOTES.md` (13: 10c; 14: which products are served from the back; 15: score weights, two pairs to pick; 16: open-floor counter, a/b/c; 17: 10e).

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
- 10f: `serviceSide` optional on Product; a rear product gets a staff zone in `accessZones`; the engine follows through its rule checks.
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
