# Layout gallery

Every drawing here is produced by the test suite from a design document and compared, as text,
with these committed SVG files on every test run. PNG copies are not committed: make them with
`pnpm snapshots:png`, or download the `snapshot-images` artifact of the CI run.

Fixtures marked **TEST** are synthetic, not real products. Sizes marked **\*** come from the
website and are not yet confirmed by the owner.

## Milestone 3, engine round 2

`before-m3/` freezes every layout as it stood after the engine split (M3 issue 10a, output
unchanged). Each later item of issue 10 that changes a layout adds its own before/after table
here, comparing `before-m3/` with `layouts/`, with the reason for the change.

## Before and after the first review

"Before" is the first engine (frozen under `before/`). "After" follows the owner's review:
one checkout block, single-sided units on walls or back to back, islands on one grid, no orphans,
a clear zone straight in from the entrance, 915 mm aisles, and a search over placement orders.
Only the best-ranked option is shown side by side; all options follow below.

### L-shaped shop with a column

| Before | After |
|---|---|
| ![before](before/l-shape-with-column/option-1.svg) | ![after](layouts/l-shape-with-column/option-1.svg) |

### Shop with an angled wall

| Before | After |
|---|---|
| ![before](before/angled-wall/option-1.svg) | ![after](layouts/angled-wall/option-1.svg) |

### Small shop, more products than fit

| Before | After |
|---|---|
| ![before](before/small-overfull/option-1.svg) | ![after](layouts/small-overfull/option-1.svg) |

### Shop with a back-room door, real catalog sizes (unverified)

| Before | After |
|---|---|
| ![before](before/protected-doorway-real-products/option-1.svg) | ![after](layouts/protected-doorway-real-products/option-1.svg) |

## All ranked options (after)

Options are ranked by fixtures placed, then by score. The side panel explains the score and
lists anything that did not fit, with the causes most positions failed on.

### L-shaped shop with a column

![L-shaped shop with a column, option-1](layouts/l-shape-with-column/option-1.svg)

![L-shaped shop with a column, option-2](layouts/l-shape-with-column/option-2.svg)

![L-shaped shop with a column, option-3](layouts/l-shape-with-column/option-3.svg)

![L-shaped shop with a column, option-4](layouts/l-shape-with-column/option-4.svg)

### Shop with an angled wall

![Shop with an angled wall, option-1](layouts/angled-wall/option-1.svg)

![Shop with an angled wall, option-2](layouts/angled-wall/option-2.svg)

![Shop with an angled wall, option-3](layouts/angled-wall/option-3.svg)

![Shop with an angled wall, option-4](layouts/angled-wall/option-4.svg)

### Small shop, more products than fit

![Small shop, more products than fit, option-1](layouts/small-overfull/option-1.svg)

![Small shop, more products than fit, option-2](layouts/small-overfull/option-2.svg)

![Small shop, more products than fit, option-3](layouts/small-overfull/option-3.svg)

### Shop with a back-room door, real catalog sizes (unverified)

![Shop with a back-room door, real catalog sizes (unverified), option-1](layouts/protected-doorway-real-products/option-1.svg)

![Shop with a back-room door, real catalog sizes (unverified), option-2](layouts/protected-doorway-real-products/option-2.svg)

![Shop with a back-room door, real catalog sizes (unverified), option-3](layouts/protected-doorway-real-products/option-3.svg)

![Shop with a back-room door, real catalog sizes (unverified), option-4](layouts/protected-doorway-real-products/option-4.svg)

## Rooms

The four test rooms with their keep-clear zones, and one hand-placed layout with deliberate
mistakes to show how problems are reported.

![angledWall](rooms/angledWall.svg)

![lShapeWithColumn-hand-placed](rooms/lShapeWithColumn-hand-placed.svg)

![lShapeWithColumn](rooms/lShapeWithColumn.svg)

![protectedDoorway](rooms/protectedDoorway.svg)

![smallRectOverfull](rooms/smallRectOverfull.svg)
