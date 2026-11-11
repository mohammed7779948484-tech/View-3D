/** A measured diagonal against the drawing, and warnings for values that are probably typos. */
import type { Point } from '../core/index';
import { captureConfig } from '../rules/index';
import type { Suspect } from './closure';
import { FULL_TURN_UDEG, wallsToOutline } from './walls';
import type { CapturedWall } from './walls';

/** A diagonal the owner measured with the tape, between two corners (0-based). */
export type Diagonal = { fromCorner: number; toCorner: number; measuredUm: number };
export type DiagonalResult = { ok: boolean; computedUm: number; differenceUm: number };

export function checkDiagonal(outline: readonly Point[], diagonal: Diagonal): DiagonalResult {
  const a = outline[diagonal.fromCorner];
  const b = outline[diagonal.toCorner];
  if (a === undefined || b === undefined) throw new RangeError(`checkDiagonal: corner ${diagonal.fromCorner} or ${diagonal.toCorner} is not in the outline`);
  const computedUm = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  const differenceUm = diagonal.measuredUm - computedUm;
  return { ok: Math.abs(differenceUm) <= captureConfig.diagonalToleranceUm, computedUm, differenceUm };
}

/** The suspects whose correction, applied alone, also matches the measured diagonal; order kept. */
export function suspectsMatchingDiagonal(walls: readonly CapturedWall[], suspects: readonly Suspect[], diagonal: Diagonal): Suspect[] {
  return suspects.filter((s) => {
    const fixed = walls.map((w, i) =>
      s.kind === 'wall-length' && i === s.wallIndex
        ? { ...w, lengthUm: s.correctedLengthUm }
        : s.kind === 'corner-angle' && i === s.cornerIndex
          ? { ...w, cornerAngleUdeg: s.correctedAngleUdeg }
          : w,
    );
    const drawn = wallsToOutline(fixed);
    return drawn.ok && checkDiagonal(drawn.outline, diagonal).ok;
  });
}

export type SanityWarningCode = 'wall-very-short' | 'wall-very-long' | 'corner-very-sharp';
export type SanityWarning = { code: SanityWarningCode; message: string; index: number };

/** Values that are allowed but probably mistyped, by index; a wall's warning before its corner's. */
export function sanityWarnings(walls: readonly CapturedWall[]): SanityWarning[] {
  const { shortWallUm, longWallUm, sharpCornerUdeg } = captureConfig;
  const warnings: SanityWarning[] = [];
  walls.forEach((wall, index) => {
    const n = index + 1;
    if (wall.lengthUm < shortWallUm) {
      warnings.push({ code: 'wall-very-short', message: `Wall ${n} is shorter than ${shortWallUm / 1000} mm. Is the length right?`, index });
    } else if (wall.lengthUm > longWallUm) {
      warnings.push({ code: 'wall-very-long', message: `Wall ${n} is longer than ${longWallUm / 1_000_000} m. Is the length right?`, index });
    }
    if (wall.cornerAngleUdeg < sharpCornerUdeg || wall.cornerAngleUdeg > FULL_TURN_UDEG - sharpCornerUdeg) {
      warnings.push({ code: 'corner-very-sharp', message: `The corner at the end of wall ${n} is very sharp. Is the angle right?`, index });
    }
  });
  return warnings;
}
