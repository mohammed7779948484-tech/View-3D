/** Layout quality, from the owner's review of the first gallery. */
import { describe, expect, it } from 'vitest';
import type { DesignDocument } from '../../src/core/index';
import { minClearance, rectCorners, rectIntersectsPolygon } from '../../src/geometry/index';
import { autoLayout, describeObstacles } from '../../src/layout/index';
import type { LayoutOption, LayoutRequest } from '../../src/layout/index';
import { backIsCovered, defaultConfig, flushWall, keepClearZones, placedFixtures, validateLayout } from '../../src/rules/index';
import { benchmark, scenarios, wallsFull } from './scenarios';

const cache = new Map<string, LayoutOption[]>();
const run = (request: LayoutRequest): LayoutOption[] => {
  if (!cache.has(request.id)) cache.set(request.id, autoLayout(request).options);
  return cache.get(request.id)!;
};
const byId = (id: string): LayoutRequest => scenarios.find((s) => s.id === id)!;
const fixturesOf = (doc: DesignDocument) => placedFixtures(doc, defaultConfig);
const all = [...scenarios, wallsFull];

/** Position of a fixture across the rows: along its own front direction. */
function across(f: ReturnType<typeof fixturesOf>[number], reference: number): number {
  const a = (reference * Math.PI) / 180e6;
  return f.rect.center.x * -Math.sin(a) + f.rect.center.y * Math.cos(a);
}

describe.each(all.map((s) => [s.id, s] as const))('quality: %s', (_id, request) => {
  it('single-sided units stand against a wall or back to back, never with a free back', () => {
    for (const option of run(request)) {
      const fixtures = fixturesOf(option.document);
      for (const f of fixtures.filter((x) => x.product.placement === 'wall')) {
        const ok = flushWall(option.document.room, f.corners, defaultConfig) !== undefined || backIsCovered(f, fixtures, defaultConfig);
        expect(ok, `${option.strategy.id} ${f.placement.id}`).toBe(true);
      }
    }
  });

  it('island rows sit on one grid: equal spacing between row lines', () => {
    for (const option of run(request)) {
      const fixtures = fixturesOf(option.document);
      const lines = option.rows.map((row) => {
        const members = row.placementIds.map((id) => fixtures.find((f) => f.placement.id === id)!);
        const reference = members[0]!.rect.rotationUdeg % 180_000_000;
        const positions = members.map((m) => across(m, reference));
        // every fixture of a row is centred on the same line (1 mm)
        expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1000);
        return positions[0]!;
      });
      const sorted = [...lines].sort((a, b) => a - b);
      const gaps = sorted.slice(1).map((v, i) => v - sorted[i]!);
      if (gaps.length > 0) {
        const pitch = Math.min(...gaps);
        for (const gap of gaps) {
          const steps = gap / pitch;
          expect(Math.abs(steps - Math.round(steps)) * pitch, `${option.strategy.id}: rows off the grid`).toBeLessThan(1000);
        }
      }
      // every island is in exactly one row
      const inRows = option.rows.flatMap((r) => r.placementIds).sort();
      const islands = fixtures.filter((f) => option.rows.some((r) => r.placementIds.includes(f.placement.id))).map((f) => f.placement.id).sort();
      expect(inRows).toEqual(islands);
    }
  });

  it('no orphan: a fixture never stands alone in a row while other rows are runs', () => {
    for (const option of run(request)) {
      const sizes = option.rows.map((r) => r.placementIds.length);
      if (sizes.some((n) => n >= 2)) expect(sizes.filter((n) => n === 1), option.strategy.id).toEqual([]);
    }
  });

  it('nothing faces a door: no customer aisle runs through the approach of an inner door', () => {
    for (const option of run(request)) {
      const approaches = keepClearZones(option.document.room, defaultConfig).filter((z) => z.kind === 'door-approach');
      for (const f of fixturesOf(option.document)) {
        for (const zone of f.zones.filter((z) => z.kind === 'customer')) {
          for (const approach of approaches) {
            expect(rectIntersectsPolygon(zone.rect, approach.polygon), `${option.strategy.id} ${f.placement.id}`).toBe(false);
          }
        }
      }
    }
  });

  it('the counter and its showcases form one connected checkout block', () => {
    for (const option of run(request)) {
      const fixtures = fixturesOf(option.document);
      const block = option.cashWrap.map((id) => fixtures.find((f) => f.placement.id === id)!);
      if (block.length === 0) continue;
      expect(block.some((f) => f.product.placement === 'counter')).toBe(true);
      // connected: starting from the first member, every member is reached through touching neighbours
      const reached = new Set([block[0]!.placement.id]);
      for (let changed = true; changed; ) {
        changed = false;
        for (const f of block) {
          if (reached.has(f.placement.id)) continue;
          if (block.some((o) => reached.has(o.placement.id) && minClearance(rectCorners(f.rect), rectCorners(o.rect)) <= 5)) {
            reached.add(f.placement.id);
            changed = true;
          }
        }
      }
      expect(reached.size, option.strategy.id).toBe(block.length);
    }
  });

  it('every option still breaks no rule', () => {
    for (const option of run(request)) expect(validateLayout(option.document)).toEqual([]);
  });
});

