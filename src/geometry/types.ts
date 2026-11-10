/**
 * Shared geometry types.
 *
 * Units: every coordinate and length is an INTEGER number of micrometres (um). 1 mm = 1000 um.
 * Frame: plan view, x to the right, y up. Room outlines are counter-clockwise.
 */

/** A point in the plan, integer micrometres. Structurally identical to the document schema's Point. */
export type Point = { x: number; y: number };

/** A direction or unit vector. Components are plain floating-point numbers, not micrometres. */
export type Vec = { x: number; y: number };

/**
 * An oriented rectangle (a fixture footprint).
 * `widthUm` runs along local +x, `depthUm` along local +y.
 * `rotationUdeg` is in integer micro-degrees, counter-clockwise from the plan's +x axis.
 * The FRONT of the fixture faces local +y, the BACK faces local -y.
 */
export type OrientedRect = {
  center: Point;
  widthUm: number;
  depthUm: number;
  rotationUdeg: number;
};

/** Largest coordinate magnitude the exact math is specified for: 100 m. */
export const MAX_COORD_UM = 100_000_000;

/** Default geometric tolerance for "touching is not overlapping" decisions, in um. */
export const DEFAULT_TOLERANCE_UM = 2;
