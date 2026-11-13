/**
 * Issue M3-5: automatic layout off the UI thread, with progress and cancel, giving exactly the same result.
 *
 * ORACLE: the SHA-256 of the direct call `JSON.stringify(autoLayout(request))` computed in this test
 * process, by design: the requirement is that the worker returns exactly the bytes a direct call gives.
 * The request is built by hand here from the page contract (catalog order, no config, no maxOptions).
 *
 * Page contract: panel "Automatic layout" with `Quantity of <name>[, <variant label>]` fields, "Run",
 * "Cancel", a progressbar named "Layout progress"; `[data-auto-layout]` = idle | done | cancelled and
 * `data-result-sha256` once done.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedProducts } from '../../src/catalog/index';
import type { DesignDocument } from '../../src/core/index';
import { autoLayout } from '../../src/layout/index';
import type { LayoutRequest } from '../../src/layout/index';
import { benchmark } from '../layout/scenarios';
import { protectedDoorway } from '../fixtures/rooms';
import { Harness } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const product = (id: string) => seedProducts.find((p) => p.id === id)!;
const panel = (page: Page) => page.locator('[data-auto-layout]');
const qty = (page: Page, name: string) => page.getByRole('spinbutton', { name: `Quantity of ${name}`, exact: true });

/** Items in catalog (seed) order, as the page builds them. */
function items(wanted: Record<string, number>) {
  return seedProducts
    .filter((p) => wanted[p.id] !== undefined)
    .map((p) => ({ product: p, variantId: p.variants[0]!.id, quantity: wanted[p.id]! }));
}

async function fill(page: Page, quantities: [string, number][]): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Automatic layout' })).toBeVisible({ timeout: 5000 });
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'idle');
  for (const [name, n] of quantities) await qty(page, name).fill(String(n));
}

const names = {
  counter: product('nhf-c').name,
  extra: product('nhf-6ft-extra-view-showcase').name,
  stand: product('nhf-s-1').name,
  gondola: product('nhf-g').name,
};

test('a finished run returns exactly the bytes of a direct call and leaves the document unchanged', async () => {
  test.setTimeout(120_000);
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  const before = await h.saveAs();
  expect(before.placements).toEqual([]);

  await fill(page, [[names.counter, 1], [names.extra, 2], [names.stand, 2], [names.gondola, 3]]);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  // The progressbar may be missed when the run is very fast, so it is not required to be seen.
  const bar = page.getByRole('progressbar', { name: 'Layout progress' });
  if (await bar.isVisible()) {
    expect(Number(await bar.getAttribute('aria-valuemax'))).toBeGreaterThan(0);
  }
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'done', { timeout: 90_000 });

  const request: LayoutRequest = {
    id: 'room-test',
    name: 'Room test',
    room: protectedDoorway,
    items: items({ 'nhf-c': 1, 'nhf-6ft-extra-view-showcase': 2, 'nhf-s-1': 2, 'nhf-g': 3 }),
  };
  const expected = createHash('sha256').update(JSON.stringify(autoLayout(request)), 'utf8').digest('hex');
  await expect(panel(page)).toHaveAttribute('data-result-sha256', expected);

  // Test 3: a finished run does not change the document (issue 6 picks an option).
  expect((await h.saveAs()).placements).toEqual([]);
});

test('Cancel stops the run, leaves the document untouched, and a second run works', async () => {
  test.setTimeout(180_000);
  const doc: DesignDocument = {
    schemaVersion: 1,
    id: 'big-shop',
    name: 'Big shop',
    room: benchmark.room,
    products: [],
    placements: [],
  } as unknown as DesignDocument;
  const page = await h.launch();
  await h.openDocument(doc);
  const a = await h.saveAs();
  const aText = readFileSync(join(h.dir, 'saved-1.json'), 'utf8');

  const quantities: [string, number][] = [[names.counter, 1], [names.extra, 4], [names.gondola, 10], [names.stand, 8]];
  await fill(page, quantities);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); // no wait in between
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'cancelled');
  await expect(page.getByRole('progressbar', { name: 'Layout progress' })).toHaveCount(0);
  await expect(panel(page)).not.toHaveAttribute('data-result-sha256', /.*/);

  const b = await h.saveAs();
  const bText = readFileSync(join(h.dir, 'saved-2.json'), 'utf8');
  expect(b).toEqual(a);
  expect(bText).toBe(aText);

  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'done', { timeout: 150_000 });
  await expect(panel(page)).toHaveAttribute('data-result-sha256', /^[0-9a-f]{64}$/);
});
