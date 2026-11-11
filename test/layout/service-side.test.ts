/** Issue M3-10f: the engine never stands a rear-access product with its back to a wall. */
import { describe, expect, it } from 'vitest';
import { rectCorners } from '../../src/geometry/index';
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

  it('the 915 mm behind every rear-access showcase is floor inside the room (its back never faces a wall)', () => {
    // The room is the 7000 x 5000 mm rectangle, so "inside or on the outline" is a bounds check.
    const inRoom = (p: { x: number; y: number }): boolean => p.x >= 0 && p.x <= 7_000_000 && p.y >= 0 && p.y <= 5_000_000;
    const FRONT: Record<number, { x: number; y: number }> = {
      0: { x: 0, y: 1 },
      90: { x: -1, y: 0 },
      180: { x: 0, y: -1 },
      270: { x: 1, y: 0 },
    };
    let seen = 0;
    for (const option of options) {
      const rears = placedFixtures(option.document, defaultConfig).filter((f) => f.product.id === 'test-showcase-rear');
      expect(rears.length, `option ${option.rank}`).toBeGreaterThan(0);
      for (const f of rears) {
        const turns = f.rect.rotationUdeg / 1_000_000;
        const front = FRONT[turns];
        expect(front, `option ${option.rank} ${f.placement.id}: quarter turns only`).toBeDefined();
        // The two corners furthest back (smallest dot product with the front direction).
        const dot = (p: { x: number; y: number }): number => p.x * front!.x + p.y * front!.y;
        const back = [...rectCorners(f.rect)].sort((a, b) => dot(a) - dot(b)).slice(0, 2);
        for (const corner of back) {
          const behind = { x: corner.x - front!.x * 915_000, y: corner.y - front!.y * 915_000 };
          expect(inRoom(corner), `option ${option.rank} ${f.placement.id} back corner`).toBe(true);
          expect(inRoom(behind), `option ${option.rank} ${f.placement.id} 915 mm behind ${JSON.stringify(corner)}`).toBe(true);
        }
        seen++;
      }
    }
    expect(seen).toBeGreaterThanOrEqual(2 * options.length);
  });
});
