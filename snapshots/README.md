# Snapshot gallery

Every image here is produced by the test suite from a design document. The `.svg` files are the
checked artefacts (compared byte for byte in `pnpm test`); the `.png` files are copies for viewing.
Regenerate with `UPDATE_SNAPSHOTS=1 pnpm test`.

Fixtures marked **TEST** are synthetic and are not real products. Real catalog sizes are marked
**unverified** until the owner confirms them.

## Auto-layout options

Each scenario shows every ranked option, best first. The side panel explains the score and lists
anything that did not fit, with the reason.

### L-shaped shop with a column

![L-shaped shop with a column, option-1](layouts/l-shape-with-column/option-1.png)

![L-shaped shop with a column, option-2](layouts/l-shape-with-column/option-2.png)

![L-shaped shop with a column, option-3](layouts/l-shape-with-column/option-3.png)

![L-shaped shop with a column, option-4](layouts/l-shape-with-column/option-4.png)

### Shop with an angled wall

![Shop with an angled wall, option-1](layouts/angled-wall/option-1.png)

![Shop with an angled wall, option-2](layouts/angled-wall/option-2.png)

![Shop with an angled wall, option-3](layouts/angled-wall/option-3.png)

![Shop with an angled wall, option-4](layouts/angled-wall/option-4.png)

### Small shop, more products than fit

![Small shop, more products than fit, option-1](layouts/small-overfull/option-1.png)

![Small shop, more products than fit, option-2](layouts/small-overfull/option-2.png)

![Small shop, more products than fit, option-3](layouts/small-overfull/option-3.png)

### Shop with a back-room door, real catalog sizes (unverified)

![Shop with a back-room door, real catalog sizes (unverified), option-1](layouts/protected-doorway-real-products/option-1.png)

![Shop with a back-room door, real catalog sizes (unverified), option-2](layouts/protected-doorway-real-products/option-2.png)

![Shop with a back-room door, real catalog sizes (unverified), option-3](layouts/protected-doorway-real-products/option-3.png)

![Shop with a back-room door, real catalog sizes (unverified), option-4](layouts/protected-doorway-real-products/option-4.png)

## Rooms

The four test rooms with their keep-clear zones, and one hand-placed layout with deliberate
mistakes to show how problems are reported.

![angledWall](rooms/angledWall.png)

![lShapeWithColumn-hand-placed](rooms/lShapeWithColumn-hand-placed.png)

![lShapeWithColumn](rooms/lShapeWithColumn.png)

![protectedDoorway](rooms/protectedDoorway.png)

![smallRectOverfull](rooms/smallRectOverfull.png)
