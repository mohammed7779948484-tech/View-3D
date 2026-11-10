import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { area2, areaMm2, cross, orientation, type Point } from '../../src/geometry/index.js';
import { L_ROOM, L_ROOM_AREA_UM2, refArea2, refCross } from './rooms.js';

/** The formulas everybody writes first. Kept here to document why they are not used. */
function naiveCross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}
function naiveArea2(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}
function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

const HUNDRED_M = 100_000_000;

describe('exact integer math at 100 m x 100 m (owner requirement)', () => {
  it('area2 of the round 100 m x 100 m shop is exactly 2e16', () => {
    const shop = rect(0, 0, HUNDRED_M, HUNDRED_M);
    expect(area2(shop)).toBe(20_000_000_000_000_000n);
    expect(areaMm2(shop)).toBe(10_000_000_000); // 1e10 mm^2 = 10 000 m^2
  });

  it('area2 of a 99 999 999 x 100 000 001 um shop is exact where naive floating point is WRONG', () => {
    const shop = rect(0, 0, 99_999_999, 100_000_001);
    const exact = 2n * 99_999_999n * 100_000_001n;
    expect(exact).toBe(19_999_999_999_999_998n);
    expect(area2(shop)).toBe(exact);
    // The naive formula silently returns 2e16: 2 um^2 too many, i.e. it cannot tell this shop from the round one.
    expect(naiveArea2(shop)).toBe(20_000_000_000_000_000);
    expect(BigInt(naiveArea2(shop))).not.toBe(exact);
  });

  it('area2 stays exact for shifted, far-offset and skewed 100 m shops', () => {
    const shops: Point[][] = [
      rect(1, 1, 100_000_001, 100_000_001),
      rect(-1, -1, 99_999_998, 99_999_998),
      rect(-99_999_999, -99_999_999, 1, 1),
      rect(-100_000_000, -100_000_000, 100_000_000, 100_000_000), // 200 m, the full coordinate range
      [
        { x: -49_999_999, y: -50_000_001 },
        { x: 50_000_001, y: -50_000_003 },
        { x: 49_999_999, y: 49_999_999 },
        { x: -49_999_997, y: 50_000_001 },
      ],
    ];
    for (const shop of shops) {
      expect(area2(shop)).toBe(refArea2(shop));
      expect(area2([...shop].reverse())).toBe(-refArea2(shop));
    }
    expect(area2(shops[1]!)).toBe(19_999_999_600_000_002n);
    expect(naiveArea2(shops[1]!)).toBe(19_999_999_600_000_000); // wrong by 2
    expect(area2(shops[4]!)).toBe(19_999_999_999_999_992n);
    expect(naiveArea2(shops[4]!)).toBe(19_999_999_999_999_990); // wrong by 2
  });

  it('orientation of three nearly collinear points 1 um apart at 100 m is right where naive floating point is WRONG', () => {
    const o = { x: 1, y: 1 };
    const a = { x: 99_999_999, y: 100_000_000 };
    const b = { x: 100_000_000, y: 100_000_001 };
    // Exact: 99 999 998 * 100 000 000 - 99 999 999 * 99 999 999 = -1  -> b is to the RIGHT of o->a.
    expect(refCross(o, a, b)).toBe(-1n);
    expect(cross(o, a, b)).toBe(-1n);
    expect(orientation(o, a, b)).toBe(-1);
    expect(orientation(o, b, a)).toBe(1);
    // Naive floating point says "collinear".
    expect(naiveCross(o, a, b)).toBe(0);
  });

  it('distinguishes left / on / right for a point moved by 1 um beside a 100 m diagonal', () => {
    const o = { x: -100_000_000, y: -100_000_000 };
    const a = { x: 100_000_000, y: 100_000_000 };
    expect(orientation(o, a, { x: 99_999_999, y: 99_999_999 })).toBe(0);
    expect(orientation(o, a, { x: 99_999_998, y: 99_999_999 })).toBe(1);
    expect(orientation(o, a, { x: 99_999_999, y: 99_999_998 })).toBe(-1);
    expect(cross(o, a, { x: -100_000_000, y: 100_000_000 })).toBe(40_000_000_000_000_000n);
  });
});

describe('exact integer math: basics', () => {
  it('cross and orientation on small numbers', () => {
    expect(cross({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 3 })).toBe(6n);
    expect(orientation({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 3 })).toBe(1);
    expect(orientation({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 0 })).toBe(0);
    expect(orientation({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: -3 })).toBe(-1);
  });

  it('area of the L room is 54 m^2, signed by orientation', () => {
    expect(area2(L_ROOM)).toBe(2n * L_ROOM_AREA_UM2);
    expect(area2([...L_ROOM].reverse())).toBe(-2n * L_ROOM_AREA_UM2);
    expect(areaMm2(L_ROOM)).toBe(54_000_000);
    expect(areaMm2([...L_ROOM].reverse())).toBe(54_000_000);
    expect(area2([])).toBe(0n);
  });

  const coord = fc.integer({ min: -100_000_000, max: 100_000_000 });
  const point = fc.record({ x: coord, y: coord });
  // Points close to each other but far from the origin exercise the fast path next to the slow one.
  const nearPoint = fc
    .tuple(coord, coord, fc.integer({ min: -3, max: 3 }), fc.integer({ min: -3, max: 3 }))
    .map(([x, y, dx, dy]) => ({
      x: Math.max(-100_000_000, Math.min(100_000_000, x + dx)),
      y: Math.max(-100_000_000, Math.min(100_000_000, y + dy)),
    }));

  it('property: cross equals the pure-BigInt reference over the full +-1e8 range', () => {
    fc.assert(
      fc.property(point, point, point, (o, a, b) => {
        const ref = refCross(o, a, b);
        expect(cross(o, a, b)).toBe(ref);
        expect(orientation(o, a, b)).toBe(ref > 0n ? 1 : ref < 0n ? -1 : 0);
      }),
      { seed: 20261110, numRuns: 2000 },
    );
  });

  it('property: cross is exact for nearly collinear triples (scaled copies of one direction, +-3 um)', () => {
    const small = fc.integer({ min: -10_000, max: 10_000 });
    fc.assert(
      fc.property(small, small, fc.integer({ min: 1, max: 9_000 }), nearPoint, (dx, dy, k, jitter) => {
        const o = { x: 0, y: 0 };
        const a = { x: dx * k, y: dy * k };
        const b = { x: dx * 10_000 + (jitter.x % 4), y: dy * 10_000 + (jitter.y % 4) };
        expect(cross(o, a, b)).toBe(refCross(o, a, b));
      }),
      { seed: 20261110, numRuns: 1000 },
    );
  });

  it('property: area2 equals the pure-BigInt reference', () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 0, maxLength: 12 }), (poly) => {
        expect(area2(poly)).toBe(refArea2(poly));
      }),
      { seed: 20261110, numRuns: 500 },
    );
  });
});
