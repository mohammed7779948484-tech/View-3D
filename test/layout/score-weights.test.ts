/**
 * M3 issue 10g, score weights decided by the owner (docs/NOTES.md question 15).
 *
 * New weights: placed 30, counterNear 12, counterFacing 8, showcasesNear 10, rows 10, evenUse 15,
 * openEntrance 15 (sum 100). The two trade-off pairs of snapshots/README.md "10g" must keep their
 * order: the guards below pass before and after the change, only the weights test fails today.
 * "Every option's score equals the sum of its terms" already exists in test/layout/layout.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { autoLayout, SCORE_WEIGHTS } from '../../src/layout/index';
import type { LayoutOption } from '../../src/layout/index';
import { scenarios } from './scenarios';

const note = (o: LayoutOption, term: string): string => o.scoreBreakdown.find((t) => t.term === term)!.note;
const optionsOf = (id: string): readonly LayoutOption[] => autoLayout(scenarios.find((s) => s.id === id)!).options;

describe('score weights (M3 10g)', () => {
  it('SCORE_WEIGHTS holds the decided values, in order', () => {
    expect({ ...SCORE_WEIGHTS }).toEqual({
      placed: 30,
      counterNear: 12,
      counterFacing: 8,
      showcasesNear: 10,
      rows: 10,
      evenUse: 15,
      openEntrance: 15,
    });
    expect(Object.keys(SCORE_WEIGHTS)).toEqual(['placed', 'counterNear', 'counterFacing', 'showcasesNear', 'rows', 'evenUse', 'openEntrance']);
  });

  it('SCORE_WEIGHTS values add up to exactly 100', () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('angled-wall: the option with the open view at the door (4140 mm) ranks before the even-floor option (2190 mm)', () => {
    const options = optionsOf('angled-wall');
    const open = options.find((o) => note(o, 'Open view from the entrance').startsWith('4140 mm'));
    const even = options.find((o) => note(o, 'Open view from the entrance').startsWith('2190 mm'));
    expect(open, 'an option with 4140 mm clear ahead of the door').toBeDefined();
    expect(even, 'an option with 2190 mm clear ahead of the door').toBeDefined();
    expect(note(open!, 'Even use of the floor')).toContain('7 of 8');
    expect(note(even!, 'Even use of the floor')).toContain('8 of 8');
    expect(open!.rank).toBeLessThan(even!.rank);
  });

  it('protected-doorway-real-products: the counter 2351 mm from the entrance ranks before the one at 3859 mm', () => {
    const options = optionsOf('protected-doorway-real-products');
    const near = options.find((o) => note(o, 'Counter near the entrance').startsWith('2351 mm'));
    const far = options.find((o) => note(o, 'Counter near the entrance').startsWith('3859 mm'));
    expect(near, 'an option with the counter 2351 mm away').toBeDefined();
    expect(far, 'an option with the counter 3859 mm away').toBeDefined();
    expect(near!.rank).toBeLessThan(far!.rank);
  });
});
