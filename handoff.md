# Handoff

## 1. Goal

View-3D is a laptop-only, fully local Electron app for New Horizon Fixture (one user, the shop
owner). He draws or imports a customer's shop, places real fixtures by hand or automatically, and
shows the result in 2D and 3D. Later he exports plans, quotes and images (`CLAUDE.md`,
`docs/plans/M2-M4-plan.md`).

The goal right now is to close Milestone 3 and its polish round, then start Milestone 4 (outputs:
bill of materials, quote, dimensioned PDF sheet, 4K images, project versions, export flows).
Milestone 4 starts only after the owner merges PR 3 and approves the detailed M4 plan.

## 2. Current state

- **Branch and PR:**
  - Branch `claude/milestone-2-delivery-wgd3q6`; head `403c70e` is pushed.
  - Draft PR: https://github.com/mohammed7779948484-tech/View-3D/pull/3. The session is subscribed to it. Only the owner merges.
- **Checks:**
  - 919 Vitest, 136 e2e and typecheck are clean.
  - CI is green on `403c70e`: Ubuntu, Windows, and the Windows installer build and install.
- **Milestone 3 done:**
  - Issues 1 to 9, 10a, 10b, 10f and 10g.
  - The review of PR 3: 8 bugs fixed.
  - Two hands-on UX rounds: plan readability, option preview, units, Arabic, drawing by mouse, labels that never overlap.
  - "Shop" wording everywhere.
  - UI rebuilt on Tailwind + shadcn/ui.
  - 3D with drei: walls open at doors and windows, fixture names, contact shadows.
  - Score notes worded in the chosen language and unit.
- **Parked, with measurements in `docs/NOTES.md`:**
  - 10c: wait for a real shop that needs it.
  - 10d: the open-floor counter. The code and tests are in `docs/parked/m3-10d-open-floor-counter.patch`. The rotation test is red.
  - 10e: after 10d.
- **Owner rulings of 2026-11-12:**
  - Rulings 4 (no drei) and 5 (plain CSS) are reversed.
  - Every text says "shop", never "room".
  - Licences are no obstacle for personal local use; paid things still need his yes.
  - Questions 13 to 17 were decided by Claude at his request: weights 30/12/8/10/10/15/15. The three counter-height showcases are rear-served, judged from the website photos and flagged in the data.
- **Waiting for the owner:**
  - A photo of the "Test 3D speed" result on the laptop.
  - One hour of real use, and his notes.
  - Merging PR 3.
  - Confirmed prices and sizes. Most are unverified; Gondola wood and Showcase 6 feet have no size.

## 3. Active file

Last worked on:
- `app/renderer/view-3d/view-3d.tsx`:
  - `wallPieces()` builds the walls with their openings left open.
  - The drei `Html` labels use a fixed `portal`.
  - `ContactShadows` adds soft shadows.
- Around it:
  - `app/renderer/view-3d/scene-probe.tsx`: `describe()` now also returns `walls`.
  - `app/renderer/view-3d/boxes.ts`: `SceneBox.name`.
  - `src/layout/score.ts` and `types.ts`: `ScoreTerm.code` and `values`.
  - `app/renderer/i18n/messages.ts`: `scoreNoteText`, `lengthText`.
  - `app/renderer/globals.css`: the Tailwind theme and the app's component classes.
  - `app/renderer/components/ui/*`: the shadcn components.

## 4. Change made

This session, all test-first, each with its proving test:

1. **Review of PR 3** (one reviewer, every claim checked): 8 fixes.
   - Snapping reach, in both the back-to-back and the L-room cases.
   - Stale layout options, catalog refresh and product copies.
   - The 3D camera reset, and orbit-drag placing a product.
   - Rear service on non-freestanding products.
2. **Owner questions 13 to 17 decided**:
   - Weights 30/12/8/10/10/15/15. Golden hashes and gallery were regenerated; option 1 is unchanged everywhere.
   - Rear-served counter showcases.
   - 10d (a) built, measured and parked again.
