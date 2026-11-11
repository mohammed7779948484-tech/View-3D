/** Issue M3-10f: the engine never stands a rear-access product with its back to a wall. */
import { describe, expect, it } from 'vitest';
import { distancePointToSegment, rectCorners, wallSegments } from '../../src/geometry/index';
import { autoLayout } from '../../src/layout/index';
import type { LayoutRequest } from '../../src/layout/index';
import { placedFixtures, defaultConfig, validateLayout } from '../../src/rules/index';
import { testCounterLong, testShowcaseRear, testWallShelf } from '../fixtures/products';
import { protectedDoorway } from '../fixtures/rooms';

const request: LayoutRequest = {
  id: 'rear-service-side',
  name: 'Rear-access showcases in the protected-doorway room (test fixtures)',
  room: protectedDoorway,
  items: [
    { product: testCounterLong, variantId: 'default', quantity: 1 },
    { product: testShowcaseRear, variantId: 'default', quantity: 2 },
    { product: testWallShelf, variantId: 'default', quantity: 2 },
  ],
};

describe('rear-access products in the layout engine', () => {
  const options = autoLayout(request).options;

  it('offers at least one option', () => {
    expect(options.length).toBeGreaterThan(0);
  });

  it('every option passes validateLayout, with both showcases placed', () => {
    for (const option of options) {
      expect(validateLayout(option.document), `option ${option.rank}`).toEqual([]);
      expect(option.document.placements.filter((p) => p.productId === 'test-showcase-rear')).toHaveLength(2);
    }
  });

  it('the back edge of every rear-access showcase is at least 915 mm from every wall', () => {
    const walls = wallSegments(protectedDoorway.outline);
    for (const option of options) {
      const rears = placedFixtures(option.document, defaultConfig).filter((f) => f.product.id === 'test-showcase-rear');
      expect(rears.length).toBeGreaterThan(0);
      for (const f of rears) {
        const [backLeft, backRight] = rectCorners(f.rect);
        for (const wall of walls) {
          for (const corner of [backLeft!, backRight!]) {
            expect(distancePointToSegment(corner, wall.start, wall.end), `option ${option.rank} ${f.placement.id}`).toBeGreaterThanOrEqual(915_000 - 1);
          }
        }
      }
    }
  });
});