describe('quality: specific expectations', () => {
  it('all glass showcases join the checkout block where they fit', () => {
    for (const id of ['l-shape-with-column', 'angled-wall', 'protected-doorway-real-products']) {
      const best = run(byId(id))[0]!;
      const showcases = fixturesOf(best.document).filter((f) => f.product.category === 'showcase' && f.product.placement === 'freestanding');
      expect(showcases.length).toBeGreaterThan(0);
      for (const s of showcases) expect(best.cashWrap, `${id} ${s.placement.id}`).toContain(s.placement.id);
    }
    // In the small shop at least one showcase stands with the counter.
    expect(run(byId('small-overfull'))[0]!.cashWrap.length).toBeGreaterThanOrEqual(2);
  });

  it('a small counter (24 in) still anchors the block', () => {
    const best = run(byId('protected-doorway-real-products'))[0]!;
    expect(best.cashWrap.length).toBe(4); // counter + 3 showcases
  });

  it('places at least as many fixtures as the first engine did', () => {
    const baseline: Record<string, number> = { 'l-shape-with-column': 17, 'angled-wall': 11, 'small-overfull': 8, 'protected-doorway-real-products': 9 };
    for (const [id, count] of Object.entries(baseline)) {
      expect(run(byId(id))[0]!.document.placements.length, id).toBeGreaterThanOrEqual(count);
    }
  });

  it('uses the lower part of the L-shaped shop', () => {
    const best = run(byId('l-shape-with-column'))[0]!;
    const lowerRight = best.document.placements.filter((p) => p.center.x > 6_000_000 && p.center.y < 4_000_000);
    expect(lowerRight.length).toBeGreaterThanOrEqual(2);
    expect(best.scoreBreakdown.map((t) => t.term)).toContain('Even use of the floor');
  });

  it('when the walls are full, the remaining shelving pairs up back to back', () => {
    const best = run(wallsFull)[0]!;
    const fixtures = fixturesOf(best.document);
    const free = fixtures.filter((f) => f.product.placement === 'wall' && flushWall(best.document.room, f.corners, defaultConfig) === undefined);
    expect(free.length).toBeGreaterThanOrEqual(2);
    expect(free.length % 2).toBe(0);
  });
});

describe('"did not fit" names the dominant cause', () => {
  it('leads with the reason most positions failed on, then the next ones', () => {
    const text = describeObstacles({ overlap: 100, 'own-access': 20, 'main-aisle': 1, 'outside-room': 5 }, 126, defaultConfig);
    expect(text).toMatch(/^Tried 126 positions\. Most failed because another fixture is already there \(100\)/);
    expect(text.indexOf('aisle space')).toBeGreaterThan(text.indexOf('another fixture'));
    expect(text).toMatch(/\(20\)/);
    expect(text).not.toMatch(/main aisle/); // only the top three causes are listed
  });

  it('handles a single cause and no attempts', () => {
    expect(describeObstacles({ column: 1 }, 1, defaultConfig)).toBe('Tried 1 position. It failed because a column is in the way (1).');
    expect(describeObstacles({}, 0, defaultConfig)).toMatch(/no wall or free floor/i);
  });
});

describe('speed', () => {
  /** Target for the review's benchmark (15 m x 10 m, 35 fixtures), all options. See docs/decisions. */
  const TARGET_MS = 3000;
  it(`lays out the benchmark shop within ${TARGET_MS} ms`, () => {
    autoLayout(byId('small-overfull')); // warm up
    const start = performance.now();
    const result = autoLayout(benchmark);
    const elapsed = performance.now() - start;
    const best = result.options[0]!;
    console.log(`benchmark 15x10 m: ${elapsed.toFixed(0)} ms, ${result.options.length} options, best places ${best.document.placements.length} of 35`);
    expect(validateLayout(best.document)).toEqual([]);
    expect(best.document.placements.length).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(TARGET_MS);
  });
});
