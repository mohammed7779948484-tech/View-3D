/**
 * Does the typed room close? If not, which single typed value would make it close?
 * Walls that run parallel cannot be told apart from lengths alone, so every candidate that fits is
 * returned; a measured diagonal (checks.ts) then picks among them.
 */
import { captureConfig } from '../rules/index';
import { captureProblems, direction, walk } from './walls';
import type { CapturedWall } from './walls';

export type Suspect =
  | { kind: 'wall-length'; wallIndex: number; correctedLengthUm: number; changeUm: number }
  | { kind: 'corner-angle'; cornerIndex: number; correctedAngleUdeg: number; changeUdeg: number };

export type ClosureResult = {
  /** True when the last wall ends at the start and the angles add up, within tolerance. */
  closes: boolean;
  /** Distance from where the last wall ends to where the first one starts, um. */
  gapUm: number;
  /** Sum of the inside angles minus (n - 2) x 180 degrees, udeg. */
  angleSumErrorUdeg: number;
  /** Each single value that, changed alone, closes the room. [] when it closes, or when no single change does. */
  suspects: Suspect[];
};

const HALF_TURN_UDEG = 180_000_000;

/** Where the last wall ends, as floats, walking every wall. */
function end(walls: readonly CapturedWall[]): { x: number; y: number } {
  return walk(walls, walls.length).points[walls.length]!;
}

/**
 * Throws a RangeError when the walls cannot be drawn: the caller checks them with `wallsToOutline`
 * first and shows those problems instead.
 */
export function checkClosure(walls: readonly CapturedWall[]): ClosureResult {
  if (captureProblems(walls).length > 0) throw new RangeError('checkClosure: the walls have problems; check them with wallsToOutline first');
  const { closureToleranceUm, angleSumToleranceUdeg } = captureConfig;
  const e = end(walls);
  const gapUm = Math.round(Math.hypot(e.x, e.y));
  const angleSumErrorUdeg = walls.reduce((sum, w) => sum + w.cornerAngleUdeg, 0) - (walls.length - 2) * HALF_TURN_UDEG;
  const anglesAgree = Math.abs(angleSumErrorUdeg) <= angleSumToleranceUdeg;
  if (gapUm <= closureToleranceUm && anglesAgree) return { closes: true, gapUm, angleSumErrorUdeg, suspects: [] };

  const suspects: Suspect[] = [];
  if (anglesAgree) {
    // Changing wall i by delta moves the end point by delta along that wall's direction.
    const { headings } = walk(walls, walls.length);
    walls.forEach((wall, wallIndex) => {
      const d = direction(headings[wallIndex]!);
      const delta = -(e.x * d.x + e.y * d.y);
      const remaining = Math.abs(e.x * d.y - e.y * d.x);
      const correctedLengthUm = Math.round(wall.lengthUm + delta);
      if (remaining <= closureToleranceUm && correctedLengthUm > 0) {
        suspects.push({ kind: 'wall-length', wallIndex, correctedLengthUm, changeUm: correctedLengthUm - wall.lengthUm });
      }
    });
  } else {
    walls.forEach((wall, cornerIndex) => {
      const correctedAngleUdeg = wall.cornerAngleUdeg - angleSumErrorUdeg;
      const fixed = walls.map((w, i) => (i === cornerIndex ? { ...w, cornerAngleUdeg: correctedAngleUdeg } : w));
      const f = end(fixed);
      if (Math.hypot(f.x, f.y) <= closureToleranceUm) {
        suspects.push({ kind: 'corner-angle', cornerIndex, correctedAngleUdeg, changeUdeg: -angleSumErrorUdeg });
      }
    });
  }
  return { closes: false, gapUm, angleSumErrorUdeg, suspects };
}
