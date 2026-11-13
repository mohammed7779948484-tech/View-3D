/**
 * Spike for Milestone 3: does the layout engine (`autoLayout`, portable, no DOM or Node) run in a Web Worker
 * built by electron-vite, loaded from file:// under the app's Content Security Policy, and return exactly the
 * bytes `autoLayout` returns when called directly?
 *
 * ORACLE: here the oracle IS a direct call of `autoLayout` in Node, by design. The requirement is "the worker
 * returns exactly the bytes autoLayout returns when called directly", so the expected SHA-256 is the hash of
 * `JSON.stringify(autoLayout(request))` computed in this test process.
 * The app runs Electron's V8 and this test runs Node 22's V8, so a mismatch would be a real determinism
 * finding: report it, never loosen this test.
 *
 * Page contract (Diagnostics page, button "Test layout speed"):
 *   [data-layout-status]  running | done | failed
 *   [data-layout-sha256]  lower-case hex SHA-256 of the UTF-8 JSON text the worker returned
 *   [data-layout-options] number of options
 *   [data-layout-ms]      time the page measured, a finite number > 0
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { expect, test } from '@playwright/test';
import { seedProducts } from '../../src/catalog/index';
import type { Product } from '../../src/core/index';
import { autoLayout } from '../../src/layout/index';
import type { LayoutRequest } from '../../src/layout/index';
import { launchApp } from '../e2e/launch';

const seed = (id: string): Product => {
  const product = seedProducts.find((p) => p.id === id);
  if (product === undefined) throw new Error(`no seed product ${id}`);
  return product;
};
const item = (id: string, variantId: string, quantity: number) => ({ product: seed(id), variantId, quantity });

/** The request the page sends to the worker, written out from the issue text (outline in mm x 1000 = um). */
const request: LayoutRequest = {
  id: 'diagnostics-layout',
  name: 'Layout speed test (real catalog sizes, unverified)',
  room: {
    outline: [
      { x: 0, y: 0 },
      { x: 7_000_000, y: 0 },
      { x: 7_000_000, y: 5_000_000 },
      { x: 0, y: 5_000_000 },
    ],
    ceilingHeightUm: 3_000_000,
    columns: [],
    openings: [
      {
        id: 'entrance',
        kind: 'door',
        wallIndex: 0,
        offsetUm: 3_000_000,
        widthUm: 1_000_000,
        heightUm: 2_100_000,
        sillHeightUm: 0,
        door: { isEntrance: true, swing: 'in', hinge: 'start' },
      },
      {
        id: 'back-room-door',
        kind: 'door',
        wallIndex: 1,
        offsetUm: 3_000_000,
        widthUm: 900_000,
        heightUm: 2_100_000,
        sillHeightUm: 0,
        door: { isEntrance: false, swing: 'in', hinge: 'start' },
      },
    ],
  },
  items: [
    item('nhf-c', 'default', 1),
    item('nhf-6ft-extra-view-showcase', 'default', 2),
    item('nhf-6ft-full-view-led-lights-showcase', 'h42', 1),
    item('nhf-s-1', 'default', 2),
    item('nhf-g', 'default', 3),
  ],
};

test('worker spike: autoLayout in a Web Worker returns the same bytes as a direct call', async () => {
  test.setTimeout(120_000);

  const nodeStart = performance.now();
  const direct = autoLayout(request);
  const nodeMs = performance.now() - nodeStart;
  const expectedSha = createHash('sha256').update(JSON.stringify(direct), 'utf8').digest('hex');
  const expectedOptions = direct.options.length;
  expect(expectedOptions).toBeGreaterThan(0);

  const { app, page } = await launchApp();
  try {
    await page.getByRole('button', { name: 'Diagnostics' }).click();
    const [worker] = await Promise.all([
      page.waitForEvent('worker'),
      page.getByRole('button', { name: 'Test layout speed' }).click({ timeout: 10_000 }),
    ]);
    const workerUrl = worker.url();
    expect(workerUrl.startsWith('file://'), `worker url ${workerUrl}`).toBe(true);
    expect(workerUrl.endsWith('.js'), `worker url ${workerUrl}`).toBe(true);

    await expect(page.locator('[data-layout-status]')).toHaveAttribute('data-layout-status', 'done', {
      timeout: 90_000,
    });

    const attr = async (name: string) => (await page.locator(`[${name}]`).getAttribute(name)) ?? '';
    const sha = await attr('data-layout-sha256');
    const options = Number(await attr('data-layout-options'));
    const pageMs = Number(await attr('data-layout-ms'));

    console.log(`worker url: ${workerUrl}`);
    console.log(`layout time in the page (worker): ${pageMs} ms; in Node for the same call: ${nodeMs} ms`);

    expect(Number.isFinite(pageMs) && pageMs > 0, `data-layout-ms ${pageMs}`).toBe(true);
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(sha).toBe(expectedSha);
    expect(options).toBe(expectedOptions);
  } finally {
    await app.close();
  }
});
