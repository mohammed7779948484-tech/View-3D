/**
 * SYNTHETIC products for engine tests only. None of these exist in the New Horizon catalog.
 * Every one is `testOnly: true`, has an id starting with `test-` and a name starting with "TEST ".
 * They must never be imported from `src/`.
 */
import { toUm } from '../../src/core/index';
import type { Product } from '../../src/core/index';

const mm = (value: number): number => toUm(value, 'mm');

type Spec = {
  id: string;
  name: string;
  category: Product['category'];
  placement: Product['placement'];
  /** Width (along the front), depth (front to back) and height, in mm. */
  sizeMm: [number, number, number];
  /** Front, back and side clearance, in mm. */
  clearanceMm: [number, number, number];
};

function testProduct(spec: Spec): Product {
  const [width, depth, height] = spec.sizeMm;
  const [front, back, side] = spec.clearanceMm;
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    placement: spec.placement,
    variants: [
      {
        id: 'default',
        label: `${width} x ${depth} x ${height} mm`,
        widthUm: mm(width),
        depthUm: mm(depth),
        heightUm: mm(height),
        entered: {
          width: { value: width, unit: 'mm' },
          depth: { value: depth, unit: 'mm' },
          height: { value: height, unit: 'mm' },
        },
      },
    ],
    clearances: { frontUm: mm(front), backUm: mm(back), sideUm: mm(side) },
    priceCents: null,
    verification: 'verified',
    source: { url: null, dimensionsAsWritten: null },
    flags: ['synthetic test product'],
    testOnly: true,
  };
}

/** Wall shelving unit, tall. */
export const testWallShelf = testProduct({
  id: 'test-wall-shelf',
  name: 'TEST wall shelving unit',
  category: 'gondola',
  placement: 'wall',
  sizeMm: [1200, 400, 2100],
  clearanceMm: [600, 0, 0],
});

/** Thin slatwall panel fixed to a wall. */
export const testSlatwallPanel = testProduct({
  id: 'test-slatwall-panel',
  name: 'TEST slatwall panel',
  category: 'slatwall',
  placement: 'wall',
  sizeMm: [1200, 50, 2400],
  clearanceMm: [600, 0, 0],
});

/** Tall display tower that stands against a wall. */
export const testTower = testProduct({
  id: 'test-tower',
  name: 'TEST display tower',
  category: 'tower',
  placement: 'wall',
  sizeMm: [600, 600, 1900],
  clearanceMm: [600, 0, 0],
});

/** Double-sided gondola, shopped from both long sides. */
export const testGondolaDouble = testProduct({
  id: 'test-gondola-double',
  name: 'TEST double-sided gondola',
  category: 'gondola',
  placement: 'island',
  sizeMm: [1200, 900, 1400],
  clearanceMm: [600, 600, 0],
});

/** Small low gondola (below the tall threshold). */
export const testGondolaSmall = testProduct({
  id: 'test-gondola-small',
  name: 'TEST small gondola',
  category: 'gondola',
  placement: 'island',
  sizeMm: [900, 600, 1350],
  clearanceMm: [600, 600, 0],
});

/** Long sales counter; staff stand behind it. */
export const testCounterLong = testProduct({
  id: 'test-counter-long',
  name: 'TEST long counter',
  category: 'counter',
  placement: 'counter',
  sizeMm: [1800, 600, 1000],
  clearanceMm: [600, 915, 0],
});

/** Freestanding glass showcase. */
export const testShowcase = testProduct({
  id: 'test-showcase',
  name: 'TEST glass showcase',
  category: 'showcase',
  placement: 'freestanding',
  sizeMm: [1500, 500, 1000],
  clearanceMm: [600, 0, 0],
});

/** Freestanding square bin, reachable from every side. */
export const testBin = testProduct({
  id: 'test-bin',
  name: 'TEST freestanding bin',
  category: 'accessory',
  placement: 'freestanding',
  sizeMm: [800, 800, 900],
  clearanceMm: [300, 300, 300],
});

/** All synthetic products, in a fixed order. */
export const testProducts: readonly Product[] = [
  testWallShelf,
  testSlatwallPanel,
  testTower,
  testGondolaDouble,
  testGondolaSmall,
  testCounterLong,
  testShowcase,
  testBin,
];
