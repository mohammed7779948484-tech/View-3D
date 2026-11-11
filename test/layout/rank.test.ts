/**
 * Ranking of automatic layout options (M3 issue 10b; docs/decisions/0003-rule-based-layout-engine.md,
 * point 5). The key is `placed + (completeBlock ? 1 : 0)`, highest first; on a tie a complete checkout
 * block first; then the higher score; then the strategy id in ascending text order.
 *
 * ORACLE: every key below is worked out by hand from that rule, never taken from the code.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Product } from '../../src/core/index';
import { autoLayout, compareOptions, rankFacts } from '../../src/layout/index';
import type { LayoutItem, LayoutOption, LayoutRequest, RankFacts } from '../../src/layout/index';
import { testBin, testCounterLong, testShowcase } from '../fixtures/products';
import { angledEntrance, benchmark, scenarios, wallsFull } from './scenarios';

const facts = (placed: number, completeBlock: boolean, score: number, strategyId = 'x'): RankFacts => ({ placed, completeBlock, score, strategyId });
const sign = (n: number): number => Math.sign(n);

describe('compareOptions: table worked out by hand', () => {
  it('equal keys 10 and 10: the complete block comes first, whatever the score', () => {
    const a = facts(10, false, 80, 'x');
    const b = facts(9, true, 70, 'y');
    expect(compareOptions(a, b)).toBeGreaterThan(0);
    expect(compareOptions(b, a)).toBeLessThan(0);
  });

  it('key 10 beats key 9 although the second has a complete block', () => {
    expect(compareOptions(facts(10, false, 10), facts(8, true, 99))).toBeLessThan(0);
  });

  it('key 10 (complete) beats key 9 (incomplete) at equal placed count', () => {
    expect(compareOptions(facts(9, true, 60), facts(9, false, 90))).toBeLessThan(0);
  });

  it('key 11 beats key 10, both complete', () => {
    expect(compareOptions(facts(10, true, 1), facts(9, true, 99))).toBeLessThan(0);
  });

  it('same key and block state: the higher score first', () => {
    expect(compareOptions(facts(7, false, 55.5), facts(7, false, 55.4))).toBeLessThan(0);
    expect(compareOptions(facts(7, false, 55.4), facts(7, false, 55.5))).toBeGreaterThan(0);
  });

  it('all else equal: strategy id in ascending text order', () => {
    const j = facts(7, true, 50, 'counter-wall-0_rows-across');
    const k = facts(7, true, 50, 'counter-wall-1_rows-across');
    expect(compareOptions(j, k)).toBeLessThan(0);
    expect(compareOptions(k, j)).toBeGreaterThan(0);
  });

  it('the cycle of decision 0003 sorts to one fixed order', () => {
    // P: 10 placed, incomplete, high score: key 10.   Q: 10 placed, complete, low score: key 11.
    // R: 9 placed, complete: key 10.   Q first (11); then R and P tie on 10, R has the complete block.
    const p = facts(10, false, 90, 'p');
    const q = facts(10, true, 20, 'q');
    const r = facts(9, true, 50, 'r');
    const expected = ['q', 'r', 'p'];
    for (const input of [[p, q, r], [p, r, q], [q, p, r], [q, r, p], [r, p, q], [r, q, p]]) {
      expect([...input].sort(compareOptions).map((f) => f.strategyId)).toEqual(expected);
    }
  });
});

describe('compareOptions: a total order (fast-check, fixed seed)', () => {
  const factsArb = fc.record({
    placed: fc.integer({ min: 0, max: 20 }),
    completeBlock: fc.boolean(),
    score: fc.integer({ min: 0, max: 100_000 }).map((n) => n / 1000),
    strategyId: fc.constantFrom('counter-none_rows-across', 'counter-wall-0_rows-across', 'counter-wall-0_rows-along', 'counter-wall-1_rows-across'),
  });
  const run = { seed: 20261111, numRuns: 500 };

  it('is antisymmetric', () => {
    fc.assert(fc.property(factsArb, factsArb, (a, b) => sign(compareOptions(a, b)) === -sign(compareOptions(b, a))), run);
  });

  it('is reflexive: an option equals itself', () => {
    fc.assert(fc.property(factsArb, (a) => compareOptions(a, { ...a }) === 0), run);
  });

  it('is transitive', () => {
    fc.assert(
      fc.property(factsArb, factsArb, factsArb, (a, b, c) => {
        fc.pre(compareOptions(a, b) <= 0 && compareOptions(b, c) <= 0);
        return compareOptions(a, c) <= 0;
      }),
      run,
    );
  });

  it('sorting does not depend on the input order', () => {
    fc.assert(
      fc.property(fc.array(factsArb, { maxLength: 12 }), fc.nat(), (list, shift) => {
        const k = list.length === 0 ? 0 : shift % list.length;
        const rotated = [...list.slice(k), ...list.slice(0, k)];
        const reversed = [...list].reverse();
        const one = JSON.stringify([...list].sort(compareOptions));
        return one === JSON.stringify(rotated.sort(compareOptions)) && one === JSON.stringify(reversed.sort(compareOptions));
      }),
      run,
    );
  });
});

describe('rankFacts: the checkout block is complete', () => {
  const variant = (p: Product): string => p.variants[0]!.id;
  const item = (product: Product, quantity: number): LayoutItem => ({ product, variantId: variant(product), quantity });
  const placement = (id: string, product: Product) => ({ id, productId: product.id, variantId: variant(product), center: { x: 0, y: 0 }, rotationUdeg: 0 });

  /** A minimal option: only the fields the ranking reads. */
  const option = (placements: ReturnType<typeof placement>[], cashWrap: string[], score = 42.5): LayoutOption =>
    ({
      score,
      strategy: { id: 'counter-wall-0_rows-across' },
      document: { placements, products: [testCounterLong, testShowcase, testBin] },
      cashWrap,
    }) as unknown as LayoutOption;
  const request = (items: LayoutItem[]): LayoutRequest => ({ id: 'r', name: 'r', room: {} as LayoutRequest['room'], items });

  const counter = placement('c', testCounterLong);
  const s1 = placement('s1', testShowcase);
  const s2 = placement('s2', testShowcase);
  const bin = placement('b', testBin);

  it('counter and both requested showcases in cashWrap: complete, with the plain facts copied', () => {
    const facts = rankFacts(option([counter, s1, s2, bin], ['c', 's1', 's2']), request([item(testCounterLong, 1), item(testShowcase, 2), item(testBin, 1)]));
    expect(facts).toEqual({ placed: 4, completeBlock: true, score: 42.5, strategyId: 'counter-wall-0_rows-across' });
  });

  it('a requested showcase outside cashWrap: incomplete', () => {
    const facts = rankFacts(option([counter, s1, s2], ['c', 's1']), request([item(testCounterLong, 1), item(testShowcase, 2)]));
    expect(facts.completeBlock).toBe(false);
    expect(facts.placed).toBe(3);
  });

  it('no counter requested: incomplete, even with showcases in cashWrap', () => {
    const facts = rankFacts(option([s1, s2], ['s1', 's2']), request([item(testShowcase, 2)]));
    expect(facts.completeBlock).toBe(false);
  });

  it('counter requested but not placed: incomplete', () => {
    const facts = rankFacts(option([s1, s2], ['s1', 's2']), request([item(testCounterLong, 1), item(testShowcase, 2)]));
    expect(facts.completeBlock).toBe(false);
  });

  it('counter alone, no showcases requested: complete', () => {
    const facts = rankFacts(option([counter], ['c']), request([item(testCounterLong, 1)]));
    expect(facts.completeBlock).toBe(true);
  });

  it('showcase quantities add up across request items', () => {
    const facts = rankFacts(option([counter, s1, s2], ['c', 's1', 's2']), request([item(testCounterLong, 1), item(testShowcase, 1), item(testShowcase, 1)]));
    expect(facts.completeBlock).toBe(true);
  });
});

describe('autoLayout: options come out in ranking order', () => {
  for (const req of [...scenarios, angledEntrance, wallsFull, benchmark]) {
    it(`${req.id}: sorted by compareOptions, ranks 1..n`, { timeout: 60_000 }, () => {
      const { options } = autoLayout(req);
      expect(options.length).toBeGreaterThan(0);
      options.forEach((o, i) => expect(o.rank).toBe(i + 1));
      for (let i = 1; i < options.length; i++) {
        expect(compareOptions(rankFacts(options[i - 1]!, req), rankFacts(options[i]!, req))).toBeLessThanOrEqual(0);
      }
    });
  }
});
