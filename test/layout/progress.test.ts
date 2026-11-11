/**
 * Issue M3-5: `autoLayout(request, { onProgress(done, total) })`.
 *
 * Blocks by hand: one per counter wall tried (at most 3; one `null` block when there is no
 * counter) times the two row directions, so total is 2, 4 or 6 (always even, 2..6). onProgress is
 * called once after each block with done = 1..total.
 *
 * ORACLE: the result without a callback (the requirement is "the callback never changes the
 * result", so the direct call is the oracle by design); block counts by hand.
 */
import { describe, expect, it } from 'vitest';
import { autoLayout } from '../../src/layout/index';
import type { LayoutRequest } from '../../src/layout/index';
import { angledEntrance, benchmark, scenarios, wallsFull } from './scenarios';

const requests: readonly LayoutRequest[] = [...scenarios, angledEntrance, wallsFull, benchmark];

function track(request: LayoutRequest): { calls: [number, number][]; text: string } {
  const calls: [number, number][] = [];
  const result = autoLayout(request, { onProgress: (done: number, total: number) => void calls.push([done, total]) });
  return { calls, text: JSON.stringify(result) };
}

describe('autoLayout progress', () => {
  for (const request of requests) {
    it(`${request.id}: consecutive calls ending at total, even total 2..6, same bytes`, { timeout: 120_000 }, () => {
      const { calls, text } = track(request);
      expect(calls.length).toBeGreaterThanOrEqual(2);
      const total = calls[0]![1];
      expect(total).toBeGreaterThanOrEqual(2);
      expect(total).toBeLessThanOrEqual(6);
      expect(total % 2).toBe(0);
      expect(calls).toEqual(Array.from({ length: total }, (_, i) => [i + 1, total]));
      expect(text).toBe(JSON.stringify(autoLayout(request)));
    });
  }

  it('a request without a counter has exactly 2 blocks', () => {
    const base = scenarios[0]!;
    const noCounter: LayoutRequest = {
      ...base,
      items: base.items.filter((i) => i.product.placement !== 'counter'),
    };
    expect(noCounter.items.length).toBe(base.items.length - 1);
    const { calls } = track(noCounter);
    expect(calls).toEqual([[1, 2], [2, 2]]);
  });

  it('a room with problems gives no progress call and reports the problems', () => {
    const base = scenarios[0]!;
    const noEntrance: LayoutRequest = { ...base, room: { ...base.room, openings: [] } };
    const calls: [number, number][] = [];
    const result = autoLayout(noEntrance, { onProgress: (d: number, t: number) => void calls.push([d, t]) });
    expect(calls).toEqual([]);
    expect(result.options).toEqual([]);
    expect(result.problems.length).toBeGreaterThan(0);
  });
});
