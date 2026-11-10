/**
 * Raw rooms shared by the geometry tests. Integer micrometres, counter-clockwise.
 * Defined locally on purpose: geometry does not depend on the document schema.
 */
import type { Point } from '../../src/geometry/index.js';

export const MM = 1_000;
export const M = 1_000_000;

/** L-shaped room, 9 m x 7 m, with a 3 m x 3 m notch cut out of the top-right corner. */
export const L_ROOM: Point[] = [
  { x: 0, y: 0 },
  { x: 9 * M, y: 0 },
  { x: 9 * M, y: 4 * M },
  { x: 6 * M, y: 4 * M },
  { x: 6 * M, y: 7 * M },
  { x: 0, y: 7 * M },
];
/** 54 m^2 = 63 - 9. */
export const L_ROOM_AREA_UM2 = 54n * BigInt(M) * BigInt(M);

/** 400 mm square column standing inside the L room, centred at (3 m, 3 m). */
export const COLUMN: Point[] = [
  { x: 2_800_000, y: 2_800_000 },
  { x: 3_200_000, y: 2_800_000 },
  { x: 3_200_000, y: 3_200_000 },
  { x: 2_800_000, y: 3_200_000 },
];

/** Room with one wall at a non-right angle: wall 2 runs from (8 m, 2 m) to (6 m, 6 m). */
export const ANGLED_ROOM: Point[] = [
  { x: 0, y: 0 },
  { x: 8 * M, y: 0 },
  { x: 8 * M, y: 2 * M },
  { x: 6 * M, y: 6 * M },
  { x: 0, y: 6 * M },
];
export const ANGLED_WALL_INDEX = 2;

/** U-shaped room: a 3 m wide slot (x 3..6 m, y above 3 m) is outside. */
export const U_ROOM: Point[] = [
  { x: 0, y: 0 },
  { x: 9 * M, y: 0 },
  { x: 9 * M, y: 7 * M },
  { x: 6 * M, y: 7 * M },
  { x: 6 * M, y: 3 * M },
  { x: 3 * M, y: 3 * M },
  { x: 3 * M, y: 7 * M },
  { x: 0, y: 7 * M },
];

export function square(x0: number, y0: number, side: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x0 + side, y: y0 },
    { x: x0 + side, y: y0 + side },
    { x: x0, y: y0 + side },
  ];
}

/** Pure-BigInt reference cross product (a - o) x (b - o). */
export function refCross(o: Point, a: Point, b: Point): bigint {
  return (
    (BigInt(a.x) - BigInt(o.x)) * (BigInt(b.y) - BigInt(o.y)) -
    (BigInt(a.y) - BigInt(o.y)) * (BigInt(b.x) - BigInt(o.x))
  );
}

/** Pure-BigInt reference for twice the signed area. */
export function refArea2(poly: readonly Point[]): bigint {
  let s = 0n;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += BigInt(a.x) * BigInt(b.y) - BigInt(b.x) * BigInt(a.y);
  }
  return s;
}
