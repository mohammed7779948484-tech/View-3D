/**
 * Planning numbers used by the validation rules and the auto-layout engine.
 * Every number is named here; none is written inline elsewhere. `configSources` says where
 * each one comes from (see docs/NOTES.md, "Retail planning numbers").
 */
import { toUm } from '../core/index';

export type PlanningConfig = {
  /** Clear width of the main aisle (entrance to checkout counter). */
  mainAisleUm: number;
  /** Clear width of every other customer aisle. */
  secondaryAisleUm: number;
  /** Clear depth behind the checkout counter for staff. */
  staffSpaceUm: number;
  /** Depth kept clear in front of every door. */
  doorApproachDepthUm: number;
  /** Extra width kept clear beside the latch of a door that swings in. */
  doorLatchSideUm: number;
  /** Depth kept clear straight in from the entrance (decompression zone), at most. */
  entranceDecompressionDepthUm: number;
  /** ... and never more than this share of the shop depth, measured straight in from the entrance. */
  entranceDecompressionShare: number;
  /** Largest gap between a wall unit's back and its wall that still counts as flush. */
  wallSnapMaxGapUm: number;
  /** How far from a wall a unit may be and still be snapped onto it. */
  wallSnapDistanceUm: number;
  /** Depth of the band in front of a window where tall units are not allowed. */
  windowBandDepthUm: number;
  /** Narrowest passage staff need to get behind the counter. */
  staffPassageUm: number;
  /** An aisle this much narrower than required still passes (measurement tolerance). */
  aisleToleranceUm: number;
};

export const defaultConfig: PlanningConfig = {
  mainAisleUm: toUm(1200, 'mm'),
  secondaryAisleUm: toUm(915, 'mm'),
  staffSpaceUm: toUm(915, 'mm'),
  doorApproachDepthUm: toUm(1525, 'mm'),
  doorLatchSideUm: toUm(455, 'mm'),
  entranceDecompressionDepthUm: toUm(3000, 'mm'),
  entranceDecompressionShare: 1 / 3,
  wallSnapMaxGapUm: 2,
  wallSnapDistanceUm: toUm(300, 'mm'),
  windowBandDepthUm: toUm(600, 'mm'),
  staffPassageUm: toUm(600, 'mm'),
  aisleToleranceUm: 100,
};

export const configSources: Record<keyof PlanningConfig, string> = {
  mainAisleUm: 'Owner requirement: main aisle at least 1200 mm.',
  secondaryAisleUm: 'Owner decision 2026-11-10: 915 mm (36 in), the ADA 2010 section 403.5.1 clear width.',
  staffSpaceUm: 'POS vendor guidance (koronapos.com cash-wrap guide): at least 36 in behind the counter. Not a code.',
  doorApproachDepthUm: 'ADA 2010 section 404.2.4, front approach on the pull side: 60 in (1525 mm).',
  doorLatchSideUm: 'ADA 2010 section 404.2.4, front approach on the pull side: 18 in (455 mm) beyond the latch.',
  entranceDecompressionDepthUm: 'Owner decision 2026-11-10: about 3 m clear straight in from the entrance (retail convention: 5 to 15 ft).',
  entranceDecompressionShare: 'Owner decision 2026-11-10: one third of the shop depth when that is less than 3 m.',
  wallSnapMaxGapUm: 'Our own rule: flush means within the geometry contact tolerance (2 um).',
  wallSnapDistanceUm: 'Our own rule for manual editing; to be tuned with the owner.',
  windowBandDepthUm: 'Our own rule; no published number found.',
  staffPassageUm: 'Our own rule; no published number found.',
  aisleToleranceUm: 'Our own rule: 0.1 mm, far below the 1 mm accuracy tolerance.',
};

/** Checks on a room typed wall by wall (src/capture). */
export type CaptureConfig = {
  /** The walls close when the last one ends at most this far from the start. */
  closureToleranceUm: number;
  /** ... and the corner angles add up to (n - 2) x 180 degrees within this. */
  angleSumToleranceUdeg: number;
  /** A measured diagonal agrees with the drawing when it differs by at most this. */
  diagonalToleranceUm: number;
  /** A wall shorter than this is probably a typing mistake. */
  shortWallUm: number;
  /** A wall longer than this is probably a typing mistake. */
  longWallUm: number;
  /** A corner sharper than this (or this close to 360 degrees) is probably a typing mistake. */
  sharpCornerUdeg: number;
};

export const captureConfig: CaptureConfig = {
  closureToleranceUm: toUm(10, 'mm'),
  angleSumToleranceUdeg: 500_000,
  diagonalToleranceUm: toUm(20, 'mm'),
  shortWallUm: toUm(100, 'mm'),
  longWallUm: toUm(30, 'm'),
  sharpCornerUdeg: 15_000_000,
};

const FIRST_GUESS = 'Our own first guess, owner to confirm (docs/NOTES.md, open questions).';
export const captureConfigSources: Record<keyof CaptureConfig, string> = {
  closureToleranceUm: `${FIRST_GUESS} 10 mm.`,
  angleSumToleranceUdeg: `${FIRST_GUESS} 0.5 degrees.`,
  diagonalToleranceUm: `${FIRST_GUESS} 20 mm.`,
  shortWallUm: `${FIRST_GUESS} 100 mm.`,
  longWallUm: `${FIRST_GUESS} 30 m.`,
  sharpCornerUdeg: `${FIRST_GUESS} 15 degrees.`,
};
