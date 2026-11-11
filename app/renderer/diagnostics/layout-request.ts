/**
 * The layout speed test's request: a 7 m x 5 m shop with an entrance and a back-room door, and real
 * catalog products with known sizes (website values, unverified). Nothing is invented.
 */
import type { Product } from '../../../src/core/index';
import { seedProducts } from '../../../src/catalog/index';
import type { LayoutRequest } from '../../../src/layout/index';

const MM = 1000;

function seed(id: string): Product {
  const product = seedProducts.find((p) => p.id === id);
  if (product === undefined) throw new Error(`layoutTestRequest: no seed product ${id}`);
  return product;
}
const item = (id: string, variantId: string, quantity: number) => ({ product: seed(id), variantId, quantity });

export function layoutTestRequest(): LayoutRequest {
  return {
    id: 'diagnostics-layout',
    name: 'Layout speed test (real catalog sizes, unverified)',
    room: {
      outline: [
        { x: 0, y: 0 },
        { x: 7000 * MM, y: 0 },
        { x: 7000 * MM, y: 5000 * MM },
        { x: 0, y: 5000 * MM },
      ],
      ceilingHeightUm: 3000 * MM,
      columns: [],
      openings: [
        {
          id: 'entrance',
          kind: 'door',
          wallIndex: 0,
          offsetUm: 3000 * MM,
          widthUm: 1000 * MM,
          heightUm: 2100 * MM,
          sillHeightUm: 0,
          door: { isEntrance: true, swing: 'in', hinge: 'start' },
        },
        {
          id: 'back-room-door',
          kind: 'door',
          wallIndex: 1,
          offsetUm: 3000 * MM,
          widthUm: 900 * MM,
          heightUm: 2100 * MM,
          sillHeightUm: 0,
          door: { isEntrance: false, swing: 'in', hinge: 'start' },
        },
      ],
    },
    items: [
      item('nhf-c', 'default', 1),
      item('nhf-6ft-extra-view-showcase', 'default', 2),
      item('nhf-6ft-full-view-led-lights-showcase', 'h42', 1),
      item('nhf-s-1', 'default', 2),
      item('nhf-g', 'default', 3),
    ],
  };
}
