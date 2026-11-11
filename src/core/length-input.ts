/**
 * What the owner types into a length or angle field, and how lengths are shown back.
 * Typed text is read once, at the edge, into integer um or udeg plus what was typed (`Entered`).
 * Every display unit stays within 1 mm of the stored value (1/16 in is 1.5875 mm, so the worst
 * inch rounding is 0.79 mm).
 */
import { toUm, UM_PER_UNIT } from './units';
import type { Entered, LengthUnit } from './units';

export type LengthInputCode = 'empty' | 'not-a-number' | 'unknown-unit' | 'not-positive' | 'negative' | 'too-large' | 'use-a-point';
export type LengthInputResult = { ok: true; um: number; entered: Entered } | { ok: false; code: LengthInputCode; message: string };
export type AngleInputCode = 'empty' | 'not-a-number' | 'out-of-range' | 'use-a-point';
export type AngleInputResult = { ok: true; udeg: number } | { ok: false; code: AngleInputCode; message: string };
export type DisplayUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft-in';

/** Longest length accepted: the same 100 m limit as a room corner. */
const MAX_LENGTH_UM = 100_000_000;
const UDEG_PER_DEGREE = 1_000_000;
const FULL_TURN_UDEG = 360_000_000;
const SIXTEENTHS_PER_INCH = 16;
const INCHES_PER_FOOT = 12;
const UM_PER_MM = 1000;

const LENGTH_TEXT: Record<LengthInputCode, string> = {
  empty: 'Type a length.',
  'not-a-number': 'This is not a length. Type a number such as 1200, 120 cm or 5\' 3 1/2".',
  'unknown-unit': 'Unknown unit. Use mm, cm, m, in (") or ft (\').',
  'not-positive': 'A length must be more than zero.',
  negative: 'This value cannot be negative.',
  'too-large': 'A length can be at most 100 m.',
  'use-a-point': 'Use a point for decimals (1.5), not a comma.',
};
const ANGLE_TEXT: Record<AngleInputCode, string> = {
  empty: 'Type an angle in degrees.',
  'not-a-number': 'This is not an angle. Type a number of degrees such as 90 or 135.5.',
  'out-of-range': 'An angle must be more than 0 and less than 360 degrees.',
  'use-a-point': 'Use a point for decimals (90.5), not a comma.',
};

/** Eastern Arabic digits to 0-9 and the Arabic decimal separator to a point; trimmed, lower case. */
function normalize(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')
    .trim()
    .toLowerCase();
}

// A quantity: a mixed number (3 1/2, 3-1/2), a fraction (3/8) or a decimal (12, 12.5, .5).
const Q = String.raw`(\d+[ -]+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+)`;
const UNIT_OF: Record<string, LengthUnit> = { mm: 'mm', cm: 'cm', m: 'm', in: 'in', '"': 'in', ft: 'ft', "'": 'ft' };
const SINGLE = new RegExp(String.raw`^${Q}\s*(mm|cm|m|in|"|ft|')?$`);
const FEET_INCHES = new RegExp(String.raw`^${Q}\s*(?:ft|')\s*${Q}\s*(?:in|")?$`);
const WORD_UNIT = new RegExp(String.raw`^${Q}\s*[a-z]+$`);

/** The value of a quantity, or NaN for a fraction over zero. */
function quantity(text: string): number {
  const mixed = /^(\d+)[ -]+(\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[3]) === 0 ? NaN : Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) return Number(fraction[2]) === 0 ? NaN : Number(fraction[1]) / Number(fraction[2]);
  return Number(text);
}

const lengthError = (code: LengthInputCode): LengthInputResult => ({ ok: false, code, message: LENGTH_TEXT[code] });

/** Reads a typed length; no unit means `defaultUnit`. Feet and inches together are kept in inches. */
export function parseLength(text: string, defaultUnit: LengthUnit): LengthInputResult {
  return readLength(text, defaultUnit, 'positive');
}

/** Like parseLength, but zero is allowed: an offset from a wall's start, a sill height. */
export function parseDistance(text: string, defaultUnit: LengthUnit): LengthInputResult {
  return readLength(text, defaultUnit, 'zero-or-more');
}

/** Like parseLength, but any sign: a position on the plan. */
export function parseCoordinate(text: string, defaultUnit: LengthUnit): LengthInputResult {
  return readLength(text, defaultUnit, 'any');
}

