# View-3D

3D store-layout planner for New Horizon Fixture: capture a shop of any shape, place real
fixtures by hand or automatically, and export plans and quotes. One JSON design document is the
single source of truth.

## Status

Milestone 1: the headless auto-layout engine. No user interface yet.

- `src/core` - units (integer micrometres) and the design-document schema
- `src/geometry` - exact polygon and rectangle geometry
- `src/catalog` - product model and seed data (website sizes, unverified)
- `src/rules` - planning numbers, room checks and layout validation
- `src/layout` - deterministic automatic layout with ranked, explained options
- `src/render-svg` - 2D plan as SVG, PNG export

See the layouts: [snapshots/README.md](snapshots/README.md).
Documentation: [docs/README.md](docs/README.md) (architecture, decisions, stack, rules, plans).

## Run

```bash
pnpm install
pnpm typecheck
pnpm test
```

Regenerate the snapshot drawings after an intended change, then review them:

```bash
pnpm snapshots:update
```

Render them to PNG for viewing (not committed):

```bash
pnpm snapshots:png
```
