import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseDesignDocument } from '../../src/core/index';
import type { DesignDocument, Placement } from '../../src/core/index';
import { rectsOverlap } from '../../src/geometry/index';
import { autoLayout } from '../../src/layout/index';
import type { LayoutOption, LayoutRequest } from '../../src/layout/index';
import { defaultConfig, entranceOf, flushWall, openingBand, placedFixtures, validateLayout } from '../../src/rules/index';
import { scenarios } from './scenarios';

const results = new Map<string, LayoutOption[]>();
const run = (request: LayoutRequest): LayoutOption[] => {
  if (!results.has(request.id)) results.set(request.id, autoLayout(request).options);
  return results.get(request.id)!;
};
const requested = (request: LayoutRequest): number => request.items.reduce((n, i) => n + i.quantity, 0);
const fixturesOf = (doc: DesignDocument) => placedFixtures(doc, defaultConfig);
const entrancePoint = (doc: DesignDocument) => {
  const band = openingBand(doc.room, entranceOf(doc.room)!, 0)!;
  return { x: (band[0]!.x + band[1]!.x) / 2, y: (band[0]!.y + band[1]!.y) / 2 };
};

describe.each(scenarios.map((s) => [s.id, s] as const))('auto layout: %s', (_id, request) => {
  it('returns several ranked options, best first', () => {
    const options = run(request);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.map((o) => o.rank)).toEqual(options.map((_, i) => i + 1));
    // Best first: more fixtures placed wins; the score decides between equals.
    for (let i = 1; i < options.length; i++) {
      const [better, worse] = [options[i - 1]!, options[i]!];
      const [n1, n2] = [better.document.placements.length, worse.document.placements.length];
      expect(n1).toBeGreaterThanOrEqual(n2);
      if (n1 === n2) expect(better.score).toBeGreaterThanOrEqual(worse.score);
    }
    const signatures = options.map((o) => JSON.stringify(o.document.placements));
    expect(new Set(signatures).size).toBe(options.length); // no two options are the same layout
  });

  it('every option is a valid design document that breaks no rule', () => {
    for (const option of run(request)) {
      expect(parseDesignDocument(JSON.parse(JSON.stringify(option.document))).ok).toBe(true);
      expect(validateLayout(option.document)).toEqual([]);
    }
  });

  it('accounts for every requested fixture: placed, or listed with a reason', () => {
    for (const option of run(request)) {
      const unplaced = option.unplaced.reduce((n, u) => n + u.quantity, 0);
      expect(option.document.placements.length + unplaced).toBe(requested(request));
      for (const u of option.unplaced) {
        expect(u.quantity).toBeGreaterThan(0);
        expect(u.reason.length).toBeGreaterThan(20);
      }
    }
  });

  it('explains its score with terms that add up', () => {
    for (const option of run(request)) {
      expect(option.scoreBreakdown.length).toBeGreaterThanOrEqual(4);
      const total = option.scoreBreakdown.reduce((n, t) => n + t.points, 0);
      expect(option.score).toBeCloseTo(total, 6);
      for (const term of option.scoreBreakdown) {
        expect(term.points).toBeGreaterThanOrEqual(0);
        expect(term.points).toBeLessThanOrEqual(term.weight + 1e-9);
        expect(term.note).toMatch(/\S/);
      }
    }
  });

  it('follows retail practice in the best option', () => {
    const best = run(request)[0]!;
    const doc = best.document;
    const fixtures = fixturesOf(doc);
    const counter = fixtures.find((f) => f.product.placement === 'counter');
    expect(counter, 'the counter is placed').toBeDefined();

    // Counter: staff space behind it is free (rule), and it does not turn its back on the entrance.
    const front = counter!.zones.find((z) => z.kind === 'customer')!.rect.center;
    const e = entrancePoint(doc);
    const facing =
      (front.x - counter!.rect.center.x) * (e.x - counter!.rect.center.x) +
      (front.y - counter!.rect.center.y) * (e.y - counter!.rect.center.y);
    expect(facing, 'counter front is on the entrance side').toBeGreaterThanOrEqual(0);

    // Wall units stand flush on walls; tall ones are not in front of windows (both also rules).
    for (const f of fixtures.filter((x) => x.product.placement === 'wall')) {
      expect(flushWall(doc.room, f.corners, defaultConfig), f.placement.id).toBeDefined();
    }
    // Gondolas form rows: all islands share one direction (mod 180 degrees).
    const islands = fixtures.filter((x) => x.product.placement === 'island');
    const directions = new Set(islands.map((f) => f.placement.rotationUdeg % 180_000_000));
    expect(directions.size).toBeLessThanOrEqual(1);

    // Glass showcases are near the counter: closer on average than the gondolas.
    const d = (p: Placement) => Math.hypot(p.center.x - counter!.rect.center.x, p.center.y - counter!.rect.center.y);
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    const showcases = fixtures.filter((x) => x.product.category === 'showcase' && x.product.placement === 'freestanding');
    if (showcases.length > 0 && islands.length > 0) {
      expect(mean(showcases.map((f) => d(f.placement)))).toBeLessThan(mean(islands.map((f) => d(f.placement))));
    }
    // No two fixtures overlap (also a rule; checked directly as a second line of defence).
    for (let i = 0; i < fixtures.length; i++) {
      for (let j = i + 1; j < fixtures.length; j++) expect(rectsOverlap(fixtures[i]!.rect, fixtures[j]!.rect)).toBe(false);
    }
  });

  it('is deterministic: same input, byte-identical output, whatever the order of the items', () => {
    const hash = (options: LayoutOption[]) => createHash('sha256').update(JSON.stringify(options)).digest('hex');
    const first = hash(run(request));
    expect(hash(autoLayout(request).options)).toBe(first);
    expect(hash(autoLayout({ ...request, items: [...request.items].reverse() }).options)).toBe(first);
  });
});

