/** Distances between segments and between polygons, in um (floating point). */
import { distancePointToSegment, pointInPolygon, segmentsIntersect } from './polygon.js';
import type { Point } from './types.js';

/** Distance between the closed segments a1-a2 and b1-b2; 0 if they touch or cross (decided exactly). */
export function distanceSegmentToSegment(a1: Point, a2: Point, b1: Point, b2: Point): number {
  if (segmentsIntersect(a1, a2, b1, b2).intersects) return 0;
  return Math.min(
    distancePointToSegment(a1, b1, b2),
    distancePointToSegment(a2, b1, b2),
    distancePointToSegment(b1, a1, a2),
    distancePointToSegment(b2, a1, a2),
  );
}

/**
 * Smallest distance between the OUTLINES of two polygons; 0 only if the outlines touch or cross.
 * Unlike `minClearance`, a polygon standing inside the other is measured to the other's edges:
 * this is the distance from a fixture or column to the nearest wall. Infinity if either is empty.
 */
export function minBoundaryDistance(a: readonly Point[], b: readonly Point[]): number {
  let best = Infinity;
  const na = a.length;
  const nb = b.length;
  for (let i = 0; i < na; i++) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % na]!;
    for (let j = 0; j < nb; j++) {
      const d = distanceSegmentToSegment(a1, a2, b[j]!, b[(j + 1) % nb]!);
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}

/**
 * Clear width between two convex or simple polygons: the minimum distance between them, and 0 if
 * they touch, overlap, or one contains the other. Symmetric. Infinity if either is empty.
 */
export function minClearance(a: readonly Point[], b: readonly Point[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  const d = minBoundaryDistance(a, b);
  if (d === 0) return 0;
  // Outlines do not meet, so either the polygons are apart or one is wholly inside the other.
  if (pointInPolygon(a[0]!, b) !== 'outside' || pointInPolygon(b[0]!, a) !== 'outside') return 0;
  return d;
}
