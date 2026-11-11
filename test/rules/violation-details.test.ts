/**
 * Issue M3-3: every violation carries a stable `detail` code and the numbers of its message
 * (`values`), so the app can word it in any language. The English `message` does not change.
 * Layouts and expected values are written by hand in test/fixtures/violation-cases.ts.
 */
import { describe, expect, it } from 'vitest';
import type { Placement } from '../../src/core/index';
import { validateLayout } from '../../src/rules/index';
import { testBin } from '../fixtures/products';
import { violationCases } from '../fixtures/violation-cases';
import { makeDoc, place, rectRoom } from './helpers';

describe('violation details', () => {
  for (const c of violationCases) {
    it(`${c.name}: rule, fixtures, detail, values and the English sentence`, () => {
      const found = validateLayout(c.doc).filter(
        (v) => v.rule === c.rule && v.placementIds[0] === c.first && (c.openingId === undefined || v.openingId === c.openingId),
      );
      expect(found).toHaveLength(1);
      const v = found[0]!;
      expect(v.rule).toBe(c.rule);
      expect(v.placementIds).toEqual(c.expected.placementIds);
      expect(v.detail).toBe(c.expected.detail);
      expect(v.values).toEqual(c.expected.values);
      expect(v.openingId).toBe(c.expected.openingId);
      expect(v.columnId).toBe(c.expected.columnId);
      expect(v.message).toBe(c.expected.message);
    });
  }
});

describe('timing', () => {
  it('validates 40 fixtures in a 15 m x 10 m room in under 50 ms (median of 5 runs)', () => {
    const placements: Placement[] = [];
    // A grid of 8 x 5 bins, 1800 mm apart.
    for (let i = 0; i < 40; i++) {
      placements.push(place(`b${String(i).padStart(2, '0')}`, testBin, 1000 + (i % 8) * 1800, 1500 + Math.floor(i / 8) * 1800));
    }
    const doc = makeDoc(rectRoom(15000, 10000), [testBin], placements);
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      validateLayout(doc);
      times.push(performance.now() - start);
    }
    const median = [...times].sort((a, b) => a - b)[2]!;
    console.log(`validateLayout, 40 fixtures, 15 m x 10 m: median ${median.toFixed(1)} ms of ${times.map((t) => t.toFixed(1)).join(', ')}`);
    expect(median).toBeLessThan(50);
  });
});
