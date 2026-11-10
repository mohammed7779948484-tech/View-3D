import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  distancePointToSegment,
  isCounterClockwise,
  isSimplePolygon,
  pointInPolygon,
  segmentsIntersect,
  validateRoomOutline,
  wallSegments,
  type Point,
} from '../../src/geometry/index.js';
import { ANGLED_ROOM, ANGLED_WALL_INDEX, L_ROOM, M, U_ROOM, refCross, square } from './rooms.js';

const P = (x: number, y: number): Point => ({ x, y });

describe('orientation and simplicity', () => {
  it('isCounterClockwise', () => {
    expect(isCounterClockwise(L_ROOM)).toBe(true);
    expect(isCounterClockwise([...L_ROOM].reverse())).toBe(false);
    expect(isCounterClockwise(ANGLED_ROOM)).toBe(true);
    expect(isCounterClockwise([P(0, 0), P(5, 0), P(10, 0)])).toBe(false); // zero area
  });

  it('isSimplePolygon accepts the test rooms in either orientation', () => {
    for (const room of [L_ROOM, ANGLED_ROOM, U_ROOM]) {
      expect(isSimplePolygon(room)).toBe(true);
      expect(isSimplePolygon([...room].reverse())).toBe(true);
    }
    // A vertex in the middle of a straight wall is allowed.
    expect(isSimplePolygon([P(0, 0), P(5, 0), P(10, 0), P(10, 10), P(0, 10)])).toBe(true);
  });

  it('isSimplePolygon rejects degenerate and self-intersecting outlines', () => {
    expect(isSimplePolygon([])).toBe(false);
    expect(isSimplePolygon([P(0, 0), P(10, 0)])).toBe(false);
    expect(isSimplePolygon([P(0, 0), P(10, 0), P(10, 0), P(0, 10)])).toBe(false); // zero-length edge
    expect(isSimplePolygon([P(0, 0), P(10, 0), P(0, 10), P(0, 0)])).toBe(false); // closing duplicate
    expect(isSimplePolygon([P(0, 0), P(10, 10), P(10, 0), P(0, 10)])).toBe(false); // bow tie
    expect(isSimplePolygon([P(0, 0), P(10, 0), P(5, 0), P(5, 10)])).toBe(false); // edge folds back on itself
    expect(isSimplePolygon([P(0, 0), P(5, 0), P(10, 0)])).toBe(false); // all collinear
    // Vertex touching a non-adjacent edge (pinch).
    expect(isSimplePolygon([P(0, 0), P(10, 0), P(10, 10), P(5, 0), P(0, 10)])).toBe(false);
  });
});

describe('validateRoomOutline', () => {
  it('returns no problems for the test rooms', () => {
    expect(validateRoomOutline(L_ROOM)).toEqual([]);
    expect(validateRoomOutline(ANGLED_ROOM)).toEqual([]);
    expect(validateRoomOutline(U_ROOM)).toEqual([]);
  });

  it('reports each kind of problem with a readable message', () => {
    const codes = (o: Point[]) => validateRoomOutline(o).map((p) => p.code);
    expect(codes([P(0, 0), P(10, 0)])).toEqual(['too-few-vertices']);
    expect(codes([P(0, 0), P(10.5, 0), P(10, 10)])).toEqual(['non-integer-coordinate']);
    expect(codes([P(0, 0), P(100_000_001, 0), P(10, 10)])).toEqual(['coordinate-out-of-range']);
    expect(codes([P(0, 0), P(10, 0), P(10, 0), P(0, 10)])).toEqual(['zero-length-edge']);
    expect(codes([P(0, 0), P(10, 10), P(10, 0), P(0, 10)])).toEqual(['self-intersection']);
    expect(codes([...L_ROOM].reverse())).toEqual(['clockwise']);
    expect(codes([P(0, 0), P(5, 0), P(10, 0)])).toContain('self-intersection'); // wall folds back on its neighbour

    const [problem] = validateRoomOutline([P(0, 0), P(10, 10), P(10, 0), P(0, 10)]);
    expect(problem!.message).toBe('Wall 0 crosses wall 2: the outline must not intersect itself.');
    const [zero] = validateRoomOutline([P(0, 0), P(10, 0), P(10, 0), P(0, 10)]);
    expect(zero!.message).toBe('Corners 1 and 2 are the same point: wall 1 has zero length.');
    expect(zero!.index).toBe(1);
    const [cw] = validateRoomOutline([...L_ROOM].reverse());
    expect(cw!.message).toMatch(/clockwise/);
  });

  it('is deterministic', () => {
    const bad = [P(0, 0), P(10, 10), P(10, 0), P(0, 10), P(0, 10)];
    expect(JSON.stringify(validateRoomOutline(bad))).toBe(JSON.stringify(validateRoomOutline(bad)));
  });
});

