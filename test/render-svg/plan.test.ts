import { describe, expect, it } from 'vitest';
import type { DesignDocument, Placement } from '../../src/core/index';
import { formatLength } from '../../src/core/index';
import { seedProducts } from '../../src/catalog/index';
import { wallSegments } from '../../src/geometry/index';
import { renderPlanSvg } from '../../src/render-svg/index';
import { svgToPng } from '../../src/render-svg/png';
import { snapToWall, defaultConfig } from '../../src/rules/index';
import { angledWall, fixtureRooms, lShapeWithColumn } from '../fixtures/rooms';
import { testGondolaDouble, testProducts, testShowcase, testTower, testWallShelf } from '../fixtures/products';
import { makeDoc, mm, place, pt } from '../rules/helpers';

/** Read the placement polygons back out of the SVG text: id -> corner points in um. */
function readPlacements(svg: string): Map<string, { points: { x: number; y: number }[]; widthUm: number; depthUm: number }> {
  const out = new Map<string, { points: { x: number; y: number }[]; widthUm: number; depthUm: number }>();
  for (const m of svg.matchAll(/<polygon data-placement-id="([^"]+)"[^>]*data-width-um="(\d+)" data-depth-um="(\d+)"[^>]*data-plan-points="([^"]+)"/g)) {
    const points = m[4]!.split(' ').map((pair) => {
      const [x, y] = pair.split(',').map(Number) as [number, number];
      return { x: x * 1000, y: y * 1000 };
    });
    out.set(m[1]!, { points, widthUm: Number(m[2]), depthUm: Number(m[3]) });
  }
  return out;
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function angledDoc(): DesignDocument {
  const wall = wallSegments(angledWall.outline)[2]!;
  const snap = snapToWall(angledWall, { center: pt(6700, 3800), widthUm: mm(1200), depthUm: mm(400), rotationUdeg: wall.angleUdeg }, defaultConfig)!;
  const onAngle: Placement = { ...place('angled', testWallShelf, 0, 0), center: snap.center, rotationUdeg: snap.rotationUdeg };
  return makeDoc(angledWall, testProducts, [
    onAngle,
    place('g0', testGondolaDouble, 3000, 3500),
    place('g90', testGondolaDouble, 1500, 3000, 90),
    place('s180', testShowcase, 2500, 5750, 180),
    place('t270', testTower, 300, 800, 270),
  ]);
}

describe('dimension accuracy: the drawing matches the document', () => {
  it('every footprint read back from the SVG has the document size and centre within 1 mm', () => {
    const doc = angledDoc();
    const drawn = readPlacements(renderPlanSvg(doc));
    expect([...drawn.keys()].sort()).toEqual(doc.placements.map((p) => p.id).sort());
    let worstUm = 0;
    for (const placement of doc.placements) {
      const variant = doc.products.find((p) => p.id === placement.productId)!.variants[0]!;
      const d = drawn.get(placement.id)!;
      expect(d.widthUm).toBe(variant.widthUm);
      expect(d.depthUm).toBe(variant.depthUm);
      const [bl, br, fr, fl] = d.points as [typeof d.points[0], typeof d.points[0], typeof d.points[0], typeof d.points[0]];
      const errors = [
        dist(bl, br) - variant.widthUm!,
        dist(fl, fr) - variant.widthUm!,
        dist(bl, fl) - variant.depthUm!,
        dist(br, fr) - variant.depthUm!,
        (bl.x + br.x + fr.x + fl.x) / 4 - placement.center.x,
        (bl.y + br.y + fr.y + fl.y) / 4 - placement.center.y,
      ].map(Math.abs);
      worstUm = Math.max(worstUm, ...errors);
    }
    console.log(`worst deviation between SVG and document: ${worstUm.toFixed(2)} um`);
    expect(worstUm).toBeLessThan(1000); // the 1 mm tolerance
    expect(worstUm).toBeLessThan(3); // and in fact only integer rounding
  });

  it('the screen polygon is the plan polygon flipped in y, at the same scale (1 unit = 1 mm)', () => {
    const svg = renderPlanSvg(angledDoc());
    const m = svg.match(/<polygon data-placement-id="g0"[^>]*data-plan-points="([^"]+)" points="([^"]+)"/)!;
    const plan = m[1]!.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    const screen = m[2]!.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      expect(Math.hypot(screen[i]![0] - screen[j]![0], screen[i]![1] - screen[j]![1])).toBeCloseTo(
        Math.hypot(plan[i]![0] - plan[j]![0], plan[i]![1] - plan[j]![1]),
        2,
      );
      // x keeps its direction, y is flipped
      expect(screen[i]![0] - screen[j]![0]).toBeCloseTo(plan[i]![0] - plan[j]![0], 2);
      expect(screen[i]![1] - screen[j]![1]).toBeCloseTo(-(plan[i]![1] - plan[j]![1]), 2);
    }
  });

  it('the room outline and every wall dimension come straight from the document', () => {
    const svg = renderPlanSvg(makeDoc(angledWall, [], []));
    const outline = svg.match(/data-role="room-outline" data-plan-points="([^"]+)"/)![1]!;
    expect(outline).toBe(angledWall.outline.map((p) => `${(p.x / 1000).toFixed(3)},${(p.y / 1000).toFixed(3)}`).join(' '));
    const walls = wallSegments(angledWall.outline);
    const labels = [...svg.matchAll(/<text data-wall-index="(\d+)" data-length-um="(\d+)"[^>]*>([^<]+)<\/text>/g)];
    expect(labels).toHaveLength(walls.length);
    for (const label of labels) {
      const wall = walls[Number(label[1])]!;
      expect(Number(label[2])).toBe(Math.round(wall.lengthUm));
      expect(label[3]).toBe(formatLength(Math.round(wall.lengthUm), 'mm', 0));
    }
    // The angled wall from (8000, 2000) to (6000, 6000) is sqrt(2000^2 + 4000^2) = 4472.136 mm.
    expect(labels.find((l) => l[1] === '2')![3]).toBe('4472 mm');
  });
});

