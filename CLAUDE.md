# View-3D

A 3D store-layout planner for New Horizon Fixture (a store-fixture shop). One user: the shop
owner. He plans a customer's shop (any polygon), places real fixtures by hand or automatically,
and exports plans and quotes. Today the repo holds the headless engine; the app comes in
Milestones 2 to 4 (`docs/plans/M2-M4-plan.md`). V1 is a laptop-only, fully local Electron
desktop app (no phone, PWA, sync or hosting; `docs/decisions/0007-local-electron-desktop-app.md`).

## Principles (non-negotiable)

1. The measurement is the truth: what is drawn matches reality (tolerance 1 mm).
2. Deterministic: same input, same output, byte for byte. No random numbers, no clock.
3. One JSON design document is the single source of truth; 2D, 3D, BOM, exports derive from it.
4. Real products only. Never invent a dimension or price; unknown stays `unknown` and is flagged.
5. A sales tool before a design tool: fast, convincing, Arabic-friendly (RTL).
6. Simple for a non-engineer.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test               # everything; must be green before any push
pnpm snapshots:update   # rewrite the SVG snapshots after an intended change, then review them
pnpm snapshots:png      # render the snapshots to snapshots-png/ (not committed) to look at them
```

## Hard rules

- Read `docs/TEAM_RULES.md` before acting. Never without the owner's yes: hosting or online
  services, anything that costs money, merging PRs, product data and prices, secrets, anything public.
- A failing test first, in its own commit; then the change. Never weaken, skip or delete a test
  to get green. A claim counts only with output from a tool run.
- Put code where `docs/ARCHITECTURE.md` says. `test/architecture/imports.test.ts` enforces the
  import directions; change the document and that test together, on purpose.
- Lengths are integer micrometres. No floating-point products of coordinates: use `src/geometry`.
- No new dependency without a reason in the PR and an entry in `docs/STACK.md`.
- No refactors beyond the issue. No speculative structure.
- No subagents (owner's rule; Sonnet 5.5 if one is ever unavoidable).
- Synthetic products live only in `test/fixtures`, marked `testOnly`.
- CI must be green on Ubuntu and Windows (the owner uses Windows).

## Where things are

- `docs/ARCHITECTURE.md` how the code is organised and where new code goes
- `docs/decisions/` why the key choices were made (short records)
- `docs/STACK.md` every dependency, with alternatives
- `docs/NOTES.md` running log, planning numbers with sources, open questions for the owner
- `docs/plans/` milestone plans
- `snapshots/README.md` the layout gallery
