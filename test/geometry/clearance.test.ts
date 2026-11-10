import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  distanceSegmentToSegment,
  minBoundaryDistance,
  minClearance,
  rectCorners,
  type Point,
} from '../../src/geometry/index.js';
import { COLUMN, L_ROOM, M, MM, square } from './rooms.js';

const P = (x: number, y: number): Point => ({ x, y });

describe('distanceSegmentToSegment', () => {
  it('parallel, skewed, touching and crossing segments', () => {
    expect(distanceSegmentToSegment(P(0, 0), P(10, 0), P(0, 5), P(10, 5))).toBe(5);
    expect(distanceSegmentToSegment(P(0, 0), P(10, 0), P(13, 4), P(20, 4))).toBe(5);
    expect(distanceSegmentToSegment(P(0, 0), P(10, 0), P(5, 0), P(5, 9))).toBe(0);
    expect(distanceSegmentToSegment(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(0);
    expect(distanceSegmentToSegment(P(0, 0), P(10, 0), P(5, 2), P(5, 9))).toBe(2);
  });
});

describe('minClearance (aisle width between two footprints)', () => {
  it('two gondolas 1200 mm apart leave a 1200 mm aisle', () => {
    const g1 = rectCorners({ center: P(2 * M, 2 * M), widthUm: 1200 * MM, depthUm: 600 * MM, rotationUdeg: 0 });
    const g2 = rectCorners({ center: P(2 * M, 2 * M + 600 * MM + 1200 * MM), widthUm: 1200 * MM, depthUm: 600 * MM, rotationUdeg: 0 });
    expect(minClearance(g1, g2)).toBe(1200 * MM);
    expect(minClearance(g2, g1)).toBe(1200 * MM);
  });

  it('diagonal neighbours: corner to corner', () => {
    expect(minClearance(square(0, 0, 1000), square(1300, 1400, 1000))).toBe(500);
  });

  it('a rotated footprint: corner to edge', () => {
    const box = square(0, 0, 1 * M);
    const diamond = rectCorners({ center: P(2 * M, 500 * MM), widthUm: 1 * M, depthUm: 1 * M, rotationUdeg: 45_000_000 });
    // Diamond's left tip is at x = 2 000 000 - 707 107 = 1 292 893.
    expect(minClearance(box, diamond)).toBe(292_893);
  });

  it('touching, overlapping and nested polygons have zero clearance', () => {
    expect(minClearance(square(0, 0, 1000), square(1000, 0, 1000))).toBe(0); // shared edge
    expect(minClearance(square(0, 0, 1000), square(1000, 1000, 1000))).toBe(0); // shared corner
    expect(minClearance(square(0, 0, 1000), square(500, 500, 1000))).toBe(0); // overlap
    expect(minClearance(square(0, 0, 1000), square(400, 400, 100))).toBe(0); // nested
    expect(minClearance(square(400, 400, 100), square(0, 0, 1000))).toBe(0);
    expect(minClearance(L_ROOM, COLUMN)).toBe(0); // the column stands inside the room
  });

  it('concave polygon: a box sitting in the L notch is measured to the notch walls', () => {
    const box = square(6 * M + 300 * MM, 4 * M + 450 * MM, 1 * M);
    expect(minClearance(L_ROOM, box)).toBe(300 * MM);
  });

  it('minBoundaryDistance measures to the walls even when one polygon is inside the other', () => {
    expect(minBoundaryDistance(L_ROOM, COLUMN)).toBe(2_800_000); // column to the left and bottom walls
    expect(minBoundaryDistance(L_ROOM, square(100 * MM, 3 * M, 500 * MM))).toBe(100 * MM);
  });

  it('property: symmetric, and exact for axis-aligned boxes', () => {
    const boxArb = fc.record({
      x: fc.integer({ min: -5 * M, max: 5 * M }),
      y: fc.integer({ min: -5 * M, max: 5 * M }),
      w: fc.integer({ min: 1, max: 3 * M }),
      h: fc.integer({ min: 1, max: 3 * M }),
    });
    const toPoly = (b: { x: number; y: number; w: number; h: number }) => [P(b.x, b.y), P(b.x + b.w, b.y), P(b.x + b.w, b.y + b.h), P(b.x, b.y + b.h)];
    fc.assert(
      fc.property(boxArb, boxArb, (b1, b2) => {
        const gapX = Math.max(b2.x - (b1.x + b1.w), b1.x - (b2.x + b2.w), 0);
        const gapY = Math.max(b2.y - (b1.y + b1.h), b1.y - (b2.y + b2.h), 0);
        const expected = Math.hypot(gapX, gapY);
        const got = minClearance(toPoly(b1), toPoly(b2));
        expect(got).toBe(minClearance(toPoly(b2), toPoly(b1)));
        expect(Math.abs(got - expected)).toBeLessThanOrEqual(1e-6);
      }),
      { seed: 20261110, numRuns: 2000 },
    );
  });
});
