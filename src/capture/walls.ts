/**
 * A room typed wall by wall: each wall's length and the inside angle at the corner where it ends.
 * Wall 0 starts at (0, 0) and runs along +x; the outline turns left (counter-clockwise).
 */
import type { Point } from '../core/index';
import { cross, dot } from '../geometry/index';

export type CapturedWall = {
  /** Length of the wall, um. */
  lengthUm: number;
  /** Inside angle at the corner where this wall ends, udeg: 90 degrees square, 270 inner corner. */
  cornerAngleUdeg: number;
};

export type CaptureProblemCode = 'too-few-walls' | 'wall-length-not-positive' | 'not-an-integer' | 'corner-angle-out-of-range';
export type CaptureProblem = { code: CaptureProblemCode; message: string; index?: number };
export type OutlineResult = { ok: true; outline: Point[] } | { ok: false; problems: CaptureProblem[] };

export const FULL_TURN_UDEG = 360_000_000;
const HALF_TURN_UDEG = 180_000_000;
const QUARTER_TURN_UDEG = 90_000_000;
const UDEG_PER_RADIAN = HALF_TURN_UDEG / Math.PI;
const MIN_WALLS = 3;

/** Unit direction of a heading; quarter turns are exact so square rooms stay exact. */
export function direction(headingUdeg: number): { x: number; y: number } {
  switch (headingUdeg) {
    case 0:
      return { x: 1, y: 0 };
    case QUARTER_TURN_UDEG:
      return { x: 0, y: 1 };
    case HALF_TURN_UDEG:
      return { x: -1, y: 0 };
    case 3 * QUARTER_TURN_UDEG:
      return { x: 0, y: -1 };
    default: {
      const radians = headingUdeg / UDEG_PER_RADIAN;
      return { x: Math.cos(radians), y: Math.sin(radians) };
    }
  }
}

/** Heading of the next wall, exact integer udeg in [0, 360 degrees). */
export function nextHeading(headingUdeg: number, cornerAngleUdeg: number): number {
  return (((headingUdeg + HALF_TURN_UDEG - cornerAngleUdeg) % FULL_TURN_UDEG) + FULL_TURN_UDEG) % FULL_TURN_UDEG;
}

/**
 * Walks the first `count` walls from (0, 0). Returns the count + 1 corner positions as floats (not
 * rounded, so errors do not add up) and each walked wall's heading.
 */
export function walk(walls: readonly CapturedWall[], count: number): { points: { x: number; y: number }[]; headings: number[] } {
  const points = [{ x: 0, y: 0 }];
  const headings: number[] = [];
  let heading = 0;
  for (let i = 0; i < count; i++) {
    const wall = walls[i]!;
    const d = direction(heading);
    const last = points[points.length - 1]!;
    points.push({ x: last.x + wall.lengthUm * d.x, y: last.y + wall.lengthUm * d.y });
    headings.push(heading);
    heading = nextHeading(heading, wall.cornerAngleUdeg);
  }
  return { points, headings };
}

/** Problems with the typed values themselves, in wall order; [] when they can be drawn. */
export function captureProblems(walls: readonly CapturedWall[]): CaptureProblem[] {
  if (walls.length < MIN_WALLS) {
    return [{ code: 'too-few-walls', message: `A shop needs at least ${MIN_WALLS} walls; ${walls.length} were entered.` }];
  }
  const problems: CaptureProblem[] = [];
  walls.forEach((wall, index) => {
    const n = index + 1;
    if (!Number.isInteger(wall.lengthUm) || !Number.isInteger(wall.cornerAngleUdeg)) {
      problems.push({ code: 'not-an-integer', message: `Wall ${n}: the length or the corner angle is not a whole number of micrometres or micro-degrees.`, index });
    } else if (wall.lengthUm <= 0) {
      problems.push({ code: 'wall-length-not-positive', message: `Wall ${n}: the length must be more than zero.`, index });
    } else if (wall.cornerAngleUdeg <= 0 || wall.cornerAngleUdeg >= FULL_TURN_UDEG) {
      problems.push({ code: 'corner-angle-out-of-range', message: `Corner at the end of wall ${n}: the angle must be more than 0 and less than 360 degrees.`, index });
    }
  });
  return problems;
}

/**
 * The outline drawn by the walls: n corners, each rounded to the nearest um once. The last
 * wall's length and the last two angles are not needed to draw it; `checkClosure` checks them.
 */
export function wallsToOutline(walls: readonly CapturedWall[]): OutlineResult {
  const problems = captureProblems(walls);
  if (problems.length > 0) return { ok: false, problems };
  const { points } = walk(walls, walls.length - 1);
  return { ok: true, outline: points.map((p) => ({ x: Math.round(p.x) || 0, y: Math.round(p.y) || 0 })) };
}

/** The walls of a counter-clockwise outline: lengths rounded to um, inside angles to udeg. */
export function outlineToWalls(outline: readonly Point[]): CapturedWall[] {
  const n = outline.length;
  return outline.map((start, i) => {
    const end = outline[(i + 1) % n]!;
    const after = outline[(i + 2) % n]!;
    // Turn at `end` from this wall to the next, from the exact cross and dot products.
    const turn = Math.atan2(-Number(cross(end, start, after)), -Number(dot(end, start, after)));
    return {
      lengthUm: Math.round(Math.hypot(end.x - start.x, end.y - start.y)),
      cornerAngleUdeg: Math.round(HALF_TURN_UDEG - turn * UDEG_PER_RADIAN),
    };
  });
}
