import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LENGTH_UNITS, UM_PER_UNIT, formatLength, fromUm, toUm } from '../../src/core/index';
import type { Entered, LengthUnit } from '../../src/core/index';

const SEED = 20261110;
const HUNDRED_METRES_UM = 100_000_000;

describe('unit constants', () => {
  it('are the exact micrometre factors', () => {
    expect(UM_PER_UNIT).toEqual({ mm: 1000, cm: 10000, m: 1000000, in: 25400, ft: 304800 });
    expect([...LENGTH_UNITS].sort()).toEqual(['cm', 'ft', 'in', 'm', 'mm']);
  });
});

describe('toUm', () => {
  it('converts whole inches, feet, mm and cm exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: -4000, max: 4000 }), (n) => {
        expect(toUm(n, 'in')).toBe(n * 25400);
        expect(toUm(n, 'ft')).toBe(n * 304800);
        expect(toUm(n, 'mm')).toBe(n * 1000);
        expect(toUm(n, 'cm')).toBe(n * 10000);
        expect(toUm(n, 'm')).toBe(n * 1000000);
      }),
      { seed: SEED, numRuns: 500 },
    );
  });

  it('converts 100 m and 100 ft exactly', () => {
    expect(toUm(100, 'm')).toBe(100_000_000);
    expect(toUm(100, 'ft')).toBe(30_480_000);
  });

  it('keeps 1/16-inch multiples within 0.5 um and returns integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: -16 * 400, max: 16 * 400 }), (sixteenths) => {
        const um = toUm(sixteenths / 16, 'in');
        expect(Number.isInteger(um)).toBe(true);
        // 1/16 in = 1587.5 um exactly, so the true value is sixteenths * 1587.5.
        expect(Math.abs(um - sixteenths * 1587.5)).toBeLessThanOrEqual(0.5);
      }),
      { seed: SEED, numRuns: 500 },
    );
  });

  it('rounds half away from zero', () => {
    expect(toUm(1 / 16, 'in')).toBe(1588); // 1587.5 -> 1588
    expect(toUm(-1 / 16, 'in')).toBe(-1588); // -1587.5 -> -1588, not -1587
    expect(toUm(0.0005, 'mm')).toBe(1);
    expect(toUm(-0.0005, 'mm')).toBe(-1);
    expect(toUm(0.0004, 'mm')).toBe(0);
    expect(Object.is(toUm(-0.0004, 'mm'), 0)).toBe(true); // never -0
  });

  it('throws on non-finite input and on results that are not safe integers', () => {
    for (const unit of LENGTH_UNITS) {
      expect(() => toUm(Number.NaN, unit)).toThrow(RangeError);
      expect(() => toUm(Number.POSITIVE_INFINITY, unit)).toThrow(RangeError);
      expect(() => toUm(Number.NEGATIVE_INFINITY, unit)).toThrow(RangeError);
    }
    expect(() => toUm(1e12, 'm')).toThrow(RangeError);
    expect(() => toUm(Number.MAX_VALUE, 'ft')).toThrow(RangeError);
  });
});

describe('fromUm', () => {
  it('round-trips every integer up to 100 m in every unit', () => {
    const unitArb = fc.constantFrom<LengthUnit>(...LENGTH_UNITS);
    fc.assert(
      fc.property(
        fc.integer({ min: -HUNDRED_METRES_UM, max: HUNDRED_METRES_UM }),
        unitArb,
        (um, unit) => {
          expect(toUm(fromUm(um, unit), unit)).toBe(um);
        },
      ),
      { seed: SEED, numRuns: 5000 },
    );
    for (const unit of LENGTH_UNITS) {
      for (const um of [0, 1, -1, HUNDRED_METRES_UM, -HUNDRED_METRES_UM, HUNDRED_METRES_UM - 1]) {
        expect(toUm(fromUm(um, unit), unit)).toBe(um);
      }
    }
  });

  it('rejects values that are not safe integers', () => {
    expect(() => fromUm(1.5, 'mm')).toThrow(RangeError);
    expect(() => fromUm(Number.NaN, 'in')).toThrow(RangeError);
    expect(() => fromUm(Number.POSITIVE_INFINITY, 'in')).toThrow(RangeError);
  });
});

describe('formatLength', () => {
  it('formats a stored length for display', () => {
    expect(formatLength(1_828_800, 'in', 0)).toBe('72 in');
    expect(formatLength(1_828_800, 'ft', 1)).toBe('6.0 ft');
    expect(formatLength(1588, 'in', 4)).toBe('0.0625 in');
    expect(formatLength(1_371_600, 'mm', 1)).toBe('1371.6 mm');
    expect(formatLength(-400, 'mm', 0)).toBe('0 mm'); // no "-0"
  });

  it('rejects a bad decimals argument', () => {
    expect(() => formatLength(1000, 'mm', -1)).toThrow(RangeError);
    expect(() => formatLength(1000, 'mm', 1.5)).toThrow(RangeError);
  });
});

describe('Entered', () => {
  it('keeps the typed value and unit beside the stored um value', () => {
    const entered: Entered = { value: 72, unit: 'in' };
    expect(toUm(entered.value, entered.unit)).toBe(1_828_800);
  });
});
