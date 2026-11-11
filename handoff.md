# Handoff: Milestone 3

## 1. Where we are
- Milestone 3 (plan: `docs/plans/M2-M4-plan.md` section 2, with the owner's rulings of 2026-11-11).
- Branch `claude/milestone-2-delivery-wgd3q6` (restarted from `main` after PR #2 merged). Draft PR: see the PR table.
- Draft PR: https://github.com/mohammed7779948484-tech/View-3D/pull/3
- Last commit: the 10a checkpoint (see `git log -1`).

## 2. Status
| Item | Status | Note |
|---|---|---|
| 10a engine split | proven | golden hashes + snapshots unchanged; CI pending |
| Spike: 3D (three + R3F, WebGL) | in progress | test-writer handoff next |
| Spike: worker from file:// | to do | |
| 1 catalog | to do | |
| 2 place/move/rotate 2D | to do | |
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
3D spike (plan section 2, rulings): add three 0.187.0, @types/three 0.187.0, @react-three/fiber 9.8.2
(no drei). Test-writer writes `test/spikes/three.spec.ts` (Playwright for Electron): Diagnostics page,
"Test 3D speed" runs 4 setups (instanced/shadows off at 60 and 120 fixtures, shadows on, one mesh each)
of real seed products in a 15 x 10 m room; asserts WebGL2, instance count, draw calls, sizes within 1 mm;
logs frame times. Launcher adds `--enable-unsafe-swiftshader` (tests only). Then STACK.md entry.

## 4. Waiting for the owner
- Nothing new yet. Open questions in `docs/NOTES.md`.

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
- 10a: layout engine in phase files; `test/layout/golden-hashes.json` guards output (`pnpm snapshots:update` rewrites it).
- Ranking key `placed + complete block`, tie: complete block, then score (`docs/decisions/0003`).
- Catalog file on the laptop, seeded from the repo; Confirm marks a product verified (plan, rulings).
- No drei, no UI kit (`docs/STACK.md`). Red fixtures in 3D. Rear access = staff zone. Software 3D off. Benchmark on Diagnostics.
