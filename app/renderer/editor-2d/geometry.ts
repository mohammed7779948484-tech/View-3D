/** Small helpers between the plan (integer um, y up) and the screen (svg, y down). */
import type { Point } from '../../../src/core/index';

/**
 * Drawing and dragging snap to a grid; exact lengths are typed afterwards. The grid is 100 mm unless
 * a screen pixel is too coarse to hit it (a small screen): then the next step that is at least
 * MIN_GRID_PIXELS wide, so a click always lands on the grid point the owner aimed at.
 */
const SKETCH_GRIDS_UM = [100_000, 200_000, 500_000, 1_000_000];
const MIN_GRID_PIXELS = 3;
const UM_PER_MM = 1000;

export const snap = (um: number, gridUm: number): number => Math.round(um / gridUm) * gridUm || 0;

export const wallLengthUm = (a: Point, b: Point): number => Math.round(Math.hypot(b.x - a.x, b.y - a.y));

/** The plan point under a pointer, snapped, from the world group's screen transform. */
export function pointerToPlan(world: SVGGElement, clientX: number, clientY: number): Point | null {
  const ctm = world.getScreenCTM();
  if (ctm === null) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  const umPerPixel = UM_PER_MM / Math.abs(ctm.a);
  const grid = SKETCH_GRIDS_UM.find((g) => g >= MIN_GRID_PIXELS * umPerPixel) ?? SKETCH_GRIDS_UM[SKETCH_GRIDS_UM.length - 1]!;
  return { x: snap(p.x * UM_PER_MM, grid), y: snap(p.y * UM_PER_MM, grid) };
}

/** Moves the end of wall i along the wall so the wall gets the new length; null for a wall of no length (no direction). */
export function withWallLength(outline: readonly Point[], i: number, lengthUm: number): Point[] | null {
  const start = outline[i]!;
  const endIndex = (i + 1) % outline.length;
  const end = outline[endIndex]!;
  const current = Math.hypot(end.x - start.x, end.y - start.y);
  if (current === 0) return null;
  const moved = {
    x: Math.round(start.x + ((end.x - start.x) / current) * lengthUm) || 0,
    y: Math.round(start.y + ((end.y - start.y) / current) * lengthUm) || 0,
  };
  return outline.map((p, k) => (k === endIndex ? moved : p));
}

/** The view box, in mm with y flipped, that shows the points with a margin. */
export function viewBoxAround(points: readonly Point[], marginMm: number): { x: number; y: number; width: number; height: number } {
  const xs = points.map((p) => p.x / UM_PER_MM);
  const ys = points.map((p) => p.y / UM_PER_MM);
  const minX = Math.min(...xs) - marginMm;
  const maxX = Math.max(...xs) + marginMm;
  const minY = Math.min(...ys) - marginMm;
  const maxY = Math.max(...ys) + marginMm;
  return { x: minX, y: -maxY, width: maxX - minX, height: maxY - minY };
}
