/**
 * Oriented rectangles (fixture footprints, clearance zones).
 *
 * Tolerance convention, shared by every function here: the rectangle is first shrunk by
 * `toleranceUm` on all four sides, then tested strictly. So touching, or penetrating by up to
 * the tolerance, is NOT overlapping / intersecting / outside. The default of 2 um absorbs the
 * rounding of rotated geometry to integer micrometres.
 */
import { pointInPolygon } from './polygon.js';
import { DEFAULT_TOLERANCE_UM, type OrientedRect, type Point } from './types.js';

const FULL_TURN_UDEG = 360_000_000;
const QUARTER_TURN_UDEG = 90_000_000;
const QUARTER_COS = [1, 0, -1, 0] as const;
const QUARTER_SIN = [0, 1, 0, -1] as const;

/** cos and sin of a rotation. Exact (no trig) for multiples of 90 degrees. */
function cosSin(rotationUdeg: number): { c: number; s: number } {
  const r = ((rotationUdeg % FULL_TURN_UDEG) + FULL_TURN_UDEG) % FULL_TURN_UDEG;
  if (r % QUARTER_TURN_UDEG === 0) {
    const q = r / QUARTER_TURN_UDEG;
    return { c: QUARTER_COS[q]!, s: QUARTER_SIN[q]! };
  }
  const rad = (r * Math.PI) / 180_000_000;
  return { c: Math.cos(rad), s: Math.sin(rad) };
}

/** Math.round, never returning negative zero. Halves round toward +infinity, consistently. */
function roundUm(v: number): number {
  return Math.round(v) + 0;
}

type Frame = { cx: number; cy: number; c: number; s: number; hw: number; hd: number };

function frameOf(rect: OrientedRect): Frame {
  const { c, s } = cosSin(rect.rotationUdeg);
  return { cx: rect.center.x, cy: rect.center.y, c, s, hw: rect.widthUm / 2, hd: rect.depthUm / 2 };
}

/** Unrounded corners: back-left, back-right, front-right, front-left. */
function floatCorners(f: Frame): [number, number][] {
  const local: [number, number][] = [
    [-f.hw, -f.hd],
    [f.hw, -f.hd],
    [f.hw, f.hd],
    [-f.hw, f.hd],
  ];
  return local.map(([lx, ly]) => [f.cx + (lx * f.c - ly * f.s), f.cy + (lx * f.s + ly * f.c)]);
}

/**
 * The four corners, counter-clockwise, rounded to integer um:
 * [back-left, back-right, front-right, front-left] in the rectangle's own frame, so
 * corners[0] -> corners[1] is the BACK edge and corners[2] -> corners[3] the FRONT edge.
 * Multiples of 90 degrees are computed without trigonometry and keep exactly width x depth
 * (odd sizes put corners on half micrometres; both sides then round the same way).
 */
export function rectCorners(rect: OrientedRect): Point[] {
  return floatCorners(frameOf(rect)).map(([x, y]) => ({ x: roundUm(x), y: roundUm(y) }));
}

/**
 * Separating-axis test. True only if the rectangles penetrate each other by MORE than
 * `toleranceUm` along every axis; sharing an edge or a corner is not overlap. Symmetric.
 */
export function rectsOverlap(a: OrientedRect, b: OrientedRect, toleranceUm: number = DEFAULT_TOLERANCE_UM): boolean {
  const fa = frameOf(a);
  const fb = frameOf(b);
  const ca = floatCorners(fa);
  const cb = floatCorners(fb);
  const axes: [number, number][] = [
    [fa.c, fa.s],
    [-fa.s, fa.c],
    [fb.c, fb.s],
    [-fb.s, fb.c],
  ];
  for (const [ux, uy] of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const [x, y] of ca) {
      const p = x * ux + y * uy;
      if (p < minA) minA = p;
      if (p > maxA) maxA = p;
    }
    for (const [x, y] of cb) {
      const p = x * ux + y * uy;
      if (p < minB) minB = p;
      if (p > maxB) maxB = p;
    }
    const depth = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (!(depth > toleranceUm)) return false;
  }
  return true;
}

