# Handoff: Milestone 3

## 1. Where we are
- Milestone 3 (plan: `docs/plans/M2-M4-plan.md` section 2, with the owner's rulings of 2026-11-11).
- Branch `claude/milestone-2-delivery-wgd3q6` (restarted from `main` after PR #2 merged). Draft PR: see the PR table.
- Draft PR: https://github.com/mohammed7779948484-tech/View-3D/pull/3
- Last commit: the 10g checkpoint (see `git log -1`). Questions 13-17 decided 2026-11-12 (NOTES, "Answered on 2026-11-12").

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
| 10c swap and relocate | parked (decided: wait) | no shop leaves room for more (measured); waits for a real shop that shows it |
| 10d free-standing counter | parked (a built, rotation red) | patch in docs/parked/m3-10d-open-floor-counter.patch (code + tests); island rows after an open-floor block differ in a turned shop |
| 10e L-block without right angle | parked (decided: after 10d) | no shop gains in its best options (measured) |
| 10f service side | done | proven; the three counter showcases served from the back, judged from the website photos (answer 14); the Stand showcase stays front |
| 10g score weights | done | 30/12/8/10/10/15/15; test 7c12389 (+ e457834); option 1 unchanged everywhere; lower options reorder in angled-entrance and benchmark; golden + gallery regenerated |
| Review of PR 3 | 8 fixes | tests first (26fae27, 70a5128, 8f844bc); 908 Vitest + 112 e2e; open: pointer-cancel in a 3D drag left untested and unfixed |

## 3. Next step (owner, 2026-11-12: polish before Milestone 4)
Owner rulings of 2026-11-12: rulings 4 (no drei) and 5 (plain CSS) are reversed: adopt shadcn/ui +
Tailwind and drei, rebuild the UI with them. The place is a shop, never a "room", in every UI text
(en and ar). Licences: personal local use, so an open-source licence is never a reason to refuse a
tool; paid things still need his yes.
Order:
1. DONE (3cb6cfc) UI wording: "room" -> "shop" everywhere the owner reads (en + ar), tests updated first.
2. DONE 2D editor, found by hand: clicking the first corner does not close the outline; no line follows
   the mouse while drawing; no grid or scale on the empty drawing area; "Finish" is disabled with no
   reason (ceiling height missing); short walls' length labels overlap (imported scan, walls 3-5);
   scan and capture messages say mm whatever the unit.
3. RoomTrace: JSON v2 import works on the owner's sample. RoomTrace also exports DXF/PDF/USDZ
   (forum source only); DXF import waits for a sample file from the owner.
4. Rebuild the UI with shadcn/ui + Tailwind (layout, panels, dialogs) and the 3D with drei (doors
   and windows cut into the walls, fixture names, better light).
5. Score notes worded per term in the chosen language and unit (engine gives values).

## 4. Waiting for the owner
- Run Diagnostics > Test 3D speed on the laptop once, send a photo (30 fps proof).
- Which real products open from the back (he sets it in the catalog form when he checks a unit).
- Merging PR 3.

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
