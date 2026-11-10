/**
 * Polygon offsetting and boolean operations on integer micrometres.
 * This is the ONLY file that imports clipper2-ts (see docs/STACK.md: exact pin, single entry point).
 *
 * Results are canonical, so the same input always gives the same bytes:
 *  - `outer` rings are counter-clockwise, `holes` are clockwise;
 *  - every ring starts at its vertex with the smallest x, then the smallest y;
 *  - polygons (and holes within a polygon) are sorted by their rings, compared vertex by vertex.
 * A polygon lying inside a hole of another (an island) is returned as its own top-level entry.
 *
 * Inputs are simple polygons of either orientation; each one is a filled area (a clockwise input
 * is NOT a hole). The first vertex is not repeated at the end.
 */
import {
  ClipType,
  EndType,
  FillRule,
  JoinType,
  PolyTree64,
  booleanOpWithPolyTree,
  inflatePaths,
  type PolyPath64,
} from 'clipper2-ts';
import { area2 } from './exact.js';
import type { Point } from './types.js';

export type PolygonWithHoles = {
  /** Counter-clockwise outer boundary. */
  outer: Point[];
  /** Clockwise holes, each strictly inside `outer`. */
  holes: Point[][];
};

/**
 * Corners sharper than about 29 degrees are squared off instead of mitered (Clipper's miter
 * limit, in multiples of the offset distance). Either way an inset never keeps floor that is
 * closer to a wall than the inset distance.
 */
const MITER_LIMIT = 4;

function compareRings(a: readonly Point[], b: readonly Point[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const p = a[i]!;
    const q = b[i]!;
    if (p.x !== q.x) return p.x - q.x;
    if (p.y !== q.y) return p.y - q.y;
  }
  return a.length - b.length;
}

/** Copy of the ring with the requested orientation, starting at its smallest (x, y) vertex. */
function canonicalRing(ring: readonly Point[], counterClockwise: boolean): Point[] {
  const pts = ring.map((p) => ({ x: p.x, y: p.y }));
  if (area2(pts) > 0n !== counterClockwise) pts.reverse();
  let first = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[first]!;
    if (p.x < q.x || (p.x === q.x && p.y < q.y)) first = i;
  }
  return [...pts.slice(first), ...pts.slice(0, first)];
}

function toPaths(polygons: readonly (readonly Point[])[]): Point[][] {
  const paths: Point[][] = [];
  for (const polygon of polygons) {
    if (polygon.length >= 3 && area2(polygon) !== 0n) paths.push(canonicalRing(polygon, true));
  }
  return paths;
}

function collect(node: PolyPath64, out: PolygonWithHoles[]): void {
  for (let i = 0; i < node.count; i++) {
    const outerNode = node.child(i);
    const outerPath = outerNode.poly;
    if (outerPath === null || outerPath.length < 3 || area2(outerPath) === 0n) continue;
    const holes: Point[][] = [];
    for (let j = 0; j < outerNode.count; j++) {
      const holeNode = outerNode.child(j);
      const holePath = holeNode.poly;
      if (holePath !== null && holePath.length >= 3 && area2(holePath) !== 0n) {
        holes.push(canonicalRing(holePath, false));
      }
      collect(holeNode, out); // islands inside the hole
    }
    holes.sort(compareRings);
    out.push({ outer: canonicalRing(outerPath, true), holes });
  }
}

function run(clipType: ClipType, subject: Point[][], clip: Point[][], fillRule: FillRule): PolygonWithHoles[] {
  if (subject.length === 0 && clip.length === 0) return [];
  const tree = new PolyTree64();
  booleanOpWithPolyTree(clipType, subject, clip, tree, fillRule);
  const out: PolygonWithHoles[] = [];
  collect(tree, out);
  out.sort((a, b) => compareRings(a.outer, b.outer));
  return out;
}

/** Union of filled polygons. */
export function unionPolygons(polygons: readonly (readonly Point[])[]): PolygonWithHoles[] {
  return run(ClipType.Union, toPaths(polygons), [], FillRule.NonZero);
}

/** Everything covered by `subject` and not by `clip`. */
export function differencePolygons(
  subject: readonly (readonly Point[])[],
  clip: readonly (readonly Point[])[],
): PolygonWithHoles[] {
  const s = toPaths(subject);
  if (s.length === 0) return [];
  return run(ClipType.Difference, s, toPaths(clip), FillRule.NonZero);
}

/** Everything covered by both `subject` and `clip`. Regions that only touch give []. */
export function intersectPolygons(
  subject: readonly (readonly Point[])[],
  clip: readonly (readonly Point[])[],
): PolygonWithHoles[] {
  const s = toPaths(subject);
  const c = toPaths(clip);
  if (s.length === 0 || c.length === 0) return [];
  return run(ClipType.Intersection, s, c, FillRule.NonZero);
}

/**
 * Grows (positive `deltaUm`) or shrinks (negative) a simple polygon with mitered, i.e. sharp,
 * corners. May return zero, one or several polygons; growing a C-shaped polygon can close a hole.
 */
export function offsetPolygon(polygon: readonly Point[], deltaUm: number): PolygonWithHoles[] {
  const paths = toPaths([polygon]);
  if (paths.length === 0) return [];
  if (deltaUm === 0) return run(ClipType.Union, paths, [], FillRule.NonZero);
  const moved = inflatePaths(paths, deltaUm, JoinType.Miter, EndType.Polygon, MITER_LIMIT);
  // Offset output never overlaps itself, so even-odd nesting sorts outers from holes without
  // relying on the library's orientation convention.
  return run(ClipType.Union, moved, [], FillRule.EvenOdd);
}

/**
 * The polygon shrunk by `distanceUm` (>= 0) on every side, mitered corners: the floor that stays
 * at least that far from every wall. Returns counter-clockwise rings: [] if nothing is left,
 * several if a narrow neck closes. An inset of a simple polygon has no holes.
 */
export function insetPolygon(polygon: readonly Point[], distanceUm: number): Point[][] {
  if (!(distanceUm >= 0)) throw new RangeError(`insetPolygon: distanceUm must be >= 0, got ${distanceUm}`);
  return offsetPolygon(polygon, -distanceUm).map((p) => p.outer);
}
