import { describe, expect, it } from 'vitest';
import {
  area2,
  differencePolygons,
  insetPolygon,
  intersectPolygons,
  isCounterClockwise,
  isSimplePolygon,
  offsetPolygon,
  unionPolygons,
  type Point,
  type PolygonWithHoles,
} from '../../src/geometry/index.js';
import { ANGLED_ROOM, COLUMN, L_ROOM, L_ROOM_AREA_UM2, M, square } from './rooms.js';

const P = (x: number, y: number): Point => ({ x, y });
const M2 = BigInt(M) * BigInt(M);
const sortPts = (pts: readonly Point[]) => [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
/** Net area (outer minus holes), times two, exact. */
const netArea2 = (polys: PolygonWithHoles[]) =>
  polys.reduce((s, p) => s + area2(p.outer) + p.holes.reduce((h, hole) => h + area2(hole), 0n), 0n);

describe('insetPolygon', () => {
  it('L room inset by 1 m has exactly the expected outline and area (26 m^2)', () => {
    const inset = insetPolygon(L_ROOM, 1 * M);
    expect(inset).toHaveLength(1);
    const ring = inset[0]!;
    expect(area2(ring)).toBe(2n * 26n * M2);
    expect(isCounterClockwise(ring)).toBe(true);
    expect(sortPts(ring)).toEqual(
      sortPts([P(1 * M, 1 * M), P(8 * M, 1 * M), P(8 * M, 3 * M), P(5 * M, 3 * M), P(5 * M, 6 * M), P(1 * M, 6 * M)]),
    );
    // Canonical start: the vertex with the smallest x, then the smallest y, comes first.
    expect(ring[0]).toEqual(P(1 * M, 1 * M));
  });

  it('inset larger than the room returns []', () => {
    expect(insetPolygon(L_ROOM, 5 * M)).toEqual([]);
    expect(insetPolygon(square(0, 0, 2 * M), 1 * M)).toEqual([]); // collapses to a point
  });

  it('inset by 0 returns the polygon itself', () => {
    const same = insetPolygon(L_ROOM, 0);
    expect(same).toHaveLength(1);
    expect(sortPts(same[0]!)).toEqual(sortPts(L_ROOM));
  });

  it('a room with a narrow neck splits into several polygons', () => {
    // Two 4 m squares joined by a 1 m wide, 2 m long corridor.
    const dumbbell = [
      P(0, 0), P(4 * M, 0), P(4 * M, 1_500_000), P(6 * M, 1_500_000), P(6 * M, 0), P(10 * M, 0),
      P(10 * M, 4 * M), P(6 * M, 4 * M), P(6 * M, 2_500_000), P(4 * M, 2_500_000), P(4 * M, 4 * M), P(0, 4 * M),
    ];
    expect(isSimplePolygon(dumbbell) && isCounterClockwise(dumbbell)).toBe(true);
    const parts = insetPolygon(dumbbell, 600_000);
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect(area2(part)).toBe(2n * 2_800_000n * 2_800_000n);
      expect(isCounterClockwise(part)).toBe(true);
    }
    // Deterministic order: sorted by first vertex.
    expect(parts[0]![0]).toEqual(P(600_000, 600_000));
    expect(parts[1]![0]).toEqual(P(6_600_000, 600_000));
  });

  it('angled room: inset keeps the slanted wall parallel and 500 mm away', () => {
    const inset = insetPolygon(ANGLED_ROOM, 500_000);
    expect(inset).toHaveLength(1);
    expect(inset[0]).toHaveLength(5);
    expect(isCounterClockwise(inset[0]!)).toBe(true);
    // Room area = 44 m^2. Miter inset area = A - P*d + d^2 * sum(tan(turn/2)), turn = exterior angle.
    const turns = [90, 90, 90 - 63.43494882292201, 63.43494882292201, 90].map((t) => (t * Math.PI) / 180);
    const perimeter = 8 * M + 2 * M + Math.sqrt(20) * M + 6 * M + 6 * M;
    const expected = 44 * M * M - perimeter * 500_000 + 500_000 ** 2 * turns.reduce((s, t) => s + Math.tan(t / 2), 0);
    expect(Math.abs(Number(area2(inset[0]!)) / 2 - expected)).toBeLessThan(100 * M); // 100 mm^2: rounding of 5 vertices x ~8 m edges
  });

  it('works on a clockwise input the same way', () => {
    expect(insetPolygon([...L_ROOM].reverse(), 1 * M)).toEqual(insetPolygon(L_ROOM, 1 * M));
  });

  it('is exact at 100 m: a 100 m square inset by 1 m is a 98 m square', () => {
    const inset = insetPolygon(square(0, 0, 100 * M), 1 * M);
    expect(inset).toEqual([[P(1 * M, 1 * M), P(99 * M, 1 * M), P(99 * M, 99 * M), P(1 * M, 99 * M)]]);
    expect(area2(inset[0]!)).toBe(2n * 98_000_000n * 98_000_000n);
  });
});

