import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  area2,
  distancePointToSegment,
  inflateRect,
  isCounterClockwise,
  rectCorners,
  rectInsidePolygon,
  rectIntersectsPolygon,
  rectsOverlap,
  wallSegments,
  type OrientedRect,
  type Point,
} from '../../src/geometry/index.js';
import { ANGLED_ROOM, ANGLED_WALL_INDEX, COLUMN, L_ROOM, M, MM, U_ROOM } from './rooms.js';

const P = (x: number, y: number): Point => ({ x, y });
const R = (cx: number, cy: number, widthUm: number, depthUm: number, rotationUdeg = 0): OrientedRect => ({
  center: P(cx, cy),
  widthUm,
  depthUm,
  rotationUdeg,
});
const DEG = 1_000_000;

describe('rectCorners', () => {
  it('unrotated: back-left, back-right, front-right, front-left (front faces +y)', () => {
    expect(rectCorners(R(1000, 2000, 400, 200))).toEqual([P(800, 1900), P(1200, 1900), P(1200, 2100), P(800, 2100)]);
  });

  it('quarter turns are exact', () => {
    expect(rectCorners(R(1000, 2000, 400, 200, 90 * DEG))).toEqual([P(1100, 1800), P(1100, 2200), P(900, 2200), P(900, 1800)]);
    expect(rectCorners(R(1000, 2000, 400, 200, 180 * DEG))).toEqual([P(1200, 2100), P(800, 2100), P(800, 1900), P(1200, 1900)]);
    expect(rectCorners(R(1000, 2000, 400, 200, 270 * DEG))).toEqual([P(900, 2200), P(900, 1800), P(1100, 1800), P(1100, 2200)]);
    // At 100 m, where cos(90 deg) = 6e-17 would otherwise matter after multiplication.
    expect(rectCorners(R(99_000_000, -99_000_000, 2_000_000, 1_000_000, 90 * DEG))).toEqual([
      P(99_500_000, -100_000_000),
      P(99_500_000, -98_000_000),
      P(98_500_000, -98_000_000),
      P(98_500_000, -100_000_000),
    ]);
  });

  it('45 degrees uses trig and rounds to integer um', () => {
    expect(rectCorners(R(0, 0, 2000, 2000, 45 * DEG))).toEqual([P(0, -1414), P(1414, 0), P(0, 1414), P(-1414, 0)]);
  });

  it('never returns negative zero', () => {
    for (const rot of [0, 90, 180, 270, 45]) {
      for (const c of rectCorners(R(0, 0, 0, 0, rot * DEG))) {
        expect(Object.is(c.x, -0) || Object.is(c.y, -0)).toBe(false);
      }
    }
  });

  it('property: quarter turns give integer, counter-clockwise, axis-aligned corners with exactly width x depth area', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -90_000_000, max: 90_000_000 }),
        fc.integer({ min: -90_000_000, max: 90_000_000 }),
        fc.integer({ min: 1, max: 9_999_999 }), // odd sizes included: half-um corners must still round consistently
        fc.integer({ min: 1, max: 9_999_999 }),
        fc.integer({ min: 0, max: 3 }),
        (cx, cy, w, d, q) => {
          const corners = rectCorners(R(cx, cy, w, d, q * 90 * DEG));
          expect(corners).toHaveLength(4);
          for (const c of corners) expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true);
          expect(area2(corners)).toBe(2n * BigInt(w) * BigInt(d));
          expect(isCounterClockwise(corners)).toBe(true);
          for (let i = 0; i < 4; i++) {
            const a = corners[i]!;
            const b = corners[(i + 1) % 4]!;
            expect(a.x === b.x || a.y === b.y).toBe(true);
          }
          // Back edge (corners 0 -> 1) has the width, side edge (1 -> 2) the depth.
          expect(Math.abs(corners[1]!.x - corners[0]!.x) + Math.abs(corners[1]!.y - corners[0]!.y)).toBe(w);
          expect(Math.abs(corners[2]!.x - corners[1]!.x) + Math.abs(corners[2]!.y - corners[1]!.y)).toBe(d);
        },
      ),
      { seed: 20261110, numRuns: 1000 },
    );
  });

  it('property: any rotation gives counter-clockwise corners within 1 um of the true ones and area within rounding', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10_000, max: 5_000_000 }),
        fc.integer({ min: 10_000, max: 5_000_000 }),
        fc.integer({ min: 0, max: 359_999_999 }),
        (w, d, rot) => {
          const corners = rectCorners(R(3 * M, 3 * M, w, d, rot));
          expect(isCounterClockwise(corners)).toBe(true);
          const exact = w * d;
          const got = Number(area2(corners)) / 2;
          expect(Math.abs(got - exact)).toBeLessThanOrEqual(2 * (w + d) + 4); // perimeter x ~1 um
        },
      ),
      { seed: 20261110, numRuns: 1000 },
    );
  });
});

