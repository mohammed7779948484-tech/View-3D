/** M3 UX: the score notes in the option picker are worded in the chosen language and unit. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedProducts } from '../../src/catalog/index';
import { protectedDoorway } from '../fixtures/rooms';
import { Harness, unitSelect } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const product = (id: string) => seedProducts.find((p) => p.id === id)!;
const panel = (page: Page) => page.locator('[data-auto-layout]');
const ARABIC = 'العربية';

async function run(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Automatic layout' })).toBeVisible({ timeout: 5000 });
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'idle');
  for (const [id, n] of [['nhf-c', 1], ['nhf-6ft-extra-view-showcase', 2], ['nhf-s-1', 2], ['nhf-g', 3]] as [string, number][]) {
    await page.getByRole('spinbutton', { name: `Quantity of ${product(id).name}`, exact: true }).fill(String(n));
  }
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(panel(page)).toHaveAttribute('data-auto-layout', 'done', { timeout: 90_000 });
}

test('N2: with the unit at cm, "Counter near the entrance" reads "<n> cm from the entrance", no mm', async () => {
  test.setTimeout(120_000);
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await unitSelect(page).selectOption({ label: 'cm' });
  await run(page);
  const lines = page.locator('[data-option="1"] li').filter({ hasText: 'Counter near the entrance' });
  await expect(lines).toHaveCount(1);
  const text = (await lines.innerText()).replace(/\s+/g, ' ');
  expect(text).toMatch(/\d+(\.\d+)? cm from the entrance/);
  expect(text).not.toContain(' mm');
});

test('N3: in Arabic no score note contains a Latin letter, apart from units', async () => {
  test.setTimeout(120_000);
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await run(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption({ label: ARABIC });
  await expect(page.getByRole('combobox', { name: 'اللغة', exact: true })).toBeVisible({ timeout: 5000 });
  const notes = await page.locator('[data-option="1"] li span.hint').allInnerTexts();
  expect(notes.length).toBeGreaterThan(0);
  for (const raw of notes) {
    const note = raw.replace(/\b(cm|mm|m)\b/g, '');
    expect(note, `note "${raw}"`).toMatch(/^[^A-Za-z]*$/);
  }
});
