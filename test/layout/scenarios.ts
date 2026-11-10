/** Layout scenarios shared by the engine tests and the snapshot gallery. */
import type { Product } from '../../src/core/index';
import { seedProducts } from '../../src/catalog/index';
import type { LayoutRequest } from '../../src/layout/index';
import type { Room } from '../../src/core/index';
import { toUm } from '../../src/core/index';
import { angledWall, lShapeWithColumn, protectedDoorway, smallRectOverfull } from '../fixtures/rooms';
import {
  testCounterLong,
  testGondolaDouble,
  testGondolaSmall,
  testShowcase,
  testSlatwallPanel,
  testTower,
  testWallShelf,
} from '../fixtures/products';

const item = (product: Product, quantity: number, variantId = product.variants[0]!.id) => ({ product, variantId, quantity });
const seed = (id: string): Product => {
  const product = seedProducts.find((p) => p.id === id);
  if (product === undefined) throw new Error(`no seed product ${id}`);
  return product;
};

export const scenarios: readonly LayoutRequest[] = [
  {
    id: 'l-shape-with-column',
    name: 'L-shaped shop with a column (test fixtures)',
    room: lShapeWithColumn,
    items: [
      item(testCounterLong, 1),
      item(testShowcase, 2),
      item(testWallShelf, 4),
      item(testTower, 2),
      item(testSlatwallPanel, 2),
      item(testGondolaDouble, 4),
      item(testGondolaSmall, 2),
    ],
  },
  {
    id: 'angled-wall',
    name: 'Shop with an angled wall (test fixtures)',
    room: angledWall,
    items: [item(testCounterLong, 1), item(testShowcase, 2), item(testWallShelf, 5), item(testGondolaDouble, 3)],
  },
  {
    id: 'small-overfull',
    name: 'Small shop, more products than fit (test fixtures)',
    room: smallRectOverfull,
    items: [
      item(testCounterLong, 1),
      item(testShowcase, 2),
      item(testWallShelf, 6),
      item(testTower, 3),
      item(testGondolaDouble, 6),
    ],
  },
  {
    id: 'protected-doorway-real-products',
    name: 'Shop with a back-room door (real catalog sizes, unverified)',
    room: protectedDoorway,
    items: [
      item(seed('nhf-c'), 1),
      item(seed('nhf-6ft-extra-view-showcase'), 2),
      item(seed('nhf-6ft-full-view-led-lights-showcase'), 1, 'h42'),
      item(seed('nhf-s-1'), 2),
      item(seed('nhf-g'), 3),
      item(seed('nhf-jan'), 2), // wood gondola: outer width unknown
      item(seed('nhf-s'), 1), // "Showcase 6 feet": no dimensions on the website
    ],
  },
];

const mm = (v: number): number => toUm(v, 'mm');

/** The angled-wall shop with its entrance moved onto the angled wall (wall 2). */
export const angledEntranceRoom: Room = {
  ...angledWall,
  openings: [
    { id: 'entrance', kind: 'door', wallIndex: 2, offsetUm: mm(1700), widthUm: mm(1000), heightUm: mm(2100), sillHeightUm: 0, door: { isEntrance: true, swing: 'in', hinge: 'start' } },
  ],
};

/** Extra scenarios used by tests only (not in the gallery). */
export const angledEntrance: LayoutRequest = {
  id: 'angled-entrance',
  name: 'Entrance on an angled wall (test fixtures)',
  room: angledEntranceRoom,
  items: [item(testCounterLong, 1), item(testShowcase, 1), item(testWallShelf, 4), item(testGondolaDouble, 4)],
};

/** More single-sided shelving than the walls can take: the rest must pair up back to back. */
export const wallsFull: LayoutRequest = {
  id: 'walls-full',
  name: 'More wall shelving than wall (test fixtures)',
  room: {
    outline: [{ x: 0, y: 0 }, { x: mm(8000), y: 0 }, { x: mm(8000), y: mm(8000) }, { x: 0, y: mm(8000) }],
    ceilingHeightUm: mm(3000),
    columns: [],
    openings: [
      { id: 'entrance', kind: 'door', wallIndex: 0, offsetUm: mm(3500), widthUm: mm(1000), heightUm: mm(2100), sillHeightUm: 0, door: { isEntrance: true, swing: 'in', hinge: 'start' } },
    ],
  },
  items: [item(testCounterLong, 1), item(testWallShelf, 24)],
};

/** Speed benchmark from the review: 15 m x 10 m, 35 fixtures. */
export const benchmark: LayoutRequest = {
  id: 'benchmark-15x10',
  name: 'Benchmark 15 m x 10 m, 35 fixtures (test fixtures)',
  room: {
    outline: [{ x: 0, y: 0 }, { x: mm(15000), y: 0 }, { x: mm(15000), y: mm(10000) }, { x: 0, y: mm(10000) }],
    ceilingHeightUm: mm(3000),
    columns: [],
    openings: [
      { id: 'entrance', kind: 'door', wallIndex: 0, offsetUm: mm(7000), widthUm: mm(1000), heightUm: mm(2100), sillHeightUm: 0, door: { isEntrance: true, swing: 'in', hinge: 'start' } },
    ],
  },
  items: [
    item(testCounterLong, 1),
    item(testShowcase, 3),
    item(testWallShelf, 12),
    item(testTower, 3),
    item(testGondolaDouble, 12),
    item(testGondolaSmall, 4),
  ],
};
