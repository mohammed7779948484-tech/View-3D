/**
 * Planning numbers used by the validation rules and the auto-layout engine.
 * Every number is named here; none is written inline elsewhere. `configSources` says where
 * each one comes from (see NOTES.md, "Retail planning numbers").
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
  /** Depth kept clear just inside the entrance (decompression zone). */
  entranceClearDepthUm: number;
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
  secondaryAisleUm: toUm(900, 'mm'),
  staffSpaceUm: toUm(915, 'mm'),
  doorApproachDepthUm: toUm(1525, 'mm'),
  doorLatchSideUm: toUm(455, 'mm'),
  entranceClearDepthUm: toUm(1500, 'mm'),
  wallSnapMaxGapUm: 2,
  wallSnapDistanceUm: toUm(300, 'mm'),
  windowBandDepthUm: toUm(600, 'mm'),
  staffPassageUm: toUm(600, 'mm'),
  aisleToleranceUm: 100,
};

export const configSources: Record<keyof PlanningConfig, string> = {
  mainAisleUm: 'Owner requirement: main aisle at least 1200 mm.',
  secondaryAisleUm:
    'Owner requirement: secondary aisles at least 900 mm. ADA 2010 section 403.5.1 asks for 915 mm; flagged for the owner.',
  staffSpaceUm: 'POS vendor guidance (koronapos.com cash-wrap guide): at least 36 in behind the counter. Not a code.',
  doorApproachDepthUm: 'ADA 2010 section 404.2.4, front approach on the pull side: 60 in (1525 mm).',
  doorLatchSideUm: 'ADA 2010 section 404.2.4, front approach on the pull side: 18 in (455 mm) beyond the latch.',
  entranceClearDepthUm: 'Retail convention (decompression zone, 5 to 15 ft); our own conservative value.',
  wallSnapMaxGapUm: 'Our own rule: flush means within the geometry contact tolerance (2 um).',
  wallSnapDistanceUm: 'Our own rule for manual editing; to be tuned with the owner.',
  windowBandDepthUm: 'Our own rule; no published number found.',
  staffPassageUm: 'Our own rule; no published number found.',
  aisleToleranceUm: 'Our own rule: 0.1 mm, far below the 1 mm accuracy tolerance.',
};