describe('offsetPolygon', () => {
  it('grows a square with mitered (sharp) corners', () => {
    const grown = offsetPolygon(square(0, 0, 10 * M), 1 * M);
    expect(grown).toEqual([{ outer: [P(-1 * M, -1 * M), P(11 * M, -1 * M), P(11 * M, 11 * M), P(-1 * M, 11 * M)], holes: [] }]);
  });

  it('negative distance is an inset', () => {
    const shrunk = offsetPolygon(L_ROOM, -1 * M);
    expect(shrunk).toHaveLength(1);
    expect(shrunk[0]!.holes).toEqual([]);
    expect(shrunk[0]!.outer).toEqual(insetPolygon(L_ROOM, 1 * M)[0]);
  });

  it('growing the L room by 1 m gives 54 + perimeter x 1 + 5 convex corners - 1 reflex corner = 90 m^2', () => {
    const grown = offsetPolygon(L_ROOM, 1 * M);
    expect(netArea2(grown)).toBe(2n * 90n * M2);
  });
});

describe('boolean operations', () => {
  const a = square(0, 0, 10 * M);
  const b = square(5 * M, 5 * M, 10 * M);

  it('union of two overlapping squares', () => {
    const u = unionPolygons([a, b]);
    expect(u).toHaveLength(1);
    expect(u[0]!.holes).toEqual([]);
    expect(area2(u[0]!.outer)).toBe(2n * 175n * M2);
    expect(isCounterClockwise(u[0]!.outer)).toBe(true);
  });

  it('union of disjoint squares keeps both, in a deterministic order', () => {
    const far = square(20 * M, 0, 1 * M);
    const u1 = unionPolygons([far, a]);
    const u2 = unionPolygons([a, far]);
    expect(u1).toHaveLength(2);
    expect(u1).toEqual(u2);
    expect(u1[0]!.outer[0]).toEqual(P(0, 0));
  });

  it('union that encloses a void reports it as a clockwise hole', () => {
    // Four bars forming a 10 m frame, 1 m thick.
    const bars = [
      [P(0, 0), P(10 * M, 0), P(10 * M, 1 * M), P(0, 1 * M)],
      [P(0, 9 * M), P(10 * M, 9 * M), P(10 * M, 10 * M), P(0, 10 * M)],
      [P(0, 0), P(1 * M, 0), P(1 * M, 10 * M), P(0, 10 * M)],
      [P(9 * M, 0), P(10 * M, 0), P(10 * M, 10 * M), P(9 * M, 10 * M)],
    ];
    const u = unionPolygons(bars);
    expect(u).toHaveLength(1);
    expect(area2(u[0]!.outer)).toBe(2n * 100n * M2);
    expect(u[0]!.holes).toHaveLength(1);
    expect(area2(u[0]!.holes[0]!)).toBe(-2n * 64n * M2); // negative: clockwise
    expect(isCounterClockwise(u[0]!.holes[0]!)).toBe(false);
    expect(netArea2(u)).toBe(2n * 36n * M2);
  });

  it('difference: room minus column leaves the room with one hole', () => {
    const d = differencePolygons([L_ROOM], [COLUMN]);
    expect(d).toHaveLength(1);
    expect(area2(d[0]!.outer)).toBe(2n * L_ROOM_AREA_UM2);
    expect(d[0]!.holes).toHaveLength(1);
    expect(sortPts(d[0]!.holes[0]!)).toEqual(sortPts(COLUMN));
    expect(isCounterClockwise(d[0]!.holes[0]!)).toBe(false);
    expect(netArea2(d)).toBe(2n * (L_ROOM_AREA_UM2 - 400_000n * 400_000n));
  });

  it('difference and intersection of overlapping squares are exact', () => {
    expect(netArea2(differencePolygons([a], [b]))).toBe(2n * 75n * M2);
    const i = intersectPolygons([a], [b]);
    expect(i).toEqual([{ outer: [P(5 * M, 5 * M), P(10 * M, 5 * M), P(10 * M, 10 * M), P(5 * M, 10 * M)], holes: [] }]);
  });

  it('empty results', () => {
    expect(intersectPolygons([a], [square(20 * M, 20 * M, 1 * M)])).toEqual([]);
    expect(intersectPolygons([a], [square(10 * M, 0, 1 * M)])).toEqual([]); // touching only
    expect(differencePolygons([a], [square(-1 * M, -1 * M, 12 * M)])).toEqual([]);
    expect(differencePolygons([], [a])).toEqual([]);
    expect(unionPolygons([])).toEqual([]);
    expect(differencePolygons([a], [])).toEqual([{ outer: a, holes: [] }]);
  });

  it('input orientation does not matter (clockwise inputs are filled areas, not holes)', () => {
    const cwA = [...a].reverse();
    const cwB = [...b].reverse();
    expect(intersectPolygons([cwA], [cwB])).toEqual(intersectPolygons([a], [b]));
    expect(unionPolygons([cwA, b])).toEqual(unionPolygons([a, b]));
    expect(differencePolygons([cwA], [cwB])).toEqual(differencePolygons([a], [b]));
  });

  it('free floor area: room inset minus column, same bytes on every run', () => {
    const run = () => JSON.stringify(differencePolygons(insetPolygon(L_ROOM, 100_000), [COLUMN]));
    expect(run()).toBe(run());
  });

  it('does not mutate its inputs', () => {
    const before = JSON.stringify([L_ROOM, COLUMN]);
    insetPolygon(L_ROOM, 1 * M);
    differencePolygons([L_ROOM], [COLUMN]);
    unionPolygons([L_ROOM, COLUMN]);
    expect(JSON.stringify([L_ROOM, COLUMN])).toBe(before);
  });
});
