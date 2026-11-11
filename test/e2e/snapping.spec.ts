/** Issue M3-4: single-sided units snap flush to walls and back to back, in the same undo step as the move. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedProducts } from '../../src/catalog/index';
import { protectedDoorway } from '../fixtures/rooms';
import { makeDoc } from '../rules/helpers';
import { Harness, clickWorld, dragWorld } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
// 48 x 20 in = 1219.2 x 508 mm, a single-sided unit (placement 'wall').
const stand = seedProducts.find((p) => p.id === 'nhf-s-1')!;

const problems = (page: Page) => page.getByRole('list', { name: 'Layout problems' });
const fixture = (page: Page, id: string) => page.locator(`[data-placement="${id}"]`);
const centers = async () =>
  (await h.saveAs()).placements.map((p) => {
    const q = p as { id: string; center: { x: number; y: number }; rotationUdeg: number };
    return { id: q.id, center: q.center, rotationUdeg: q.rotationUdeg };
  });

test('a stand showcase dragged to the entrance wall snaps flush and slides off the door; one Undo undoes both', async () => {
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await expect(page.getByRole('heading', { name: 'Fixtures' })).toBeVisible(FIRST);
  await page.getByRole('button', { name: `Place ${stand.name}`, exact: true }).click();
  await clickWorld(page, 3000, 1000); // back 746 mm from wall 0: no snap
  await expect(fixture(page, 'p1')).toBeVisible(FIRST);
  expect(await centers()).toEqual([{ id: 'p1', center: { x: 3_000_000, y: 1_000_000 }, rotationUdeg: 0 }]);

  // At (3000, 500) the back is 246 mm from wall 0. Flush at x = 3000 it would cover the door
  // (3000..4000), so it slides to x = 3000 - 609.6 = 2390.4 mm; y = 508 / 2 = 254 mm.
  await dragWorld(page, { x: 3000, y: 1000 }, { x: 3000, y: 500 }, 8);
  expect(await centers()).toEqual([{ id: 'p1', center: { x: 2_390_400, y: 254_000 }, rotationUdeg: 0 }]);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await centers()).toEqual([{ id: 'p1', center: { x: 3_000_000, y: 1_000_000 }, rotationUdeg: 0 }]);
});

test('a stand showcase dragged near another one snaps back to back', async () => {
  const page = await h.launch();
  const room = protectedDoorway;
  const at = (id: string, xMm: number, yMm: number, rotationUdeg: number) => ({
    id,
    productId: stand.id,
    variantId: 'default',
    center: { x: xMm * 1000, y: yMm * 1000 },
    rotationUdeg,
  });
  // p1 faces +y, its back at 2500 - 254 = 2246 mm; p2 faces -y, its back at 1900 + 254 = 2154 mm: 92 mm apart.
  await h.openDocument(makeDoc(room, [stand], [at('p1', 3500, 2500, 0), at('p2', 3500, 1900, 180_000_000)]));
  await expect(fixture(page, 'p2')).toBeVisible(FIRST);

  await clickWorld(page, 3500, 1900);
  await dragWorld(page, { x: 3500, y: 1900 }, { x: 3500, y: 2000 }, 8);

  // p2's back moves onto 2246 mm: centre y = 2246 - 254 = 1992 mm.
  expect(await centers()).toEqual([
    { id: 'p1', center: { x: 3_500_000, y: 2_500_000 }, rotationUdeg: 0 },
    { id: 'p2', center: { x: 3_500_000, y: 1_992_000 }, rotationUdeg: 180_000_000 },
  ]);
  await expect(problems(page)).toBeAttached(FIRST);
  await expect(problems(page).locator('[data-rule="wall-unit-not-on-wall"]')).toHaveCount(0);
});