describe('rectsOverlap (touching is not overlapping)', () => {
  const a = R(0, 0, 1000 * MM, 600 * MM);

  it('two rectangles sharing an edge do not overlap; 1 mm penetration does', () => {
    expect(rectsOverlap(a, R(1000 * MM, 0, 1000 * MM, 600 * MM))).toBe(false); // shared edge
    expect(rectsOverlap(a, R(0, 600 * MM, 1000 * MM, 600 * MM))).toBe(false); // shared edge, other axis
    expect(rectsOverlap(a, R(1000 * MM, 600 * MM, 1000 * MM, 600 * MM))).toBe(false); // shared corner only
    expect(rectsOverlap(a, R(999 * MM, 0, 1000 * MM, 600 * MM))).toBe(true); // 1 mm penetration
    expect(rectsOverlap(a, R(0, 599 * MM, 1000 * MM, 600 * MM))).toBe(true);
    expect(rectsOverlap(a, a)).toBe(true);
    expect(rectsOverlap(a, R(5 * M, 5 * M, 1000 * MM, 600 * MM))).toBe(false);
  });

  it('tolerance: penetration of 2 um or less is not overlap, 3 um is', () => {
    expect(rectsOverlap(a, R(1000 * MM - 1, 0, 1000 * MM, 600 * MM))).toBe(false);
    expect(rectsOverlap(a, R(1000 * MM - 2, 0, 1000 * MM, 600 * MM))).toBe(false);
    expect(rectsOverlap(a, R(1000 * MM - 3, 0, 1000 * MM, 600 * MM))).toBe(true);
    expect(rectsOverlap(a, R(1000 * MM - 1, 0, 1000 * MM, 600 * MM), 0)).toBe(true);
    expect(rectsOverlap(a, R(1000 * MM, 0, 1000 * MM, 600 * MM), 0)).toBe(false);
  });

  it('rotated rectangles: needs the separating axis of the rotated one', () => {
    // 1 m square turned 45 deg: half diagonal 707 107 um.
    expect(rectsOverlap(a, R(500 * MM + 707_107 + 3, 0, 1000 * MM, 1000 * MM, 45 * DEG))).toBe(false); // 3 um gap
    expect(rectsOverlap(a, R(500 * MM + 707_107 - 1000, 0, 1000 * MM, 1000 * MM, 45 * DEG))).toBe(true); // 1 mm in
    // Bounding boxes overlap but the diamond stays clear of a's corner.
    expect(rectsOverlap(a, R(900 * MM, 700 * MM, 1000 * MM, 1000 * MM, 45 * DEG))).toBe(false);
    expect(rectsOverlap(a, R(800 * MM, 600 * MM, 1000 * MM, 1000 * MM, 45 * DEG))).toBe(true);
    // One inside the other.
    expect(rectsOverlap(a, R(0, 0, 100 * MM, 100 * MM, 30 * DEG))).toBe(true);
  });

  const rectArb = fc.record({
    center: fc.record({ x: fc.integer({ min: -3 * M, max: 3 * M }), y: fc.integer({ min: -3 * M, max: 3 * M }) }),
    widthUm: fc.integer({ min: 10 * MM, max: 3 * M }),
    depthUm: fc.integer({ min: 10 * MM, max: 3 * M }),
    rotationUdeg: fc.oneof(fc.integer({ min: 0, max: 3 }).map((q) => q * 90 * DEG), fc.integer({ min: 0, max: 359_999_999 })),
  });

  it('property: symmetric, and a rectangle overlaps itself', () => {
    fc.assert(
      fc.property(rectArb, rectArb, fc.integer({ min: 0, max: 5 }), (r1, r2, tol) => {
        expect(rectsOverlap(r1, r2, tol)).toBe(rectsOverlap(r2, r1, tol));
        expect(rectsOverlap(r1, r1, tol)).toBe(true);
      }),
      { seed: 20261110, numRuns: 2000 },
    );
  });

  it('property: for quarter-turn rectangles agrees with plain interval arithmetic on the corners', () => {
    const quarter = fc.record({
      center: fc.record({ x: fc.integer({ min: -2000, max: 2000 }), y: fc.integer({ min: -2000, max: 2000 }) }),
      widthUm: fc.integer({ min: 1, max: 1000 }).map((n) => n * 2),
      depthUm: fc.integer({ min: 1, max: 1000 }).map((n) => n * 2),
      rotationUdeg: fc.integer({ min: 0, max: 3 }).map((q) => q * 90 * DEG),
    });
    const box = (r: OrientedRect) => {
      const c = rectCorners(r);
      const xs = c.map((p) => p.x);
      const ys = c.map((p) => p.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    fc.assert(
      fc.property(quarter, quarter, fc.integer({ min: 0, max: 4 }), (r1, r2, tol) => {
        const b1 = box(r1);
        const b2 = box(r2);
        const depthX = Math.min(b1.x1, b2.x1) - Math.max(b1.x0, b2.x0);
        const depthY = Math.min(b1.y1, b2.y1) - Math.max(b1.y0, b2.y0);
        expect(rectsOverlap(r1, r2, tol)).toBe(depthX > tol && depthY > tol);
      }),
      { seed: 20261110, numRuns: 3000 },
    );
  });
});

describe('rectInsidePolygon', () => {
  it('a rectangle flush against a wall, or tucked into a corner, is inside', () => {
    expect(rectInsidePolygon(R(2 * M, 300 * MM, 1200 * MM, 600 * MM), L_ROOM)).toBe(true); // back on the bottom wall
    expect(rectInsidePolygon(R(600 * MM, 300 * MM, 1200 * MM, 600 * MM), L_ROOM)).toBe(true); // in the corner
    expect(rectInsidePolygon(R(300 * MM, 3 * M, 1200 * MM, 600 * MM, 270 * DEG), L_ROOM)).toBe(true); // back on the left wall
    expect(rectInsidePolygon(R(7 * M, 4 * M - 300 * MM, 1200 * MM, 600 * MM, 180 * DEG), L_ROOM)).toBe(true); // under the notch
    expect(rectInsidePolygon(R(6 * M - 300 * MM, 5 * M, 1200 * MM, 600 * MM, 90 * DEG), L_ROOM)).toBe(true); // beside the notch
    // Flush is also inside with zero tolerance: on the boundary counts as inside.
    expect(rectInsidePolygon(R(600 * MM, 300 * MM, 1200 * MM, 600 * MM), L_ROOM, 0)).toBe(true);
    expect(rectInsidePolygon(R(3 * M, 3 * M, 1200 * MM, 600 * MM, 33 * DEG), L_ROOM)).toBe(true); // free standing
  });

  it('poking through a wall by 1 mm is not inside; by 2 um is tolerated, by 3 um is not', () => {
    expect(rectInsidePolygon(R(2 * M, 299 * MM, 1200 * MM, 600 * MM), L_ROOM)).toBe(false);
    expect(rectInsidePolygon(R(2 * M, 300 * MM - 2, 1200 * MM, 600 * MM), L_ROOM)).toBe(true);
    expect(rectInsidePolygon(R(2 * M, 300 * MM - 3, 1200 * MM, 600 * MM), L_ROOM)).toBe(false);
    expect(rectInsidePolygon(R(2 * M, 300 * MM - 1, 1200 * MM, 600 * MM), L_ROOM, 0)).toBe(false);
  });

  it('a rectangle straddling the L notch is not inside, even when all four corners are', () => {
    // Axis-aligned, across the notch wall: two corners are in the notch.
    expect(rectInsidePolygon(R(6 * M, 5 * M, 2 * M, 1 * M), L_ROOM)).toBe(false);
    // Entirely in the notch.
    expect(rectInsidePolygon(R(7_500_000, 5_500_000, 1 * M, 1 * M), L_ROOM)).toBe(false);
    // Turned 45 deg over the reflex corner (6 m, 4 m): all four corners are inside the room,
    // but the corner of the notch is inside the rectangle.
    const diamond = R(5_900_000, 3_900_000, 1_414_214, 1_414_214, 45 * DEG);
    expect(rectCorners(diamond)).toEqual([P(5_900_000, 2_900_000), P(6_900_000, 3_900_000), P(5_900_000, 4_900_000), P(4_900_000, 3_900_000)]);
    expect(rectInsidePolygon(diamond, L_ROOM)).toBe(false);
    // Same idea, moved away from the corner: fine.
    expect(rectInsidePolygon(R(4_900_000, 2_900_000, 1_414_214, 1_414_214, 45 * DEG), L_ROOM)).toBe(true);
  });

  it('U room: a long rectangle bridging the slot has all corners inside but is not inside', () => {
    expect(rectInsidePolygon(R(4_500_000, 5 * M, 5 * M, 1 * M), U_ROOM)).toBe(false);
    expect(rectInsidePolygon(R(4_500_000, 1_500_000, 5 * M, 1 * M), U_ROOM)).toBe(true); // below the slot
    expect(rectInsidePolygon(R(4_500_000, 2_500_000, 5 * M, 1 * M), U_ROOM)).toBe(true); // touching the slot floor
    expect(rectInsidePolygon(R(4_500_000, 2_501_000, 5 * M, 1 * M), U_ROOM)).toBe(false); // 1 mm into the slot
  });

  it('a rectangle larger than the room, or outside it, is not inside', () => {
    expect(rectInsidePolygon(R(4_500_000, 3_500_000, 20 * M, 20 * M), L_ROOM)).toBe(false);
    expect(rectInsidePolygon(R(-5 * M, -5 * M, 1 * M, 1 * M), L_ROOM)).toBe(false);
  });

  it('rotated to an angled wall and placed flush against it: inside, back edge within 2 um of the wall', () => {
    const wall = wallSegments(ANGLED_ROOM)[ANGLED_WALL_INDEX]!;
    const widthUm = 1200 * MM;
    const depthUm = 600 * MM;
    for (const along of [700 * MM, 2 * M, wall.lengthUm - 700 * MM]) {
      const rect: OrientedRect = {
        center: P(
          Math.round(wall.start.x + wall.direction.x * along + wall.inwardNormal.x * (depthUm / 2)),
          Math.round(wall.start.y + wall.direction.y * along + wall.inwardNormal.y * (depthUm / 2)),
        ),
        widthUm,
        depthUm,
        rotationUdeg: wall.angleUdeg, // local +x along the wall, so the back (-y) is on the wall
      };
      expect(rectInsidePolygon(rect, ANGLED_ROOM)).toBe(true);
      const [backLeft, backRight, frontRight, frontLeft] = rectCorners(rect) as [Point, Point, Point, Point];
      expect(distancePointToSegment(backLeft, wall.start, wall.end)).toBeLessThanOrEqual(2);
      expect(distancePointToSegment(backRight, wall.start, wall.end)).toBeLessThanOrEqual(2);
      // The front is a full depth away from the wall.
      expect(Math.abs(distancePointToSegment(frontLeft, wall.start, wall.end) - depthUm)).toBeLessThanOrEqual(2);
      expect(Math.abs(distancePointToSegment(frontRight, wall.start, wall.end) - depthUm)).toBeLessThanOrEqual(2);

      // Pushed 1 mm through the wall: no longer inside.
      const pushed: OrientedRect = {
        ...rect,
        center: P(Math.round(rect.center.x - wall.inwardNormal.x * 1000), Math.round(rect.center.y - wall.inwardNormal.y * 1000)),
      };
      expect(rectInsidePolygon(pushed, ANGLED_ROOM)).toBe(false);
    }
  });

  it('property: agrees with an exact corner + edge check for quarter-turn rectangles, zero tolerance', () => {
    // Reference for axis-aligned boxes in the rectilinear L room: inside iff the box avoids the notch and the outside.
    const inL = (x0: number, y0: number, x1: number, y1: number) =>
      x0 >= 0 && y0 >= 0 && x1 <= 9 * M && y1 <= 7 * M && !(x1 > 6 * M && y1 > 4 * M);
    fc.assert(
      fc.property(
        fc.integer({ min: -2, max: 40 }),
        fc.integer({ min: -2, max: 32 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 3 }),
        (i, j, wi, di, q) => {
          const rect = R(i * 250 * MM, j * 250 * MM, wi * 500 * MM, di * 500 * MM, q * 90 * DEG);
          const c = rectCorners(rect);
          const xs = c.map((p) => p.x);
          const ys = c.map((p) => p.y);
          const expected = inL(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
          expect(rectInsidePolygon(rect, L_ROOM, 0)).toBe(expected);
          expect(rectInsidePolygon(rect, L_ROOM)).toBe(expected); // sizes are whole mm, so 2 um changes nothing
        },
      ),
      { seed: 20261110, numRuns: 3000 },
    );
  });
});

describe('rectIntersectsPolygon (columns, keep-clear zones; touching is not intersecting)', () => {
  it('against the 400 mm column', () => {
    expect(rectIntersectsPolygon(R(3_200_000 + 600 * MM, 3 * M, 1200 * MM, 600 * MM), COLUMN)).toBe(false); // touching side
    expect(rectIntersectsPolygon(R(3_200_000 + 600 * MM - 1 * MM, 3 * M, 1200 * MM, 600 * MM), COLUMN)).toBe(true); // 1 mm in
    expect(rectIntersectsPolygon(R(3_200_000 + 600 * MM - 2, 3 * M, 1200 * MM, 600 * MM), COLUMN)).toBe(false); // 2 um
    expect(rectIntersectsPolygon(R(3_200_000 + 600 * MM - 3, 3 * M, 1200 * MM, 600 * MM), COLUMN)).toBe(true); // 3 um
    expect(rectIntersectsPolygon(R(3_200_000 + 600 * MM, 3_200_000 + 300 * MM, 1200 * MM, 600 * MM), COLUMN)).toBe(false); // corner touch
    expect(rectIntersectsPolygon(R(3 * M, 3 * M, 2 * M, 2 * M), COLUMN)).toBe(true); // column wholly inside the rectangle
    expect(rectIntersectsPolygon(R(3 * M, 3 * M, 100 * MM, 100 * MM), COLUMN)).toBe(true); // rectangle wholly inside the column
    expect(rectIntersectsPolygon(R(3 * M, 3 * M, 400 * MM, 400 * MM), COLUMN)).toBe(true); // identical
    expect(rectIntersectsPolygon(R(6 * M, 1 * M, 1200 * MM, 600 * MM), COLUMN)).toBe(false); // far away
    // Rotated rectangle whose corner pokes into the column, no rectangle corner... and one that just misses.
    expect(rectIntersectsPolygon(R(3_200_000 + 707_107 - 1000, 3 * M, 1 * M, 1 * M, 45 * DEG), COLUMN)).toBe(true);
    expect(rectIntersectsPolygon(R(3_200_000 + 707_107 + 3, 3 * M, 1 * M, 1 * M, 45 * DEG), COLUMN)).toBe(false);
  });

  it('against a concave polygon', () => {
    expect(rectIntersectsPolygon(R(7_500_000, 5_500_000, 1 * M, 1 * M), L_ROOM)).toBe(false); // sits in the notch
    expect(rectIntersectsPolygon(R(7_500_000, 5_500_000, 3 * M, 3 * M), L_ROOM)).toBe(false); // fills the notch exactly
    expect(rectIntersectsPolygon(R(7_500_000, 5_499_000, 3 * M, 3 * M), L_ROOM)).toBe(true);
    expect(rectIntersectsPolygon(R(1 * M, 1 * M, 1 * M, 1 * M), L_ROOM)).toBe(true);
    // A long thin bar crossing a prong of the U with all its corners outside the polygon.
    expect(rectIntersectsPolygon(R(1_500_000, 5 * M, 5 * M, 200 * MM), U_ROOM)).toBe(true);
  });
});

describe('inflateRect (clearances in the local frame: front +y, back -y)', () => {
  const base = R(0, 0, 1000, 600);
  const clear = { frontUm: 900, backUm: 100, sidesUm: 50 };

  it('grows width by both sides and depth by front + back, shifting the centre toward the front', () => {
    expect(inflateRect(base, clear)).toEqual(R(0, 400, 1100, 1600, 0));
    expect(inflateRect({ ...base, rotationUdeg: 90 * DEG }, clear)).toEqual(R(-400, 0, 1100, 1600, 90 * DEG));
    expect(inflateRect({ ...base, rotationUdeg: 180 * DEG }, clear)).toEqual(R(0, -400, 1100, 1600, 180 * DEG));
    expect(inflateRect({ ...base, rotationUdeg: 270 * DEG }, clear)).toEqual(R(400, 0, 1100, 1600, 270 * DEG));
  });

  it('the inflated front edge is exactly the clearance in front of the original one', () => {
    const big = rectCorners(inflateRect(base, clear));
    expect(big).toEqual([P(-550, -400), P(550, -400), P(550, 1200), P(-550, 1200)]);
  });

  it('zero clearances return an equal rectangle and never mutate the input', () => {
    const frozen = Object.freeze({ ...base, center: Object.freeze({ ...base.center }) });
    expect(inflateRect(frozen, { frontUm: 0, backUm: 0, sidesUm: 0 })).toEqual(base);
  });

  it('rotated: the front clearance zone ends where expected (within rounding)', () => {
    const r = R(2 * M, 2 * M, 1200 * MM, 600 * MM, 30 * DEG);
    const grown = inflateRect(r, { frontUm: 1200 * MM, backUm: 0, sidesUm: 0 });
    expect(grown.widthUm).toBe(1200 * MM);
    expect(grown.depthUm).toBe(1800 * MM);
    // Centre moves 600 mm along local +y = (-sin 30, cos 30).
    expect(grown.center).toEqual(P(2 * M - 300_000, 2 * M + 519_615));
    // The back edge has not moved.
    const before = rectCorners(r);
    const after = rectCorners(grown);
    for (const i of [0, 1]) {
      expect(Math.abs(after[i]!.x - before[i]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after[i]!.y - before[i]!.y)).toBeLessThanOrEqual(1);
    }
  });
});