describe('segmentsIntersect', () => {
  it('classifies proper crossings, touches and misses', () => {
    expect(segmentsIntersect(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toEqual({ intersects: true, proper: true });
    // T junction: endpoint of one on the interior of the other.
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(5, 0), P(5, 10))).toEqual({ intersects: true, proper: false });
    // Shared endpoint.
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(10, 0), P(10, 10))).toEqual({ intersects: true, proper: false });
    // Collinear overlap.
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(5, 0), P(15, 0))).toEqual({ intersects: true, proper: false });
    // Collinear, disjoint.
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(11, 0), P(15, 0))).toEqual({ intersects: false, proper: false });
    // Parallel.
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(0, 1), P(10, 1))).toEqual({ intersects: false, proper: false });
    // Lines cross, segments do not.
    expect(segmentsIntersect(P(0, 0), P(10, 10), P(20, 0), P(11, 10))).toEqual({ intersects: false, proper: false });
  });

  it('is exact at 100 m: a 1 um miss is a miss', () => {
    const a1 = P(-100_000_000, -100_000_000);
    const a2 = P(100_000_000, 100_000_000);
    expect(segmentsIntersect(a1, a2, P(99_999_999, 99_999_999), P(100_000_000, -100_000_000)).intersects).toBe(true);
    expect(segmentsIntersect(a1, a2, P(99_999_999, 99_999_998), P(100_000_000, -100_000_000)).intersects).toBe(false);
    expect(segmentsIntersect(a1, a2, P(99_999_998, 99_999_999), P(100_000_000, -100_000_000))).toEqual({
      intersects: true,
      proper: true,
    });
  });
});

describe('pointInPolygon', () => {
  it('L room: inside, boundary, outside, and the notch', () => {
    expect(pointInPolygon(P(1 * M, 1 * M), L_ROOM)).toBe('inside');
    expect(pointInPolygon(P(3 * M, 6 * M), L_ROOM)).toBe('inside');
    expect(pointInPolygon(P(7_500_000, 5_500_000), L_ROOM)).toBe('outside'); // in the notch
    expect(pointInPolygon(P(6 * M, 4 * M), L_ROOM)).toBe('boundary'); // reflex corner
    expect(pointInPolygon(P(7 * M, 4 * M), L_ROOM)).toBe('boundary');
    expect(pointInPolygon(P(7 * M, 4 * M - 1), L_ROOM)).toBe('inside');
    expect(pointInPolygon(P(7 * M, 4 * M + 1), L_ROOM)).toBe('outside');
    expect(pointInPolygon(P(0, 0), L_ROOM)).toBe('boundary');
    expect(pointInPolygon(P(-1, 0), L_ROOM)).toBe('outside');
    expect(pointInPolygon(P(10 * M, 4 * M), L_ROOM)).toBe('outside'); // on the line of an edge, beyond it
    expect(pointInPolygon(P(3 * M, 7 * M), L_ROOM)).toBe('boundary');
  });

  it('angled wall: 1 um either side of the slanted wall', () => {
    expect(pointInPolygon(P(7 * M, 4 * M), ANGLED_ROOM)).toBe('boundary'); // midpoint of the wall
    expect(pointInPolygon(P(7 * M - 1, 4 * M), ANGLED_ROOM)).toBe('inside');
    expect(pointInPolygon(P(7 * M + 1, 4 * M), ANGLED_ROOM)).toBe('outside');
  });

  it('does not depend on the orientation of the polygon', () => {
    const cw = [...L_ROOM].reverse();
    expect(pointInPolygon(P(1 * M, 1 * M), cw)).toBe('inside');
    expect(pointInPolygon(P(7_500_000, 5_500_000), cw)).toBe('outside');
    expect(pointInPolygon(P(6 * M, 5 * M), cw)).toBe('boundary');
  });

  it('is exact at 100 m scale', () => {
    const tri = [P(-100_000_000, -100_000_000), P(100_000_000, -100_000_000), P(100_000_000, 100_000_000)];
    expect(pointInPolygon(P(99_999_999, 99_999_999), tri)).toBe('boundary');
    expect(pointInPolygon(P(99_999_999, 99_999_998), tri)).toBe('inside');
    expect(pointInPolygon(P(99_999_998, 99_999_999), tri)).toBe('outside');
  });

  /** Independent reference: winding number (Sunday), all in BigInt. */
  function refClassify(p: Point, poly: readonly Point[]): 'inside' | 'boundary' | 'outside' {
    let wn = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const c = refCross(a, b, p);
      if (
        c === 0n &&
        Math.min(a.x, b.x) <= p.x &&
        p.x <= Math.max(a.x, b.x) &&
        Math.min(a.y, b.y) <= p.y &&
        p.y <= Math.max(a.y, b.y)
      ) {
        return 'boundary';
      }
      if (a.y <= p.y) {
        if (b.y > p.y && c > 0n) wn++;
      } else if (b.y <= p.y && c < 0n) wn--;
    }
    return wn !== 0 ? 'inside' : 'outside';
  }

  it('property: agrees with a winding-number reference on the fixed rooms', () => {
    // Half-metre grid points land on walls and corners often; free points cover the rest.
    const grid = fc
      .tuple(fc.integer({ min: -2, max: 20 }), fc.integer({ min: -2, max: 16 }), fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 }))
      .map(([i, j, dx, dy]) => P(i * 500_000 + dx, j * 500_000 + dy));
    const free = fc.record({ x: fc.integer({ min: -1 * M, max: 10 * M }), y: fc.integer({ min: -1 * M, max: 8 * M }) });
    const rooms = [L_ROOM, ANGLED_ROOM, U_ROOM, [...L_ROOM].reverse()];
    const seen = new Set<string>();
    fc.assert(
      fc.property(fc.oneof(grid, free), fc.integer({ min: 0, max: rooms.length - 1 }), (p, r) => {
        const room = rooms[r]!;
        const got = pointInPolygon(p, room);
        seen.add(got);
        expect(got).toBe(refClassify(p, room));
      }),
      { seed: 20261110, numRuns: 3000 },
    );
    expect([...seen].sort()).toEqual(['boundary', 'inside', 'outside']); // the generator really hit all three
  });
});

