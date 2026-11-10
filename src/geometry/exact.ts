/**
 * Exact integer math for plan geometry.
 *
 * Coordinates are integer micrometres and may reach 1e8 (100 m). The product of two coordinate
 * differences then reaches 4e16, above 2^53 (about 9.007e15), where floating point starts to drop
 * the last bits. Orientation tests and areas therefore go through BigInt whenever the operands are
 * large; a plain-number fast path is used only when the result is provably exact.
 * `test/geometry/exact.test.ts` proves this at 100 m x 100 m and shows the naive formula failing.
 *
 * All functions here require integer coordinates and throw a RangeError otherwise (from BigInt).
 */
import type { Point } from './types.js';

/**
 * If every factor is below 2^26 in magnitude, each product is below 2^52 and the sum or
 * difference of two products is below 2^53: exactly representable.
 */
const FAST_LIMIT = 67_108_864; // 2^26, about 67 m

function isSmall(ax: number, ay: number, bx: number, by: number): boolean {
  return (
    ax > -FAST_LIMIT && ax < FAST_LIMIT &&
    ay > -FAST_LIMIT && ay < FAST_LIMIT &&
    bx > -FAST_LIMIT && bx < FAST_LIMIT &&
    by > -FAST_LIMIT && by < FAST_LIMIT
  );
}

/**
 * Exact cross product (a - o) x (b - o), in um^2.
 * Positive: b is to the left of the directed line o -> a (counter-clockwise turn).
 */
export function cross(o: Point, a: Point, b: Point): bigint {
  const ax = a.x - o.x;
  const ay = a.y - o.y;
  const bx = b.x - o.x;
  const by = b.y - o.y;
  if (isSmall(ax, ay, bx, by)) return BigInt(ax * by - ay * bx);
  return BigInt(ax) * BigInt(by) - BigInt(ay) * BigInt(bx);
}

/**
 * Exact orientation of the triple (o, a, b):
 *  1 = counter-clockwise (b left of o -> a), -1 = clockwise, 0 = collinear.
 */
export function orientation(o: Point, a: Point, b: Point): -1 | 0 | 1 {
  const ax = a.x - o.x;
  const ay = a.y - o.y;
  const bx = b.x - o.x;
  const by = b.y - o.y;
  if (isSmall(ax, ay, bx, by)) {
    const c = ax * by - ay * bx;
    // Non-integer input falls through to BigInt, which rejects it loudly.
    if (Number.isInteger(c)) return c > 0 ? 1 : c < 0 ? -1 : 0;
  }
  const c = BigInt(ax) * BigInt(by) - BigInt(ay) * BigInt(bx);
  return c > 0n ? 1 : c < 0n ? -1 : 0;
}

/** Exact dot product (a - o) . (b - o), in um^2. */
export function dot(o: Point, a: Point, b: Point): bigint {
  const ax = a.x - o.x;
  const ay = a.y - o.y;
  const bx = b.x - o.x;
  const by = b.y - o.y;
  if (isSmall(ax, ay, bx, by)) return BigInt(ax * bx + ay * by);
  return BigInt(ax) * BigInt(bx) + BigInt(ay) * BigInt(by);
}

/**
 * Twice the signed area of a polygon, exact, in um^2.
 * Positive for counter-clockwise polygons, negative for clockwise ones.
 */
export function area2(polygon: readonly Point[]): bigint {
  let sum = 0n;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    sum += BigInt(a.x) * BigInt(b.y) - BigInt(b.x) * BigInt(a.y);
  }
  return sum;
}

/**
 * Unsigned area in mm^2 as a plain number. Safe: 100 m x 100 m is 1e10 mm^2, far below 2^53,
 * and the whole-mm^2 part is divided out exactly before converting.
 */
export function areaMm2(polygon: readonly Point[]): number {
  let a2 = area2(polygon);
  if (a2 < 0n) a2 = -a2;
  const UM2_PER_MM2_TIMES_2 = 2_000_000n;
  return Number(a2 / UM2_PER_MM2_TIMES_2) + Number(a2 % UM2_PER_MM2_TIMES_2) / 2_000_000;
}
