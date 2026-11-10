/**
 * Polygon basics on integer micrometres. Every yes/no decision here is exact (see exact.ts);
 * only lengths, distances, unit vectors and angles are floating point.
 */
import { area2, cross, dot, orientation } from './exact.js';
import { MAX_COORD_UM, type Point, type Vec } from './types.js';

/** True if the polygon has positive signed area (interior on the left of each edge). */
export function isCounterClockwise(polygon: readonly Point[]): boolean {
  return area2(polygon) > 0n;
}

function inBox(p: Point, a: Point, b: Point): boolean {
  return (
    Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
  );
}

export type SegmentIntersection = {
  /** The two closed segments share at least one point. */
  intersects: boolean;
  /**
   * The segments cross at a single point interior to both. False for every kind of touching:
   * shared end point, end point on the other segment (T junction), collinear overlap.
   */
  proper: boolean;
};

/** Exact intersection test of the closed segments a1-a2 and b1-b2. */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): SegmentIntersection {
  const d1 = orientation(b1, b2, a1);
  const d2 = orientation(b1, b2, a2);
  const d3 = orientation(a1, a2, b1);
  const d4 = orientation(a1, a2, b2);
  if (d1 * d2 < 0 && d3 * d4 < 0) return { intersects: true, proper: true };
  const touching =
    (d1 === 0 && inBox(a1, b1, b2)) ||
    (d2 === 0 && inBox(a2, b1, b2)) ||
    (d3 === 0 && inBox(b1, a1, a2)) ||
    (d4 === 0 && inBox(b2, a1, a2));
  return { intersects: touching, proper: false };
}

type Defect =
  | { kind: 'zero-length'; edge: number }
  | { kind: 'fold-back' | 'crossing' | 'touching'; edge: number; other: number };

/** Edge i runs from polygon[i] to polygon[(i + 1) % n]. Deterministic order: by edge, then other. */
function findDefects(polygon: readonly Point[], firstOnly: boolean): Defect[] {
  const n = polygon.length;
  const defects: Defect[] = [];
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    if (a.x === b.x && a.y === b.y) {
      defects.push({ kind: 'zero-length', edge: i });
      if (firstOnly) return defects;
    }
  }
  // Intersections between degenerate edges are meaningless: fix the zero-length walls first.
  if (defects.length > 0) return defects;
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i]!;
    const a2 = polygon[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      const b1 = polygon[j]!;
      const b2 = polygon[(j + 1) % n]!;
      const adjacentAfter = j === i + 1; // share a2 === b1
      const adjacentBefore = i === 0 && j === n - 1; // share b2 === a1
      if (adjacentAfter || adjacentBefore) {
        // Neighbours always share their common corner; they are wrong only if one runs back over the other.
        const shared = adjacentAfter ? a2 : a1;
        const p = adjacentAfter ? a1 : a2;
        const q = adjacentAfter ? b2 : b1;
        if (orientation(shared, p, q) === 0 && dot(shared, p, q) > 0n) {
          defects.push({ kind: 'fold-back', edge: i, other: j });
          if (firstOnly) return defects;
        }
        continue;
      }
      const hit = segmentsIntersect(a1, a2, b1, b2);
      if (hit.intersects) {
        defects.push({ kind: hit.proper ? 'crossing' : 'touching', edge: i, other: j });
        if (firstOnly) return defects;
      }
    }
  }
  return defects;
}

/**
 * A simple polygon: at least 3 vertices, no zero-length edge, and no two edges meeting anywhere
 * except neighbours at their shared corner. Collinear consecutive corners are allowed.
 * Either orientation is accepted. The closing edge is implicit: do not repeat the first vertex.
 */
export function isSimplePolygon(polygon: readonly Point[]): boolean {
  return polygon.length >= 3 && findDefects(polygon, true).length === 0;
}

export type OutlineProblemCode =
  | 'too-few-vertices'
  | 'non-integer-coordinate'
  | 'coordinate-out-of-range'
  | 'zero-length-edge'
  | 'self-intersection'
  | 'clockwise';

export type OutlineProblem = {
  code: OutlineProblemCode;
  /** Plain-English sentence for the owner. Corner and wall numbers are zero-based indices. */
  message: string;
  /** Index of the corner or wall the problem is about, when there is one. */
  index?: number;
  /** For 'self-intersection': the other wall involved. */
  otherIndex?: number;
};

/**
 * Checks a room outline and returns every problem found, in a fixed order; [] means valid.
 * A valid outline is a counter-clockwise simple polygon with integer coordinates within
 * +-MAX_COORD_UM. Later checks are skipped when earlier ones fail, because they would only
 * produce noise (for example intersections between zero-length walls).
 */