describe('distancePointToSegment', () => {
  it('perpendicular foot, beyond the ends, and degenerate segment', () => {
    expect(distancePointToSegment(P(5, 3), P(0, 0), P(10, 0))).toBe(3);
    expect(distancePointToSegment(P(5, 0), P(0, 0), P(10, 0))).toBe(0);
    expect(distancePointToSegment(P(13, 4), P(0, 0), P(10, 0))).toBe(5);
    expect(distancePointToSegment(P(-3, -4), P(0, 0), P(10, 0))).toBe(5);
    expect(distancePointToSegment(P(3, 4), P(0, 0), P(0, 0))).toBe(5);
  });

  it('1 um off a 100 m diagonal is measured as about 0.707 um, not 0', () => {
    const d = distancePointToSegment(P(99_999_999, 100_000_000), P(1, 1), P(100_000_001, 100_000_001));
    expect(d).toBeCloseTo(Math.SQRT1_2, 9);
  });
});

describe('wallSegments', () => {
  it('L room: six walls with exact axis-aligned directions, inward normals and angles', () => {
    const walls = wallSegments(L_ROOM);
    expect(walls).toHaveLength(6);
    expect(walls.map((w) => w.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(walls.map((w) => w.lengthUm)).toEqual([9 * M, 4 * M, 3 * M, 3 * M, 6 * M, 7 * M]);
    expect(walls.map((w) => w.angleUdeg)).toEqual([0, 90_000_000, 180_000_000, 90_000_000, 180_000_000, 270_000_000]);
    expect(walls[0]).toEqual({
      index: 0,
      start: P(0, 0),
      end: P(9 * M, 0),
      lengthUm: 9 * M,
      direction: { x: 1, y: 0 },
      inwardNormal: { x: 0, y: 1 },
      angleUdeg: 0,
    });
    expect(walls[1]!.inwardNormal).toEqual({ x: -1, y: 0 });
    expect(walls[2]!.inwardNormal).toEqual({ x: 0, y: -1 }); // notch floor: the room is below it
    expect(walls[3]!.inwardNormal).toEqual({ x: -1, y: 0 });
    expect(walls[5]!.inwardNormal).toEqual({ x: 1, y: 0 });
    // No negative zero anywhere (it would leak into JSON and string output).
    for (const w of walls) {
      for (const v of [w.direction.x, w.direction.y, w.inwardNormal.x, w.inwardNormal.y]) {
        expect(Object.is(v, -0)).toBe(false);
      }
    }
  });

  it('every inward normal really points into the room', () => {
    for (const room of [L_ROOM, ANGLED_ROOM, U_ROOM]) {
      for (const w of wallSegments(room)) {
        const mid = P(
          Math.round((w.start.x + w.end.x) / 2 + w.inwardNormal.x * 1000),
          Math.round((w.start.y + w.end.y) / 2 + w.inwardNormal.y * 1000),
        );
        expect(pointInPolygon(mid, room)).toBe('inside');
      }
    }
  });

  it('angled wall from (8 m, 2 m) to (6 m, 6 m)', () => {
    const w = wallSegments(ANGLED_ROOM)[ANGLED_WALL_INDEX]!;
    expect(w.start).toEqual(P(8 * M, 2 * M));
    expect(w.end).toEqual(P(6 * M, 6 * M));
    expect(w.lengthUm).toBeCloseTo(Math.sqrt(20) * M, 6);
    expect(w.direction.x).toBeCloseTo(-1 / Math.sqrt(5), 12);
    expect(w.direction.y).toBeCloseTo(2 / Math.sqrt(5), 12);
    expect(w.inwardNormal.x).toBeCloseTo(-2 / Math.sqrt(5), 12);
    expect(w.inwardNormal.y).toBeCloseTo(-1 / Math.sqrt(5), 12);
    expect(w.angleUdeg).toBe(116_565_051); // atan2(2, -1) = 116.565051177...
    expect(Number.isInteger(w.angleUdeg)).toBe(true);
  });

  it('angles are integers in [0, 360e6)', () => {
    for (const w of wallSegments(square(0, 0, 1000).reverse().concat())) {
      expect(w.angleUdeg).toBeGreaterThanOrEqual(0);
      expect(w.angleUdeg).toBeLessThan(360_000_000);
    }
  });
});
