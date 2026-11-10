# View-3D

3D store-layout planner for New Horizon Fixture: capture a shop of any shape, place real
fixtures by hand or automatically, and export plans and quotes. One JSON design document is the
single source of truth.

## Status

Milestone 1: the headless auto-layout engine. No user interface yet.

- `src/core` - units (integer micrometres) and the design-document schema
- `src/geometry` - exact polygon and rectangle geometry
- `src/catalog` - product model and seed data (website sizes, unverified)
- `src/rules` - planning numbers and layout validation
- `src/layout` - deterministic automatic layout with ranked, explained options
- `src/render-svg` - 2D plan as SVG, PNG export

See the layouts: [snapshots/README.md](snapshots/README.md).
Decisions and research: [NOTES.md](NOTES.md), [STACK.md](STACK.md). Working rules: [TEAM_RULES.md](TEAM_RULES.md).

## Run

```bash
pnpm install
pnpm typecheck
pnpm test
```

Regenerate the snapshot images after an intended change, then review them:

```bash
UPDATE_SNAPSHOTS=1 pnpm test
```