3. **Hands-on review rounds** (findings in `docs/NOTES.md`):
   - The plan shows the door swing, the "Entrance" label, wall numbers and fixture names.
   - The inspector and the problems list sit under the plan.
   - Options can be previewed on the plan.
   - Problem lengths are in the chosen unit, and Arabic text is isolated.
   - Angles start at 90, room problems are named, and the first door is the entrance.
   - Drawing by mouse: close on the first corner, a preview line with its length, a grid and scale, and the reason "Finish" is disabled. Labels never overlap, and the view fits them from the stored outline only. Scan findings are in the chosen unit.
4. **"Shop" in every text**: en and ar strings, and the engine messages.
5. **UI rebuilt with Tailwind 4.3.3 + shadcn/ui** (radix base, new-york, RTL):
   - New start screen, title bar and toolbar, cards.
   - Same roles and names, so the e2e suite proves the screens still work.
   - Dependencies and reasons are in `docs/STACK.md`.
6. **3D with drei 10.7.9**: openings in the walls, fixture names, contact shadows.
7. **Score notes**: code and values from the engine, worded in the app.

## 5. Failed Attempts

- **10d, the open-floor checkout block** (twice):
  - The block itself is rotation-stable, but the island rows placed after it are not. On the L-shape turned 17°, the same strategy scores 86.1 instead of 84.3, so the rotation test fails in 5 cases.
  - A 1 mm grid offset did not help.
  - Parked. The patch is in `docs/parked/`.
- **drei `Html` labels:** the first label mounted was empty. drei's default target changes once the canvas connects its events. Fixed with a fixed `portal` ref.
- **shadcn CLI:** it wrote `import { cn } from "cn"` and added an npm package `cn`. Fixed: imports now use `@/lib/utils` and the package was removed.
- **Wall labels:**
  - Linux metrics: the label covered a door by 0.6 px on Windows. Fixed with wider gaps.
  - Growing the view while a corner was dragged moved the corner by 40 cm. Fixed: the view follows the stored outline only.
- **Button text split into pieces:** flex buttons broke "Place <name>" into separate words for accessibility and Arabic checks. Fixed: the sentence is wrapped in one `span`.
- **Test-writer:** stopped once by the usage limit, resumed with SendMessage. A concurrent build during its e2e run once caused a flaky failure. Never build or launch the app while the test-writer runs e2e.

## 6. Next steps

1. Owner: install from the PR's `package-windows` artifact (`View-3D-installer`) and use it for an hour on a real shop. Send notes and the "Test 3D speed" photo, then merge PR 3.
2. Fix his notes test-first, in parallel with M4.
3. Show the owner the detailed Milestone 4 plan, from `docs/plans/M2-M4-plan.md` section 3, and wait for his go.
   - Start with the spikes: `printToPDF` scale and Arabic, PDF read-back, a 4K off-screen render.
   - Then issues 1 to 7.
4. Before the quote (M4 issue 2): the owner confirms prices and sizes in the catalog. Unknown prices stay marked and are never summed silently.
5. Optional:
   - Real 3D models of the products, made in Blender outside the app (`docs/MODEL_CONTRACT.md`).
   - DXF import from RoomTrace, once he sends a sample.
   - Make the doors in the 3D walls more visible (less transparent walls, a door frame).

**How to resume:**
```bash
pnpm install
node node_modules/electron/install.js   # this container skips Electron's download script; run once
pnpm typecheck && pnpm test
xvfb-run -a pnpm test:e2e
```
Traps:
- Electron needs `--no-sandbox` as root (the e2e launcher adds it).
- A visible window gets software WebGL without a GPU. The no-WebGL case needs `--disable-gpu --disable-software-rasterizer`.
- The test-writer is the only one who writes tests (Sonnet 5.5). Never put secrets in this file.
