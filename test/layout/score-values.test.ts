/** M3 UX: every score term carries its numbers (`values`), so the page can word the note in the chosen language and unit. */
import { describe, expect, it } from 'vitest';
import { autoLayout } from '../../src/layout/index';
import { scenarios } from './scenarios';

type Valued = { term: string; note: string; values?: Record<string, number> };

const request = scenarios[0]!;
const options = autoLayout(request).options as unknown as { scoreBreakdown: Valued[] }[];
const terms = options.flatMap((o) => o.scoreBreakdown);

describe('score terms carry their numbers', () => {
  it('has options to look at', () => {
    expect(options.length).toBeGreaterThan(0);
  });

  it('every term has values: an object of finite numbers', () => {
    for (const t of terms) {
      expect(t.values, `values of "${t.term}"`).toBeTypeOf('object');
      expect(t.values).not.toBeNull();
      for (const [k, v] of Object.entries(t.values!)) {
        expect(Number.isFinite(v), `${t.term}.${k}`).toBe(true);
      }
    }
  });

  it('"Counter near the entrance" has distanceUm equal to the distance in the note (whole mm) times 1000, within 1000 um', () => {
    const near = terms.filter((t) => t.term === 'Counter near the entrance' && /mm from the entrance/.test(t.note));
    expect(near.length).toBeGreaterThan(0);
    for (const t of near) {
      const mm = Number(/^(\d+) mm from the entrance$/.exec(t.note)![1]);
      expect(t.values?.['distanceUm'], 'distanceUm').toBeDefined();
      expect(Math.abs(t.values!['distanceUm']! - mm * 1000)).toBeLessThanOrEqual(1000);
    }
  });

  it('"Fixtures placed" has placed and requested, matching its note "<placed> of <requested> placed"', () => {
    const placed = terms.filter((t) => t.term === 'Fixtures placed');
    expect(placed.length).toBeGreaterThan(0);
    for (const t of placed) {
      const m = /^(\d+) of (\d+) placed$/.exec(t.note)!;
      expect(t.values?.['placed'], 'placed').toBe(Number(m[1]));
      expect(t.values?.['requested'], 'requested').toBe(Number(m[2]));
    }
  });
});