describe('auto layout: what did not fit', () => {
  it('small shop: places what fits, and says why the rest did not', () => {
    const request = scenarios.find((s) => s.id === 'small-overfull')!;
    const best = run(request)[0]!;
    expect(best.document.placements.length).toBeGreaterThanOrEqual(5);
    expect(best.unplaced.length).toBeGreaterThan(0);
    const gondolas = best.unplaced.find((u) => u.productId === 'test-gondola-double');
    expect(gondolas, 'six double gondolas cannot fit in 4 m x 5 m').toBeDefined();
    expect(gondolas!.reason).toMatch(/aisle|fixture|room|door|entrance/i);
    expect(gondolas!.positionsTried).toBeGreaterThan(0);
  });

  it('a product without dimensions is never placed and is reported as such', () => {
    const request = scenarios.find((s) => s.id === 'protected-doorway-real-products')!;
    for (const option of run(request)) {
      expect(option.document.placements.some((p) => p.productId === 'nhf-s')).toBe(false);
      const unknown = option.unplaced.find((u) => u.productId === 'nhf-s')!;
      expect(unknown.quantity).toBe(1);
      expect(unknown.reason).toMatch(/dimensions/i);
    }
  });

  it('real catalog sizes: everything with known dimensions fits in the 7 m x 5 m shop; the rest is named', () => {
    const request = scenarios.find((s) => s.id === 'protected-doorway-real-products')!;
    const best = run(request)[0]!;
    expect(best.unplaced.map((u) => u.productId)).toEqual(['nhf-jan', 'nhf-s']); // both have unknown sizes
    expect(best.document.placements.length).toBe(9);
  });
});

describe('auto layout: edge cases', () => {
  it('an empty request gives one option with nothing placed', () => {
    const options = autoLayout({ ...scenarios[0]!, items: [] }).options;
    expect(options).toHaveLength(1);
    expect(options[0]!.document.placements).toEqual([]);
  });

  it('works without a counter', () => {
    const request = { ...scenarios[1]!, items: scenarios[1]!.items.filter((i) => i.product.placement !== 'counter') };
    const options = autoLayout(request).options;
    expect(options.length).toBeGreaterThanOrEqual(1);
    for (const option of options) expect(validateLayout(option.document)).toEqual([]);
    expect(options[0]!.document.placements.length).toBeGreaterThan(5);
  });

  it('runs each scenario in a few seconds', () => {
    for (const request of scenarios) {
      const start = performance.now();
      autoLayout(request);
      const elapsed = performance.now() - start;
      console.log(`autoLayout ${request.id}: ${elapsed.toFixed(0)} ms`);
      expect(elapsed).toBeLessThan(20_000);
    }
  });
});
