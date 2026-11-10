/**
 * The result must not depend on how the shop is oriented on the plan. Each room is turned as a
 * whole by odd angles; the same fixtures must be placed, in the same number of rows, with the
 * same ranking, and the scores must agree within SCORE_TOLERANCE.
 */
import { describe, expect, it } from 'vitest';
import { autoLayout } from '../../src/layout/index';
import type { LayoutOption, LayoutRequest } from '../../src/layout/index';
import { validateLayout } from '../../src/rules/index';
import { rotateRoom } from '../fixtures/rotate';
import { angledEntrance, scenarios } from './scenarios';

const ANGLES = [17, 33.3, 45, 123.5];
/** Corner coordinates are rounded to 1 um after turning, which can move a score by a fraction of a point. */
const SCORE_TOLERANCE = 0.5;

const summary = (options: LayoutOption[]) =>
  options.map((o) => ({
    strategy: o.strategy.id,
    placed: o.document.placements.length,
    rows: o.rows.map((r) => r.placementIds.length),
    unplaced: o.unplaced.map((u) => [u.productId, u.quantity]),
  }));

const rooms: LayoutRequest[] = [
  scenarios.find((s) => s.id === 'angled-wall')!,
  scenarios.find((s) => s.id === 'l-shape-with-column')!,
  scenarios.find((s) => s.id === 'protected-doorway-real-products')!,
];

describe.each(rooms.map((r) => [r.id, r] as const))('rotation invariance: %s', (_id, request) => {
  const base = autoLayout(request).options;
  it.each(ANGLES)('turned by %s degrees: same fixtures, rows and ranking; score within tolerance', (angle) => {
    const turned = autoLayout({ ...request, room: rotateRoom(request.room, angle) }).options;
    expect(summary(turned)).toEqual(summary(base));
    turned.forEach((option, i) => {
      expect(Math.abs(option.score - base[i]!.score)).toBeLessThanOrEqual(SCORE_TOLERANCE);
      expect(validateLayout(option.document)).toEqual([]);
    });
  });
});

describe('entrance on an angled wall', () => {
  it('lays the shop out along that wall: counter placed, rows turned with the wall, every rule kept', () => {
    const options = autoLayout(angledEntrance).options;
    expect(options.length).toBeGreaterThanOrEqual(1);
    const best = options[0]!;
    expect(validateLayout(best.document)).toEqual([]);
    expect(best.cashWrap.length).toBeGreaterThanOrEqual(1);
    expect(best.rows.length).toBeGreaterThanOrEqual(1);
    const island = best.document.placements.find((p) => best.rows[0]!.placementIds.includes(p.id))!;
    expect(island.rotationUdeg % 90_000_000).not.toBe(0); // not axis-aligned: it follows the angled wall
    expect(best.rows.reduce((n, r) => n + r.placementIds.length, 0)).toBe(4);
  });
});