describe('determinism', () => {
  it('renders byte-identical output, whatever the order of the placements', () => {
    const doc = angledDoc();
    const first = renderPlanSvg(doc);
    expect(renderPlanSvg(doc)).toBe(first);
    expect(renderPlanSvg({ ...doc, placements: [...doc.placements].reverse() })).toBe(first);
  });
});

describe('content', () => {
  it('escapes text', () => {
    const odd = { ...testShowcase, id: 'odd', name: 'A & <B> "quoted"' };
    const svg = renderPlanSvg(makeDoc(lShapeWithColumn, [odd], [place('x', odd, 2000, 5000)]), { title: 'Tom & Jerry <shop>' });
    expect(svg).toContain('A &amp; &lt;B&gt; &quot;quoted&quot;');
    expect(svg).toContain('Tom &amp; Jerry &lt;shop&gt;');
    expect(svg).not.toMatch(/<B>/);
  });

  it('marks test-only fixtures and unverified products so they are never mistaken for confirmed data', () => {
    const synthetic = renderPlanSvg(makeDoc(lShapeWithColumn, testProducts, [place('x', testShowcase, 2000, 5000)]));
    expect(synthetic).toContain('Contains test-only fixtures (not real products)');
    const showcase = seedProducts.find((p) => p.id === 'nhf-6ft-extra-view-showcase')!;
    const real = renderPlanSvg(makeDoc(lShapeWithColumn, [showcase], [place('x', showcase, 2000, 5000)]));
    expect(real).not.toContain('test-only');
    expect(real).toContain('unverified');
  });

  it('shows lengths in the chosen unit', () => {
    const showcase = seedProducts.find((p) => p.id === 'nhf-6ft-extra-view-showcase')!;
    const svg = renderPlanSvg(makeDoc(lShapeWithColumn, [showcase], [place('x', showcase, 2000, 5000)]), {}, { unit: 'in' });
    expect(svg).toContain('72 × 22 × 38 in');
  });

  it('lists what did not fit with the reason, the violations, and the score lines', () => {
    const svg = renderPlanSvg(makeDoc(lShapeWithColumn, testProducts, [place('x', testShowcase, 2000, 5000)]), {
      unplaced: [{ name: 'TEST double-sided gondola', quantity: 2, reason: 'No free floor wide enough for another row.' }],
      violations: [{ placementIds: ['x'], message: 'Blocks the entrance.' }],
      scoreLines: ['Score 81 / 100', 'Counter faces entrance: yes'],
      rank: 2,
    });
    expect(svg).toContain('Did not fit');
    expect(svg).toContain('2 × TEST double-sided gondola');
    expect(svg).toContain('No free floor wide enough');
    expect(svg).toContain('Blocks the entrance.');
    expect(svg).toContain('Score 81 / 100');
    expect(svg).toContain('Option 2');
    expect(svg).toMatch(/data-placement-id="x"[^>]*data-violation="true"/);
  });
});

describe('PNG export', () => {
  it('renders every fixture room to a PNG of the requested width with real content', () => {
    for (const { room, name } of fixtureRooms) {
      const svg = renderPlanSvg(makeDoc(room, testProducts, [place('g', testGondolaDouble, 2000, 3000)]), { title: name });
      const png = svgToPng(svg, 800);
      expect(Array.from(png.subarray(1, 4))).toEqual([0x50, 0x4e, 0x47]);
      expect(png.readUInt32BE(16)).toBe(800); // IHDR width
      expect(png.length).toBeGreaterThan(8000);
    }
  });
});
