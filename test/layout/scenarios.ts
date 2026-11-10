/** Layout scenarios shared by the engine tests and the snapshot gallery. */
import type { Product } from '../../src/core/index';
import { seedProducts } from '../../src/catalog/index';
import type { LayoutRequest } from '../../src/layout/index';
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
      item(seed('nhf-s-1'), 2),
      item(seed('nhf-jan'), 3),
      item(seed('nhf-g'), 2),
      item(seed('nhf-s'), 1), // "Showcase 6 feet": no dimensions on the website
    ],
  },
];