function readLength(text: string, defaultUnit: LengthUnit, sign: 'positive' | 'zero-or-more' | 'any'): LengthInputResult {
  let t = normalize(text);
  if (t === '') return lengthError('empty');
  if (t.includes(',')) return lengthError('use-a-point');
  const negative = t.startsWith('-');
  if (negative) t = t.slice(1).trim();

  let entered: Entered;
  const both = FEET_INCHES.exec(t);
  const single = SINGLE.exec(t);
  if (both) {
    entered = { value: quantity(both[1]!) * INCHES_PER_FOOT + quantity(both[2]!), unit: 'in' };
  } else if (single) {
    entered = { value: quantity(single[1]!), unit: single[2] === undefined ? defaultUnit : UNIT_OF[single[2]]! };
  } else {
    return lengthError(WORD_UNIT.test(t) ? 'unknown-unit' : 'not-a-number');
  }
  if (!Number.isFinite(entered.value)) return lengthError('not-a-number');
  if (negative && entered.value !== 0) {
    if (sign === 'positive') return lengthError('not-positive');
    if (sign === 'zero-or-more') return lengthError('negative');
    entered = { value: -entered.value, unit: entered.unit };
  }
  if (Math.abs(entered.value) * UM_PER_UNIT[entered.unit] > MAX_LENGTH_UM + 0.5) return lengthError('too-large');
  const um = toUm(entered.value, entered.unit);
  if (sign === 'positive' && um <= 0) return lengthError('not-positive');
  if (Math.abs(um) > MAX_LENGTH_UM) return lengthError('too-large');
  return { ok: true, um, entered };
}

const angleError = (code: AngleInputCode): AngleInputResult => ({ ok: false, code, message: ANGLE_TEXT[code] });

/** Reads a typed angle in degrees (`90`, `90°`, `90 deg`), strictly between 0 and 360. */
export function parseAngle(text: string): AngleInputResult {
  const t = normalize(text);
  if (t === '') return angleError('empty');
  if (t.includes(',')) return angleError('use-a-point');
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:°|deg)?$/.exec(t);
  if (!match) return angleError('not-a-number');
  const udeg = Math.round(Number(match[1]) * UDEG_PER_DEGREE);
  if (udeg <= 0 || udeg >= FULL_TURN_UDEG) return angleError('out-of-range');
  return { ok: true, udeg };
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Whole inches plus a reduced fraction of sixteenths: `8 1/16"`, `3/8"`, `72"`, `0"`. */
function inchText(sixteenths: number): string {
  const whole = Math.floor(sixteenths / SIXTEENTHS_PER_INCH);
  const rest = sixteenths % SIXTEENTHS_PER_INCH;
  if (rest === 0) return `${whole}"`;
  const g = gcd(rest, SIXTEENTHS_PER_INCH);
  const fraction = `${rest / g}/${SIXTEENTHS_PER_INCH / g}`;
  return whole === 0 ? `${fraction}"` : `${whole} ${fraction}"`;
}

/** `whole.fraction` with `digits` decimals from an integer count of 10^-digits, trailing zeros dropped. */
function decimalText(count: number, digits: number): string {
  const scale = 10 ** digits;
  const fraction = String(count % scale).padStart(digits, '0').replace(/0+$/, '');
  return fraction === '' ? String(Math.floor(count / scale)) : `${Math.floor(count / scale)}.${fraction}`;
}

/** A stored length as shown to the owner: mm whole, cm to 0.1, m to 0.001, inches to 1/16. */
export function formatDisplayLength(um: number, unit: DisplayUnit): string {
  const size = Math.abs(um);
  const mm = Math.round(size / UM_PER_MM);
  // Twice um over the um in 1/16 in (1587.5 = 3175 / 2), so the division stays in integers until here.
  const sixteenths = Math.round((size * 2) / (UM_PER_UNIT.in * 2 / SIXTEENTHS_PER_INCH));
  const zero = unit === 'in' || unit === 'ft-in' ? sixteenths === 0 : mm === 0;
  const sign = um < 0 && !zero ? '-' : '';
  switch (unit) {
    case 'mm':
      return `${sign}${mm} mm`;
    case 'cm':
      return `${sign}${decimalText(mm, 1)} cm`;
    case 'm':
      return `${sign}${decimalText(mm, 3)} m`;
    case 'in':
      return `${sign}${inchText(sixteenths)}`;
    case 'ft-in': {
      const perFoot = SIXTEENTHS_PER_INCH * INCHES_PER_FOOT;
      return `${sign}${Math.floor(sixteenths / perFoot)}' ${inchText(sixteenths % perFoot)}`;
    }
  }
}

/** An angle to 0.001 degrees, trailing zeros dropped: `90°`, `153.435°`. */
export function formatAngle(udeg: number): string {
  const thousandths = Math.round(Math.abs(udeg) / 1000);
  return `${udeg < 0 && thousandths !== 0 ? '-' : ''}${decimalText(thousandths, 3)}°`;
}
