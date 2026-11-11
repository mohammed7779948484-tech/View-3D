/** Issue M3-2: place, move, rotate, duplicate and delete catalog fixtures in the 2D plan. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedProducts } from '../../src/catalog/index';
import { angledWall, protectedDoorway } from '../fixtures/rooms';
import { Harness, clickWorld, dragWorld } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const product = (id: string) => seedProducts.find((p) => p.id === id)!;
const counter = product('nhf-c');

const placeBtn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const fixture = (page: Page, id: string) => page.locator(`[data-placement="${id}"]`);

async function placeCounterAt(page: Page, xMm: number, yMm: number): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Fixtures' })).toBeVisible(FIRST);
  await placeBtn(page, `Place ${counter.name}`).click();
  await clickWorld(page, xMm, yMm);
  await expect(fixture(page, 'p1')).toBeVisible(FIRST);
  await expect(page.getByRole('heading', { name: 'Selected fixture' })).toBeVisible(FIRST);
}

const P1 = (x: number, y: number, rotationUdeg = 0) => ({
  id: 'p1', productId: 'nhf-c', variantId: 'default', center: { x, y }, rotationUdeg,
});

test('placing the Counter at (2000, 2000) mm adds p1 and embeds the product', async () => {
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await placeCounterAt(page, 2000, 2000);
  const saved = await h.saveAs();
  expect(saved.placements).toEqual([P1(2_000_000, 2_000_000)]);
  expect(saved.products).toEqual([counter]);
});

test('dragging moves by the snapped delta and is one undo step', async () => {
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await placeCounterAt(page, 2000, 2000);
  await dragWorld(page, { x: 2000, y: 2000 }, { x: 3000, y: 2000 }, 8);
  expect((await h.saveAs()).placements).toEqual([P1(3_000_000, 2_000_000)]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await h.saveAs()).placements).toEqual([P1(2_000_000, 2_000_000)]);
});

test('rotate, duplicate and delete', async () => {
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await placeCounterAt(page, 3000, 2000);
  await page.getByRole('button', { name: 'Rotate 90°' }).click();
  expect((await h.saveAs()).placements).toEqual([P1(3_000_000, 2_000_000, 90_000_000)]);

  // Width 24 in = 609_600 um along local +y at 90 degrees.
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(fixture(page, 'p2')).toBeVisible(FIRST);
  const dup = await h.saveAs();
  expect(dup.placements).toEqual([
    P1(3_000_000, 2_000_000, 90_000_000),
    { id: 'p2', productId: 'nhf-c', variantId: 'default', center: { x: 3_000_000, y: 2_609_600 }, rotationUdeg: 90_000_000 },
  ]);

  // The copy is selected, so Delete removes it.
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(fixture(page, 'p2')).toHaveCount(0);
  const after = await h.saveAs();
  expect(after.placements).toEqual([P1(3_000_000, 2_000_000, 90_000_000)]);
  expect(after.products).toEqual([counter]);
});

test('typed X and Rotation fields commit on Enter', async () => {
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await placeCounterAt(page, 2000, 2000);
  await clickWorld(page, 2000, 2000);
  const x = page.getByRole('textbox', { name: 'X', exact: true });
  await x.fill('400'); // the default unit is cm: 400 cm = 4000 mm
  await x.press('Enter');
  expect((await h.saveAs()).placements).toEqual([P1(4_000_000, 2_000_000)]);
  const rot = page.getByRole('textbox', { name: 'Rotation', exact: true });
  await rot.fill('45');
  await rot.press('Enter');
  expect((await h.saveAs()).placements).toEqual([P1(4_000_000, 2_000_000, 45_000_000)]);
});

test('on the angled wall, Rotate 90° steps relative to that wall', async () => {
  const page = await h.launch();
  await h.openRoom(angledWall);
  // Wall 2 from (8000, 2000) to (6000, 6000): atan2(4000, -2000) = 116.565051 deg.
  await placeCounterAt(page, 7000, 3800);
  const expected = [26_565_051, 116_565_051, 206_565_051, 296_565_051, 26_565_051];
  for (const rotationUdeg of expected) {
    await page.getByRole('button', { name: 'Rotate 90°' }).click();
    const saved = await h.saveAs();
    expect((saved.placements[0] as { rotationUdeg: number }).rotationUdeg).toBe(rotationUdeg);
  }
});

test('the Fixtures panel lists one button per placeable variant only', async () => {
  const page = await h.launch();
  await h.openRoom(protectedDoorway);
  await expect(page.getByRole('heading', { name: 'Fixtures' })).toBeVisible(FIRST);
  const showcase = product('nhf-6ft-full-view-led-lights-showcase');
  expect(showcase.variants).toHaveLength(2);
  for (const v of showcase.variants) {
    await expect(placeBtn(page, `Place ${showcase.name}, ${v.label}`)).toBeVisible();
  }
  await expect(placeBtn(page, `Place ${showcase.name}`)).toHaveCount(0);
  await expect(placeBtn(page, `Place ${counter.name}`)).toBeVisible();
  const unknown = product('nhf-s');
  await expect(page.getByRole('button', { name: new RegExp(`^Place ${unknown.name}`) })).toHaveCount(0);
});
