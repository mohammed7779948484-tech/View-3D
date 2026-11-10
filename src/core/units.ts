/**
 * Length units.
 *
 * Every length in a design document is stored as an INTEGER number of micrometres (um).
 * Integers give exact equality and no floating-point drift. All five supported units are a whole
 * number of micrometres, so whole inches, feet, millimetres, centimetres and metres convert exactly.
 */

/** Exact number of micrometres in one of each unit. */
export const UM_PER_UNIT = {
  mm: 1000,
  cm: 10000,
  m: 1000000,
  in: 25400,
  ft: 304800,
} as const;

/** A unit the owner can type a length in. */
export type LengthUnit = keyof typeof UM_PER_UNIT;

/** The supported units, in a fixed order. */
export const LENGTH_UNITS: readonly LengthUnit[] = ['mm', 'cm', 'm', 'in', 'ft'];

/**
 * A length exactly as the owner typed it. Documents keep this beside the stored um value so the
 * owner sees his own number back (for example 72 in, not 1828.8 mm).
 */
export type Entered = {
  /** The number as typed. */
  value: number;
  /** The unit it was typed in. */
  unit: LengthUnit;
};

/**
 * Converts a typed length to integer micrometres.
 * Rounds half away from zero (1/16 in = 1587.5 um becomes 1588 um; the error is at most 0.5 um).
 * Throws a RangeError when the input is NaN or infinite, or the result is not a safe integer.
 */
export function toUm(value: number, unit: LengthUnit): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`toUm: the length must be a finite number, got ${String(value)}`);
  }
  const magnitude = Math.round(Math.abs(value) * UM_PER_UNIT[unit]);
  if (!Number.isSafeInteger(magnitude)) {
    throw new RangeError(`toUm: ${String(value)} ${unit} is too large to store exactly`);
  }
  if (magnitude === 0) return 0; // never -0
  return value < 0 ? -magnitude : magnitude;
}

/**
 * Converts stored micrometres to a number in the given unit (for display or editing).
 * `toUm(fromUm(um, unit), unit) === um` holds for every integer up to at least 100 m.
 * Throws a RangeError when `um` is not a safe integer.
 */
export function fromUm(um: number, unit: LengthUnit): number {
  if (!Number.isSafeInteger(um)) {
    throw new RangeError(`fromUm: micrometres must be a safe integer, got ${String(um)}`);
  }
  return um / UM_PER_UNIT[unit];
}

/**
 * Formats a stored length for display, for example `formatLength(1828800, 'in', 0)` gives "72 in".
 * `decimals` is the fixed number of digits after the decimal point (0 to 20).
 */
export function formatLength(um: number, unit: LengthUnit, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) {
    throw new RangeError(`formatLength: decimals must be an integer from 0 to 20, got ${String(decimals)}`);
  }
  let text = fromUm(um, unit).toFixed(decimals);
  if (Number(text) === 0 && text.startsWith('-')) text = text.slice(1); // "-0" reads as an error
  return `${text} ${unit}`;
}
