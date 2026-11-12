/**
 * UX round 2 (NOTES, hands-on review findings 5 to 9): preview an option before using it (C1), problem texts in the
 * chosen unit (C2), Arabic isolation of lengths and product names (C3), the wall table starting at 90 degrees (C4),
 * room problems near the plan and named (C5), the first door defaulting to the entrance (C6).
 *
 * ORACLE: option placement counts come from the direct call `autoLayout(request)` in this test process, as in
 * option-picker.spec.ts; every other expected value is worked out by hand in the comments.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedProducts } from '../../src/catalog/index';
import type { DesignDocument } from '../../src/core/index';
import { autoLayout } from '../../src/layout/index';
import type { LayoutRequest } from '../../src/layout/index';
import { lShapeWithColumn, protectedDoorway } from '../fixtures/rooms';
import { makeDoc, place, rectRoom } from '../rules/helpers';
import { Harness, um, unitSelect } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const ARABIC = 'العربية';
const product = (id: string) => seedProducts.find((p) => p.id === id)!;
const panel = (page: Page) => page.locator('[data-auto-layout]');
const qty = (page: Page, name: string) => page.getByRole('spinbutton', { name: `Quantity of ${name}`, exact: true });
const plan = (page: Page) => page.locator('svg[aria-label="Plan"]');
const option = (page: Page, rank: number) => page.locator(`[data-option="${rank}"]`);

const names = {
  counter: product('nhf-c').name,
  extra: product('nhf-6ft-extra-view-showcase').name,
  stand: product('nhf-s-1').name,
  gondola: product('nhf-g').name,
};

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

async function run(page: Page, quantities: [string, number][]): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Automatic layout' })).toBeVisible({ timeout: 5000 });
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'idle');
  for (const [name, n] of quantities) await qty(page, name).fill(String(n));
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'done', { timeout: 90_000 });
}

test('C1: "Show option 2 on the plan" previews it with a banner; the document and Undo are untouched; Back restores; Use still works', async () => {
  test.setTimeout(120_000);
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await run(page, [[names.counter, 1], [names.extra, 2], [names.stand, 2], [names.gondola, 3]]);

  const result = autoLayout(requestFor({ 'nhf-c': 1, 'nhf-6ft-extra-view-showcase': 2, 'nhf-s-1': 2, 'nhf-g': 3 }));
  const chosen = result.options[1]!;
  const count = chosen.document.placements.length;
  expect(count).toBeGreaterThan(0);

  await expect(plan(page).locator('[data-placement]')).toHaveCount(0);
  await option(page, 2).getByRole('button', { name: 'Show option 2 on the plan', exact: true }).click();

  await expect(plan(page).locator('[data-placement]')).toHaveCount(count, FIRST);
  const banner = page.getByRole('status').filter({ hasText: 'Showing option 2 on the plan. It is not used yet.' });
  await expect(banner).toBeVisible(FIRST);
  await expect(banner.getByRole('button', { name: 'Back to my layout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect((await h.saveAs()).placements).toEqual([]);

  await banner.getByRole('button', { name: 'Back to my layout', exact: true }).click();
  await expect(plan(page).locator('[data-placement]')).toHaveCount(0, FIRST);
  await expect(banner).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

  await option(page, 2).getByRole('button', { name: 'Use option 2', exact: true }).click();
  expect((await h.saveAs()).placements).toEqual(chosen.document.placements);
  await expect(plan(page).locator('[data-placement]')).toHaveCount(count, FIRST);
});

test('C2: a layout problem reads its lengths in the chosen unit (91.5 cm, not 915 mm)', async () => {
  const page = await h.launch();
  const extra = product('nhf-6ft-extra-view-showcase');
  // 6 x 6 m room. The showcase is 22 in = 558.8 mm deep and rear-served; its front faces +y at rotation 0, so its back
  // zone (staff space, 915 mm = 91.5 cm) lies below it. Centre y = 279.4 mm puts its back exactly on the bottom wall.
  const doc: DesignDocument = makeDoc(rectRoom(6000, 6000), [extra], [place('p1', extra, 1500, 279.4)]);
  await h.openDocument(doc);
  await unitSelect(page).selectOption({ label: 'cm' });

  const item = page.getByRole('list', { name: 'Layout problems' }).locator('[data-rule="access-blocked"]');
  await expect(item.first()).toBeVisible(FIRST);
  await expect(item.filter({ hasText: '91.5 cm' })).toHaveCount(1);
  for (const text of await item.allInnerTexts()) expect(text).not.toContain(' mm');
});

test('C3: in Arabic the lengths of the openings list are isolated and product names sit in <bdi>', async () => {
  const page = await h.launch();
  const door = {
    id: 'door-1',
    kind: 'door' as const,
    wallIndex: 0,
    offsetUm: 3_500_000,
    widthUm: 1_000_000,
    heightUm: 2_100_000,
    sillHeightUm: 0,
    door: { isEntrance: true, swing: 'in' as const, hinge: 'start' as const },
  };
  const room = { outline: [um(0, 0), um(8000, 0), um(8000, 6000), um(0, 6000)], ceilingHeightUm: 3_000_000, columns: [], openings: [door] };
  await h.openDocument(makeDoc(room, [], []));
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption({ label: ARABIC });
  await expect(page.getByRole('combobox', { name: 'اللغة', exact: true })).toBeVisible(FIRST);

  const item = page.locator('section').filter({ has: page.locator('ul.items') }).locator('ul.items li').filter({ hasText: '350' });
  await expect(item.first()).toBeVisible(FIRST);
  const text = await item.first().innerText();
  expect(text).toContain('⁦350 cm⁩');
  expect(text).toContain('⁦100 cm⁩');

  await expect(page.locator('button bdi').filter({ hasText: '4 FT FULL VIEW LED lights Showcase' })).toHaveCount(1, FIRST);
});

test('C4: every wall-table angle starts at 90, so a plain rectangle needs only the lengths', async () => {
  const page = await h.launch();
  await page.getByRole('button', { name: 'Type the walls' }).click();
  await expect(page.getByRole('textbox', { name: 'Ceiling height' })).toBeVisible(FIRST);
  for (let i = 1; i <= 4; i++) {
    await expect(page.getByRole('textbox', { name: `Wall ${i} end angle`, exact: true })).toHaveValue('90');
  }

  await page.getByRole('textbox', { name: 'Ceiling height' }).fill('300');
  for (const [i, length] of ['800', '600', '800', '600'].entries()) {
    await page.getByRole('textbox', { name: `Wall ${i + 1} length`, exact: true }).fill(length);
  }
  await expect(page.getByRole('status')).toContainText('The walls close.');
  await page.getByRole('button', { name: 'Create the room' }).click();
  const saved = await h.saveAs();
  expect(saved.room.outline).toEqual([um(0, 0), um(8000, 0), um(8000, 6000), um(0, 6000)]);
  expect(saved.room.ceilingHeightUm).toBe(3_000_000);
});

const noEntrance = { ...lShapeWithColumn, columns: [], openings: lShapeWithColumn.openings.filter((o) => o.id === 'window-1') };

test('C5: room problems sit in the plan column, and the layout options alert names the problem', async () => {
  test.setTimeout(120_000);
  const page = await h.launch();
  await h.openRoom(noEntrance);
  const list = page.getByRole('list', { name: 'Room problems', exact: true });
  await expect(page.locator('.plan-column').getByRole('list', { name: 'Room problems', exact: true })).toBeVisible(FIRST);
  await expect(list).toContainText('The room has no entrance.');

  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'idle', FIRST);
  await qty(page, names.counter).fill('1');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'done', { timeout: 90_000 });
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Layout options', exact: true }) });
  await expect(section.getByRole('alert')).toContainText('The room has no entrance.', FIRST);
});

test('C6: the first door defaults to "Customer entrance"; a later door does not', async () => {
  const page = await h.launch();
  await h.openRoom(noEntrance);
  await page.getByRole('button', { name: 'Add a door' }).click();
  await expect(page.getByRole('checkbox', { name: 'Customer entrance' })).toBeChecked(FIRST);

  await h.end();
  h.begin();
  const second = await h.launch();
  await h.openRoom(lShapeWithColumn);
  await second.getByRole('button', { name: 'Add a door' }).click();
  await expect(second.getByRole('checkbox', { name: 'Customer entrance' })).not.toBeChecked(FIRST);
});