export function validateRoomOutline(outline: readonly Point[]): OutlineProblem[] {
  const n = outline.length;
  if (n < 3) {
    return [{ code: 'too-few-vertices', message: `A room outline needs at least 3 corners; got ${n}.` }];
  }
  const problems: OutlineProblem[] = [];
  for (let i = 0; i < n; i++) {
    const p = outline[i]!;
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
      problems.push({
        code: 'non-integer-coordinate',
        message: `Corner ${i} (${p.x}, ${p.y}) is not a whole number of micrometres.`,
        index: i,
      });
    } else if (Math.abs(p.x) > MAX_COORD_UM || Math.abs(p.y) > MAX_COORD_UM) {
      problems.push({
        code: 'coordinate-out-of-range',
        message: `Corner ${i} (${p.x}, ${p.y}) is more than 100 m from the origin; the limit is ${MAX_COORD_UM} um.`,
        index: i,
      });
    }
  }
  if (problems.length > 0) return problems;

  for (const d of findDefects(outline, false)) {
    if (d.kind === 'zero-length') {
      problems.push({
        code: 'zero-length-edge',
        message: `Corners ${d.edge} and ${(d.edge + 1) % n} are the same point: wall ${d.edge} has zero length.`,
        index: d.edge,
      });
    } else {
      const verb = d.kind === 'crossing' ? 'crosses' : d.kind === 'touching' ? 'touches' : 'folds back onto';
      problems.push({
        code: 'self-intersection',
        message: `Wall ${d.edge} ${verb} wall ${d.other}: the outline must not intersect itself.`,
        index: d.edge,
        otherIndex: d.other,
      });
    }
  }
  if (problems.length > 0) return problems;

  if (!isCounterClockwise(outline)) {
    problems.push({
      code: 'clockwise',
      message: 'The outline is clockwise; corners must be listed counter-clockwise (room interior on the left of each wall).',
    });
  }
  return problems;
}

export type PointLocation = 'inside' | 'boundary' | 'outside';

/**
 * Exact point-in-polygon for a simple polygon of either orientation.
 * 'boundary' means exactly on an edge or a vertex.
 */
export function pointInPolygon(p: Point, polygon: readonly Point[]): PointLocation {
  const n = polygon.length;
  let inside = false;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    const side = orientation(a, b, p);
    if (side === 0 && inBox(p, a, b)) return 'boundary';
    // Half-open rule on y so a ray through a vertex is counted once.
    if (a.y <= p.y) {
      if (b.y > p.y && side > 0) inside = !inside;
    } else if (b.y <= p.y && side < 0) {
      inside = !inside;
    }
  }
  return inside ? 'inside' : 'outside';
}

/**
 * Distance in um from p to the closed segment a-b (floating point, accurate to well below 1 um:
 * the perpendicular case divides an exact cross product by the segment length).
 */
export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return Math.hypot(apx, apy);
  const t = apx * abx + apy * aby;
  if (t <= 0) return Math.hypot(apx, apy);
  if (t >= len2) return Math.hypot(p.x - b.x, p.y - b.y);
  const c = cross(a, b, p);
  return Number(c < 0n ? -c : c) / Math.hypot(abx, aby);
}

export type WallSegment = {
  /** Wall i runs from outline[i] to outline[(i + 1) % n]. */
  index: number;
  start: Point;
  end: Point;
  /** Length in um (floating point; exact for axis-aligned walls). */
  lengthUm: number;
  /** Unit vector from start to end. */
  direction: Vec;
  /** Unit vector pointing into the room: the left of `direction`, for a counter-clockwise outline. */
  inwardNormal: Vec;
  /**
   * Direction angle in integer micro-degrees in [0, 360 000 000), counter-clockwise from +x.
   * A fixture with this `rotationUdeg` has its back (local -y) against the wall.
   */
  angleUdeg: number;
};

const FULL_TURN_UDEG = 360_000_000;

/** One wall of a counter-clockwise outline; undefined if the index is not a wall. */
export function wallSegment(outline: readonly Point[], index: number): WallSegment | undefined {
  const n = outline.length;
  if (!Number.isInteger(index) || index < 0 || index >= n) return undefined;
  const start = outline[index]!;
  const end = outline[(index + 1) % n]!;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthUm = Math.hypot(dx, dy);
  // "+ 0" turns a negative zero into a plain zero.
  const ux = lengthUm === 0 ? 0 : dx / lengthUm + 0;
  const uy = lengthUm === 0 ? 0 : dy / lengthUm + 0;
  let angleUdeg: number;
  if (dy === 0) angleUdeg = dx >= 0 ? 0 : 180_000_000;
  else if (dx === 0) angleUdeg = dy > 0 ? 90_000_000 : 270_000_000;
  else {
    angleUdeg = Math.round((Math.atan2(dy, dx) * 180_000_000) / Math.PI);
    angleUdeg = ((angleUdeg % FULL_TURN_UDEG) + FULL_TURN_UDEG) % FULL_TURN_UDEG;
  }
  return {
    index,
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    lengthUm,
    direction: { x: ux, y: uy },
    inwardNormal: { x: -uy + 0, y: ux },
    angleUdeg,
  };
}

/** All walls of a counter-clockwise outline, in order. */
export function wallSegments(outline: readonly Point[]): WallSegment[] {
  const walls: WallSegment[] = [];
  for (let i = 0; i < outline.length; i++) walls.push(wallSegment(outline, i)!);
  return walls;
}
