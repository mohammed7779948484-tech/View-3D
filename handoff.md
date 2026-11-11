# Handoff: Milestone 3

## 1. Where we are
- Milestone 3 (plan: `docs/plans/M2-M4-plan.md` section 2, with the owner's rulings of 2026-11-11).
- Branch `claude/milestone-2-delivery-wgd3q6` (restarted from `main` after PR #2 merged). Draft PR: see the PR table.
- Last commit: the docs commit that records the M3 rulings.

## 2. Status
| Item | Status | Note |
|---|---|---|
| 10a engine split | in progress | test-writer handoff next |
| Spike: 3D (three + R3F, WebGL) | to do | |
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
10a: test-writer writes (a) a golden SHA-256 of `JSON.stringify(autoLayout(request))` per scenario in
`test/layout/scenarios.ts` (green now, the guard) and (b) a structure test that fails now: no file in
`src/layout` over 400 lines and no `src/layout/engine.ts`. Then split `src/layout/engine.ts` by phase.

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
- Ranking key `placed + complete block`, tie: complete block, then score (`docs/decisions/0003`).
- Catalog file on the laptop, seeded from the repo; Confirm marks a product verified (plan, rulings).
- No drei, no UI kit (`docs/STACK.md`). Red fixtures in 3D. Rear access = staff zone. Software 3D off. Benchmark on Diagnostics.
