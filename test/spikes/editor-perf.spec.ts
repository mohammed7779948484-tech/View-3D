/**
 * Measurement for issue M2-6: how smooth is dragging a corner of a 200-corner room in the 2D editor?
 * It logs the median and 95th-percentile frame time while a drag runs. It asserts only p95 < 50 ms:
 * CI has no GPU; the 60 fps target is checked on the owner's laptop.
 */
import { expect, test } from '@playwright/test';
import { Harness, dragWorld } from '../e2e/editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

/** 200 corners, counter-clockwise, star-shaped around the origin, alternating radius 10 m and 8 m. */
function star(): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 200; i++) {
    const angle = (2 * Math.PI * i) / 200;
    const radiusUm = i % 2 === 0 ? 10_000_000 : 8_000_000;
    corners.push({ x: Math.round(radiusUm * Math.cos(angle)), y: Math.round(radiusUm * Math.sin(angle)) });
  }
  return corners;
}

test('dragging a corner of a 200-corner room keeps frames under 50 ms (p95)', async () => {
  const page = await h.launch();
  const outline = star();
  expect(outline).toHaveLength(200);
  await h.openRoom({ outline, ceilingHeightUm: 3_000_000, columns: [], openings: [] });
  await expect(page.locator('[aria-label="Corner 1"]')).toBeVisible({ timeout: 5000 });

  await page.evaluate(`(() => {
    window.__frames = [];
    window.__run = true;
    const tick = (t) => { window.__frames.push(t); if (window.__run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);

  // Corner 1 is at world (10000, 0) mm; drag it across the plan to (-2000, 5000) in 60 pointer moves.
  await dragWorld(page, { x: 10000, y: 0 }, { x: -2000, y: 5000 }, 60);

  const stamps = (await page.evaluate(`(() => { window.__run = false; return window.__frames; })()`)) as number[];
  const deltas = stamps.slice(1).map((t, i) => t - stamps[i]!).sort((a, b) => a - b);
  expect(deltas.length).toBeGreaterThan(5);
  const median = deltas[Math.floor(deltas.length / 2)]!;
  const p95 = deltas[Math.min(deltas.length - 1, Math.ceil(deltas.length * 0.95) - 1)]!;
  console.log(`editor drag, 200 corners, 60 moves: frames=${deltas.length} median=${median.toFixed(1)} ms p95=${p95.toFixed(1)} ms`);
  expect(p95).toBeLessThan(50);
});
