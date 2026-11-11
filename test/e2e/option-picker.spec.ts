/**
 * Issue M3-6: the option picker. After an automatic layout run the owner sees the ranked options with the explained
 * score and "did not fit", and picks one: picking replaces the placements (and embeds the option's products) as one undo step.
 *
 * ORACLE: the expected values come from the direct call `autoLayout(request)` computed in this test process, by design:
 * the picker must show and apply exactly the engine's options. The request is built by hand as in auto-layout.spec.ts.
 *
 * Page contract: after a finished run a section with the heading "Layout options" lists `[data-option="<rank>"]` in rank
 * order, each with the score as `score.toFixed(1)` + " / 100", a list of the score terms (`points.toFixed(1)` and
 * `/ <weight>`), a "Did not fit" list (name, `x <quantity>`, the reason worded by `unplacedText`) when something did
 * not fit, and a button "Use option <rank>".
 *
 * NOT TESTED HERE: "a room with problems shows the room problems instead of options" (no entrance). It is hard to reach
 * through the UI (the panel's behaviour with a problem room is not part of the contract), so the main agent covers it
 * with a unit test of the component or a later e2e.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedProducts } from '../../src/catalog/index';
import { autoLayout } from '../../src/layout/index';
import type { LayoutRequest } from '../../src/layout/index';
import { protectedDoorway } from '../fixtures/rooms';
import { Harness } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const product = (id: string) => seedProducts.find((p) => p.id === id)!;
const panel = (page: Page) => page.locator('[data-auto-layout]');
const qty = (page: Page, name: string) => page.getByRole('spinbutton', { name: `Quantity of ${name}`, exact: true });
const ARABIC = 'العربية';

const names = {
  counter: product('nhf-c').name,
  extra: product('nhf-6ft-extra-view-showcase').name,
  stand: product('nhf-s-1').name,
  gondola: product('nhf-g').name,
};

/** The request the page builds: items in catalog (seed) order, first variant, no config, no maxOptions. */
function requestFor(wanted: Record<string, number>): LayoutRequest {
  return {
    id: 'room-test',
    name: 'Room test',
    room: protectedDoorway,
    items: seedProducts
      .filter((p) => wanted[p.id] !== undefined)
      .map((p) => ({ product: p, variantId: p.variants[0]!.id, quantity: wanted[p.id]! })),
  };
}

async function run(page: Page, gondolas: number): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Automatic layout' })).toBeVisible({ timeout: 5000 });
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'idle');
  for (const [name, n] of [[names.counter, 1], [names.extra, 2], [names.stand, 2], [names.gondola, gondolas]] as [string, number][]) {
    await qty(page, name).fill(String(n));
  }
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'done', { timeout: 90_000 });
}

const section = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Layout options', exact: true }) });
const option = (page: Page, rank: number) => page.locator(`[data-option="${rank}"]`);

test('lists every option in rank order with its score and its score terms', async () => {
  test.setTimeout(120_000);
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await run(page, 3);

  const result = autoLayout(requestFor({ 'nhf-c': 1, 'nhf-6ft-extra-view-showcase': 2, 'nhf-s-1': 2, 'nhf-g': 3 }));
  expect(result.options.length).toBeGreaterThanOrEqual(2);

  await expect(page.getByRole('heading', { name: 'Layout options', exact: true })).toBeVisible();
  await expect(section(page).locator('[data-option]')).toHaveCount(result.options.length);
  const ranks = await section(page).locator('[data-option]').evaluateAll((els) => els.map((e) => e.getAttribute('data-option')));
  expect(ranks).toEqual(result.options.map((o) => String(o.rank)));

  for (const [i, o] of result.options.entries()) {
    const box = option(page, o.rank);
    await expect(box, `option ${i + 1}`).toContainText(`${o.score.toFixed(1)} / 100`);
    await expect(box.getByRole('button', { name: `Use option ${o.rank}`, exact: true })).toBeVisible();
    for (const term of o.scoreBreakdown) {
      const item = box.locator('li').filter({ hasText: `${term.points.toFixed(1)}` }).filter({ hasText: `/ ${term.weight}` });
      await expect(item.first(), `option ${o.rank} term ${term.term}`).toBeVisible();
    }
  }
});

test('Use option 2 replaces the placements and embeds its products, as one undo step', async () => {
  test.setTimeout(120_000);
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  const before = await h.saveAs();
  expect(before.placements).toEqual([]);
  await run(page, 3);

  const result = autoLayout(requestFor({ 'nhf-c': 1, 'nhf-6ft-extra-view-showcase': 2, 'nhf-s-1': 2, 'nhf-g': 3 }));
  const chosen = result.options[1]!;
  expect(chosen.document.placements.length).toBeGreaterThan(0);

  await option(page, 2).getByRole('button', { name: 'Use option 2', exact: true }).click();
  const picked = await h.saveAs();
  expect(picked.placements).toEqual(chosen.document.placements);
  for (const p of chosen.document.products) expect(picked.products).toContainEqual(p);
  expect(picked.room).toEqual(before.room);
  expect(picked.id).toBe(before.id);
  expect(picked.name).toBe(before.name);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const undone = await h.saveAs();
  expect(undone.placements).toEqual([]);

  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const redone = await h.saveAs();
  expect(redone.placements).toEqual(chosen.document.placements);
});

test('an over-full request shows what did not fit, with the reason, in English and in Arabic', async () => {
  test.setTimeout(120_000);
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await run(page, 25);

  const result = autoLayout(requestFor({ 'nhf-c': 1, 'nhf-6ft-extra-view-showcase': 2, 'nhf-s-1': 2, 'nhf-g': 25 }));
  const left = result.options[0]!.unplaced.find((u) => u.productId === 'nhf-g');
  expect(left, 'the first option leaves gondolas over').toBeDefined();
  expect(left!.quantity).toBeGreaterThan(0);

  const first = option(page, 1);
  await expect(first.getByText('Did not fit', { exact: true })).toBeVisible();
  const item = first.locator('li').filter({ hasText: names.gondola }).filter({ hasText: `x ${left!.quantity}` });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(left!.reason);

  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption({ label: ARABIC });
  await expect(page.getByRole('combobox', { name: 'اللغة', exact: true })).toBeVisible({ timeout: 5000 });
  const arabic = (await first.innerText()).replace(/\s+/g, ' ');
  expect(arabic).not.toContain(left!.reason);
  expect(arabic).toContain(String(left!.positionsTried));
  expect(arabic).not.toContain('{{');
  expect(/[٠-٩]/.test(arabic)).toBe(false);
});