/**
 * Does the segment a-b pass through the OPEN box (-hw, hw) x (-hd, hd) of the frame?
 * Running along a side or grazing a corner does not count. A box with no interior is never hit.
 */
function segmentHitsOpenBox(f: Frame, hw: number, hd: number, a: Point, b: Point): boolean {
  const ax = a.x - f.cx;
  const ay = a.y - f.cy;
  const bx = b.x - f.cx;
  const by = b.y - f.cy;
  const start = [ax * f.c + ay * f.s, -ax * f.s + ay * f.c] as const;
  const end = [bx * f.c + by * f.s, -bx * f.s + by * f.c] as const;
  const half = [hw, hd] as const;
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 2; k++) {
    const p = start[k]!;
    const d = end[k]! - p;
    const h = half[k]!;
    if (d === 0) {
      if (p <= -h || p >= h) return false;
    } else {
      const ta = (-h - p) / d;
      const tb = (h - p) / d;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
  }
  return t0 < t1;
}

function anyEdgeHitsShrunkRect(f: Frame, polygon: readonly Point[], toleranceUm: number): boolean {
  const hw = Math.max(f.hw - toleranceUm, 0);
  const hd = Math.max(f.hd - toleranceUm, 0);
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    if (segmentHitsOpenBox(f, hw, hd, polygon[i]!, polygon[(i + 1) % n]!)) return true;
  }
  return false;
}

/**
 * True iff the whole rectangle lies inside the simple polygon or on its boundary (within the
 * tolerance). Correct for concave polygons: it is not a corner test. The rectangle is inside
 * exactly when no polygon edge passes through its interior and its centre is inside; then the
 * interior cannot reach the outside without crossing the boundary.
 * Holes (columns) are not part of `polygon`: test them with `rectIntersectsPolygon`.
 */
export function rectInsidePolygon(
  rect: OrientedRect,
  polygon: readonly Point[],
  toleranceUm: number = DEFAULT_TOLERANCE_UM,
): boolean {
  if (polygon.length < 3) return false;
  if (anyEdgeHitsShrunkRect(frameOf(rect), polygon, toleranceUm)) return false;
  return pointInPolygon(rect.center, polygon) !== 'outside';
}

/**
 * True iff the rectangle and the simple polygon share interior area (deeper than the tolerance).
 * Touching is not intersecting. Use for columns and keep-clear zones. Covers every case:
 * crossing edges, polygon wholly inside the rectangle, rectangle wholly inside the polygon.
 */
export function rectIntersectsPolygon(
  rect: OrientedRect,
  polygon: readonly Point[],
  toleranceUm: number = DEFAULT_TOLERANCE_UM,
): boolean {
  if (polygon.length < 3) return false;
  if (anyEdgeHitsShrunkRect(frameOf(rect), polygon, toleranceUm)) return true;
  return pointInPolygon(rect.center, polygon) === 'inside';
}

/** Clearances around a fixture, in its own frame, in um. */
export type RectClearances = {
  /** Added beyond the front edge (local +y). */
  frontUm: number;
  /** Added beyond the back edge (local -y). */
  backUm: number;
  /** Added beyond EACH of the two side edges (local +-x). */
  sidesUm: number;
};

/**
 * The rectangle grown by clearances in its local frame; same rotation. The centre moves by
 * (front - back) / 2 along local +y and is rounded to integer um (exact for quarter turns
 * when front - back is even; otherwise within 0.5 um per axis).
 */
export function inflateRect(rect: OrientedRect, clearances: RectClearances): OrientedRect {
  const { c, s } = cosSin(rect.rotationUdeg);
  const shift = (clearances.frontUm - clearances.backUm) / 2;
  return {
    center: { x: roundUm(rect.center.x - s * shift), y: roundUm(rect.center.y + c * shift) },
    widthUm: rect.widthUm + 2 * clearances.sidesUm,
    depthUm: rect.depthUm + clearances.frontUm + clearances.backUm,
    rotationUdeg: rect.rotationUdeg,
  };
}
