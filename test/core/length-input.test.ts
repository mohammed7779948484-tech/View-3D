import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  formatAngle,
  formatDisplayLength,
  parseAngle,
  parseLength,
  type DisplayUnit,
  type LengthUnit,
} from '../../src/core/index';

// Expected micrometres are worked out by hand: value times the exact factor
// (mm 1000, cm 10 000, m 1 000 000, in 25 400, ft 304 800), half away from zero.

type OkRow = [text: string, unit: LengthUnit, um: number, value: number, entered: LengthUnit];

const okRows: OkRow[] = [
  ['1200', 'mm', 1_200_000, 1200, 'mm'],
  ['120', 'cm', 1_200_000, 120, 'cm'],
  ['120 cm', 'mm', 1_200_000, 120, 'cm'],
  ['1.2 m', 'cm', 1_200_000, 1.2, 'm'],
  ['1.2M', 'cm', 1_200_000, 1.2, 'm'],
  ['.5 m', 'cm', 500_000, 0.5, 'm'],
  ['72 in', 'cm', 1_828_800, 72, 'in'],
  ['72"', 'cm', 1_828_800, 72, 'in'],
  ['6\'', 'cm', 1_828_800, 6, 'ft'],
  ['6 ft', 'cm', 1_828_800, 6, 'ft'],
  ['5\' 3 1/2"', 'cm', 1_612_900, 63.5, 'in'],
  ['5ft 3-1/2in', 'cm', 1_612_900, 63.5, 'in'],
  ['5 ft 3.5 in', 'cm', 1_612_900, 63.5, 'in'],
  ['5\'3.5"', 'cm', 1_612_900, 63.5, 'in'],
  ['5\'3"', 'cm', 1_600_200, 63, 'in'],
  ['3/8"', 'cm', 9_525, 0.375, 'in'],
  ['3 1/2 in', 'cm', 88_900, 3.5, 'in'],
  ['3-1/2"', 'cm', 88_900, 3.5, 'in'],
  ['1/16 in', 'cm', 1_588, 0.0625, 'in'],
  ['٣٠٠٠', 'mm', 3_000_000, 3000, 'mm'],
  ['٣٠٠٠', 'cm', 30_000_000, 3000, 'cm'],
  ['1٫5 m', 'cm', 1_500_000, 1.5, 'm'],
  ['  450  ', 'mm', 450_000, 450, 'mm'],
  ['100 m', 'cm', 100_000_000, 100, 'm'],
];

describe('parseLength accepts', () => {
  it.each(okRows)('%j with default %s is %i um', (text, unit, um, value, entered) => {
    const result = parseLength(text, unit);
    expect(result).toEqual({ ok: true, um, entered: { value, unit: entered } });
  });
});

type BadRow = [text: string, code: string];

const badRows: BadRow[] = [
  ['', 'empty'],
  ['   ', 'empty'],
  ['abc', 'not-a-number'],
  ['12..5', 'not-a-number'],
  ['1/0 in', 'not-a-number'],
  ['5\' 3/', 'not-a-number'],
  ['12 yd', 'unknown-unit'],
  ['12 km', 'unknown-unit'],
  ['0', 'not-positive'],
  ['-5', 'not-positive'],
  ['0 mm', 'not-positive'],
  ['100.001 m', 'too-large'],
  ['1000 m', 'too-large'],
  ['1,5', 'use-a-point'],
  ['1,200', 'use-a-point'],
];

describe('parseLength refuses', () => {
  it.each(badRows)('%j with code %s and an English message', (text, code) => {
    const result = parseLength(text, 'cm');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(code);
    expect(result.message.length).toBeGreaterThan(0);
  });
});

const angleOk: [string, number][] = [
  ['90', 90_000_000],
  ['90°', 90_000_000],
  ['270 deg', 270_000_000],
  ['116.565051', 116_565_051],
  ['153.435°', 153_435_000],
  ['٩٠', 90_000_000],
  ['٩٠٫٥', 90_500_000],
];

