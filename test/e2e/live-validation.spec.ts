/** Issue M3-3: every rule of validateLayout shown live, in words, on the fixture concerned. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { protectedDoorway } from '../fixtures/rooms';
import { testGondolaDouble, testProducts, testWallShelf } from '../fixtures/products';
import { windowBlockedDoc, windowBlockedMessage } from '../fixtures/violation-cases';
import { makeDoc, place, rectRoom } from '../rules/helpers';
import { Harness, clickWorld, dragWorld, unitSelect } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const ARABIC = 'العربية';

const problems = (page: Page) => page.getByRole('list', { name: 'Layout problems' });
const fixture = (page: Page, id: string) => page.locator(`[data-placement="${id}"]`);

test('a tall unit in front of a window: the sentence is on the list and the fixture is marked, in English and Arabic', async () => {
  const page = await h.launch();
  await h.openDocument(windowBlockedDoc);
  // Problem texts follow the chosen unit (default cm). The engine words lengths in mm, and in mm the app text is
  // byte-identical to the engine's message, which is what this test pins.
  await unitSelect(page).selectOption({ label: 'mm' });

  const item = problems(page).locator('[data-rule="window-blocked"]');
  await expect(item).toHaveCount(1, FIRST);
  await expect(item).toHaveText(windowBlockedMessage);
  await expect(fixture(page, 'p1')).toHaveAttribute('data-problem', 'true');

  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption({ label: ARABIC });
  await expect(page.getByRole('combobox', { name: 'اللغة', exact: true })).toBeVisible(FIRST);
  // The list's own label is Arabic now, so find the item by its rule.
  const arabic = page.locator('[data-rule="window-blocked"]');
  await expect(arabic).toHaveCount(1, FIRST);
  await expect(arabic).not.toHaveText(windowBlockedMessage);
  await expect(arabic).toContainText('2100');
  await expect(arabic).toContainText('900');
  await expect(fixture(page, 'p1')).toHaveAttribute('data-problem', 'true');
});

test('two overlapping gondolas are both marked; dragging one away clears it and Undo brings it back', async () => {
  const page = await h.launch();
  await h.openDocument(
    makeDoc(protectedDoorway, testProducts, [place('p1', testGondolaDouble, 3000, 2500), place('p2', testGondolaDouble, 3500, 2500)]),
  );

  const overlap = problems(page).locator('[data-rule="overlap"]');
  await expect(overlap).toHaveCount(1, FIRST);
  await expect(overlap).toHaveText(
    '"TEST double-sided gondola" (p1) and "TEST double-sided gondola" (p2) overlap.',
  );
  await expect(fixture(page, 'p1')).toHaveAttribute('data-problem', 'true');
  await expect(fixture(page, 'p2')).toHaveAttribute('data-problem', 'true');

  // p2 spans x 2900..4100 (p1 2400..3600): x = 4000 is on p2 only. Select it, then move it 2000 mm
  // to the right, which puts its centre at (5500, 2500) mm.
  await clickWorld(page, 4000, 2500);
  await dragWorld(page, { x: 4000, y: 2500 }, { x: 6000, y: 2500 }, 8);
  await expect(overlap).toHaveCount(0, FIRST);
  // At (5500, 2500) the gondola breaks no rule, and p1 at (3000, 2500) breaks none either.
  await expect(fixture(page, 'p1')).not.toHaveAttribute('data-problem', /.*/);
  await expect(fixture(page, 'p2')).not.toHaveAttribute('data-problem', /.*/);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(overlap).toHaveCount(1, FIRST);
  await expect(fixture(page, 'p1')).toHaveAttribute('data-problem', 'true');
  await expect(fixture(page, 'p2')).toHaveAttribute('data-problem', 'true');
});

test('a valid layout shows an empty list and no marked fixture', async () => {
  const page = await h.launch();
  // A wall shelf on the top wall and a gondola in the middle of a 6 m x 6 m room: no violation.
  await h.openDocument(
    makeDoc(rectRoom(6000, 6000), [testWallShelf, testGondolaDouble], [
      place('p1', testWallShelf, 1500, 5800, 180),
      place('p2', testGondolaDouble, 3000, 3500),
    ]),
  );
  await expect(fixture(page, 'p1')).toBeVisible(FIRST);
  await expect(fixture(page, 'p2')).toBeVisible(FIRST);
  await expect(problems(page)).toBeAttached(FIRST);
  await expect(problems(page).getByRole('listitem')).toHaveCount(0);
  await expect(page.locator('[data-problem]')).toHaveCount(0);
});
