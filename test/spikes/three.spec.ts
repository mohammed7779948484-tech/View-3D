/**
 * Spike for Milestone 3: does WebGL work in the app, is the scene the right size, and how fast is it?
 * The Diagnostics page runs four setups (A 60 fixtures instanced, B with shadows, C one mesh per fixture,
 * D 120 fixtures) and shows the numbers. CI is software rendering (SwiftShader), so the verdict is not asserted;
 * only a loose sanity bound on A's p95. The real 30 fps claim is checked on the owner's laptop.
 */
import { expect, test } from '@playwright/test';
import { launchApp } from '../e2e/launch';

/** The benchmark document, written out here from the issue text (mm; 1 in = 25.4 mm, 1 ft = 304.8 mm). */
const VARIANTS = [
  { w: 72 * 25.4, d: 22 * 25.4, h: 38 * 25.4, rot: 0 },
  { w: 72 * 25.4, d: 20 * 25.4, h: 38 * 25.4, rot: 90 },
  { w: 72 * 25.4, d: 20 * 25.4, h: 42 * 25.4, rot: 0 },
  { w: 24 * 25.4, d: 20 * 25.4, h: 38 * 25.4, rot: 90 },
  { w: 4 * 304.8, d: 3 * 304.8, h: 5 * 304.8, rot: 0 },
  { w: 48 * 25.4, d: 20 * 25.4, h: 72 * 25.4, rot: 30 },
];

function expectedBoxes() {
  return Array.from({ length: 60 }, (_, i) => {
    const v = VARIANTS[i % 6]!;
    const r = Math.floor(i / 10);
    const c = i % 10;
    const xMm = 1100 + 2200 * c;
    const yMm = 1000 + 1900 * r;
    return {
      id: `bench-${String(i + 1).padStart(3, '0')}`,
      center: [xMm / 1000, v.h / 2000, -yMm / 1000],
      size: [v.w / 1000, v.h / 1000, v.d / 1000],
      yawRad: (v.rot * Math.PI) / 180,
    };
  });
}

const TWO_PI = 2 * Math.PI;

test('3D spike: WebGL2, instancing, frame times and box sizes on the Diagnostics page', async () => {
  test.setTimeout(300_000);
  const { app, page } = await launchApp();
  try {
    await page.getByRole('button', { name: 'Diagnostics' }).click();
    await page.getByRole('button', { name: 'Test 3D speed' }).click();
    await expect(page.locator('[data-benchmark-status]')).toHaveAttribute('data-benchmark-status', 'done', {
      timeout: 280_000,
    });

    await expect(page.locator('[data-webgl2]')).toHaveAttribute('data-webgl2', 'yes');
    const gpu = ((await page.locator('[data-gpu]').textContent()) ?? '').trim();
    expect(gpu.length).toBeGreaterThan(0);

    const spec = {
      A: { fixtures: '60', shadows: 'off', instanced: 'yes' },
      B: { fixtures: '60', shadows: 'on', instanced: 'yes' },
      C: { fixtures: '60', shadows: 'off', instanced: 'no' },
      D: { fixtures: '120', shadows: 'off', instanced: 'yes' },
    } as const;
    const stats: Record<string, { median: number; p95: number; draws: number; tris: number }> = {};
    for (const [name, want] of Object.entries(spec)) {
      const row = page.locator(`tr[data-setup="${name}"]`);
      const get = async (a: string) => (await row.getAttribute(`data-${a}`)) ?? '';
      expect(await get('fixtures'), `${name} fixtures`).toBe(want.fixtures);
      expect(await get('shadows'), `${name} shadows`).toBe(want.shadows);
      expect(await get('instanced'), `${name} instanced`).toBe(want.instanced);
      expect(await get('frames'), `${name} frames`).toBe('600');
      const median = Number(await get('median-ms'));
      const p95 = Number(await get('p95-ms'));
      expect(Number.isFinite(median) && median > 0, `${name} median ${median}`).toBe(true);
      expect(Number.isFinite(p95) && p95 > 0, `${name} p95 ${p95}`).toBe(true);
      stats[name] = { median, p95, draws: Number(await get('draw-calls')), tris: Number(await get('triangles')) };
      console.log(
        `3D setup ${name}: fixtures=${want.fixtures} shadows=${want.shadows} instanced=${want.instanced} frames=600 ` +
          `median=${median} ms p95=${p95} ms draws=${stats[name]!.draws} triangles=${stats[name]!.tris} gpu=${gpu}`,
      );
    }

    expect(stats['A']!.draws).toBeLessThanOrEqual(4);
    expect(stats['C']!.draws).toBeGreaterThanOrEqual(60);
    expect(stats['A']!.p95).toBeLessThan(200);

    expect(['pass', 'fail']).toContain(await page.locator('[data-verdict]').getAttribute('data-verdict'));

    const described = (await page.evaluate(
      `window.__view3dScene.describe()`,
    )) as { boxes: { id: string; center: number[]; size: number[]; yawRad: number }[] };
    expect(described.boxes).toHaveLength(60);
    const byId = new Map(described.boxes.map((b) => [b.id, b]));
    for (const want of expectedBoxes()) {
      const got = byId.get(want.id);
      expect(got, want.id).toBeDefined();
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(got!.center[k]! - want.center[k]!), `${want.id} center[${k}]`).toBeLessThanOrEqual(0.001);
        expect(Math.abs(got!.size[k]! - want.size[k]!), `${want.id} size[${k}]`).toBeLessThanOrEqual(0.001);
      }
      let dy = (got!.yawRad - want.yawRad) % TWO_PI;
      if (dy > Math.PI) dy -= TWO_PI;
      if (dy < -Math.PI) dy += TWO_PI;
      expect(Math.abs(dy), `${want.id} yaw`).toBeLessThanOrEqual(1e-4);
    }
  } finally {
    await app.close();
  }
});