describe('parseAngle', () => {
  it.each(angleOk)('%j is %i udeg', (text, udeg) => {
    expect(parseAngle(text)).toEqual({ ok: true, udeg });
  });

  const angleBad: [string, string][] = [
    ['', 'empty'],
    ['abc', 'not-a-number'],
    ['0', 'out-of-range'],
    ['360', 'out-of-range'],
    ['-90', 'out-of-range'],
    ['400', 'out-of-range'],
    ['90,5', 'use-a-point'],
  ];
  it.each(angleBad)('refuses %j with code %s and a message', (text, code) => {
    const result = parseAngle(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(code);
    expect(result.message.length).toBeGreaterThan(0);
  });
});

const displayRows: [um: number, unit: DisplayUnit, text: string][] = [
  [9_000_000, 'mm', '9000 mm'],
  [9_000_000, 'cm', '900 cm'],
  [4_472_136, 'cm', '447.2 cm'],
  [9_000_000, 'm', '9 m'],
  [4_472_136, 'm', '4.472 m'],
  [400_000, 'm', '0.4 m'],
  [4_472_136, 'in', '176 1/16"'],
  [1_828_800, 'in', '72"'],
  [9_525, 'in', '3/8"'],
  [4_472_136, 'ft-in', '14\' 8 1/16"'],
  [1_828_800, 'ft-in', '6\' 0"'],
  [1_612_900, 'ft-in', '5\' 3 1/2"'],
  [9_525, 'ft-in', '0\' 3/8"'],
  [-100_000, 'mm', '-100 mm'],
  [-100_000, 'cm', '-10 cm'],
  [1_500, 'mm', '2 mm'],
  [1_499, 'mm', '1 mm'],
  [303_212, 'ft-in', '0\' 11 15/16"'],
  [304_799, 'ft-in', '1\' 0"'],
];

describe('formatDisplayLength', () => {
  it.each(displayRows)('%i um in %s is %j', (um, unit, text) => {
    expect(formatDisplayLength(um, unit)).toBe(text);
  });
});

/** Independent reader: text shown by formatDisplayLength back to um. Not parseLength. */
function readBack(text: string, unit: DisplayUnit): number {
  const decimal = (s: string, factor: number): number => Math.round(Number(s) * factor);
  const sixteenths = (s: string): number => {
    // "N", "N a/b", or "a/b" followed by the inch mark
    const m = /^(?:(\d+) )?(?:(\d+)\/(\d+))?$/.exec(s);
    if (!m || (m[1] === undefined && m[2] === undefined)) throw new Error(`cannot read ${text}`);
    const whole = m[1] === undefined ? 0 : Number(m[1]);
    const frac = m[2] === undefined ? 0 : Number(m[2]) / Number(m[3]);
    return (whole + frac) * 25_400;
  };
  const wholeInch = (s: string): number => {
    // handles "72", "3/8", "176 1/16" (the 'N' alone case has no space)
    if (/^\d+$/.test(s)) return Number(s) * 25_400;
    return sixteenths(s);
  };
  switch (unit) {
    case 'mm':
      return decimal(text.replace(/ mm$/, ''), 1000);
    case 'cm':
      return decimal(text.replace(/ cm$/, ''), 10_000);
    case 'm':
      return decimal(text.replace(/ m$/, ''), 1_000_000);
    case 'in':
      return Math.round(wholeInch(text.replace(/"$/, '')));
    case 'ft-in': {
      const m = /^(\d+)' (.*)"$/.exec(text);
      if (!m) throw new Error(`cannot read ${text}`);
      return Math.round(Number(m[1]) * 304_800 + wholeInch(m[2] as string));
    }
    default:
      throw new Error(`unknown unit ${String(unit)}`);
  }
}

describe('formatDisplayLength accuracy', () => {
  it.each<DisplayUnit>(['mm', 'cm', 'm', 'in', 'ft-in'])(
    'text in %s reads back within 1 mm (fixed seed, 500 runs)',
    (unit) => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100_000_000 }), (um) => {
          const back = readBack(formatDisplayLength(um, unit), unit);
          return Math.abs(back - um) <= 1000;
        }),
        { seed: 20260801, numRuns: 500 },
      );
    },
  );
});

describe('formatAngle', () => {
  it.each<[number, string]>([
    [90_000_000, '90°'],
    [153_434_949, '153.435°'],
    [116_565_051, '116.565°'],
    [90_500_000, '90.5°'],
  ])('%i udeg is %j', (udeg, text) => {
    expect(formatAngle(udeg)).toBe(text);
  });
});
