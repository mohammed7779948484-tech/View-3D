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
| Spike: worker from file:// | proven locally, CI pending | worker bytes = Node bytes |
| 1 catalog | in progress | test-writer handoff next |
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
Issue 1, catalog (ruling: one file `userData/catalog.json`, filled from `seedProducts` on first start,
no network; website products `unverified` until Confirm; owner-typed products `verified`).
Test-writer, Vitest `test/catalog/catalog-file.test.ts` for a new `src/catalog/catalog-file.ts`:
file schema `{ schemaVersion: 1, products: Product[] }`; pure edits returning `{ ok, catalog }` or
`{ ok: false, code }`: add (48 x 24 x 38 in -> 1 219 200 / 609 600 / 965 200 um; empty height ->
verification 'unknown', isPlaceable false), duplicate id refused, update, remove, confirm
(unverified -> verified; unknown cannot be confirmed); serialize/parse round trip byte-identical;
a corrupt file -> readable error code. Then Playwright for the panel (add, edit, remove, confirm;
unknown listed greyed out) and for the main-process file (never overwritten when corrupt). Files:
`app/main/catalog-file.ts`, preload `loadCatalog`/`saveCatalog`, `app/shared`, `app/renderer/catalog/`.

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
- Worker: `app/renderer/worker/layout.worker.ts` answers with JSON text; same bytes as Node (`docs/STACK.md`).
- 3D: three 0.187.0 + R3F 9.8.2, instanced Lambert boxes, units.ts only conversion; tests read `window.__view3dScene.describe()` (`docs/STACK.md`).
- 10a: layout engine in phase files; `test/layout/golden-hashes.json` guards output (`pnpm snapshots:update` rewrites it).
- Ranking key `placed + complete block`, tie: complete block, then score (`docs/decisions/0003`).
- Catalog file on the laptop, seeded from the repo; Confirm marks a product verified (plan, rulings).
- No drei, no UI kit (`docs/STACK.md`). Red fixtures in 3D. Rear access = staff zone. Software 3D off. Benchmark on Diagnostics.
