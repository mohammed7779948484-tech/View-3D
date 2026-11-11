/** Issue M3-8: select, place and move fixtures in 3D on the same document as 2D. The same edit in 2D and 3D gives identical files. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Placement } from '../../src/core/index';
import { seedProducts } from '../../src/catalog/index';
import { angledWall, protectedDoorway } from '../fixtures/rooms';
import { testBin, testProducts } from '../fixtures/products';
import { makeDoc } from '../rules/helpers';
import { Harness, clickWorld, dragWorld } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const counter = seedProducts.find((p) => p.id === 'nhf-c')!;

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** The client point of the floor at plan (xMm, yMm), under the current camera. */
async function screen3d(page: Page, xMm: number, yMm: number): Promise<{ x: number; y: number }> {
  // A string, because the test project has no DOM types.
  await expect.poll(() => page.evaluate('typeof window.__view3dScene?.screenOf === "function"'), FIRST).toBe(true);
  return (await page.evaluate(`window.__view3dScene.screenOf(${xMm}, ${yMm})`)) as { x: number; y: number };
}

async function click3d(page: Page, xMm: number, yMm: number): Promise<void> {
  const p = await screen3d(page, xMm, yMm);
  await page.mouse.click(p.x, p.y);
}

async function drag3d(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const a = await screen3d(page, from.x, from.y);
  const b = await screen3d(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await page.mouse.up();
}

async function topView3d(page: Page): Promise<void> {
  await btn(page, '3D view').click();
  await expect(btn(page, '3D view')).toHaveAttribute('aria-pressed', 'true', FIRST);
  await btn(page, 'Top view').click();
  await expect.poll(() => page.evaluate('typeof window.__view3dScene?.describe === "function"'), FIRST).toBe(true);
}

const selectedPanel = (page: Page) => page.getByRole('heading', { name: 'Selected fixture' });

const bin = (id: string, xMm: number, yMm: number): Placement => ({
  id,
  productId: testBin.id,
  variantId: testBin.variants[0]!.id,
  center: { x: xMm * 1000, y: yMm * 1000 },
  rotationUdeg: 0,
});
const twoBins = () => makeDoc(angledWall, testProducts, [bin('b1', 2000, 2500), bin('b2', 5000, 2500)]);

async function centerOf(id: string): Promise<{ x: number; y: number }> {
  const saved = await h.saveAs();
  return (saved.placements as Placement[]).find((p) => p.id === id)!.center;
}

test('the same edit in 2D and in 3D gives byte-identical documents', async () => {
  // a) the 2D run
  let page = await h.launch();
  await h.openRoom(protectedDoorway);
  await expect(page.getByRole('heading', { name: 'Fixtures' })).toBeVisible(FIRST);
  await btn(page, `Place ${counter.name}`).click();
  await clickWorld(page, 2000, 2000);
  await expect(page.locator('[data-placement="p1"]')).toBeVisible(FIRST);
  await expect(selectedPanel(page)).toBeVisible(FIRST);
  await dragWorld(page, { x: 2000, y: 2000 }, { x: 3000, y: 2000 }, 8);
  await btn(page, 'Rotate 90°').click();
  await btn(page, 'Duplicate').click();
  await expect(page.locator('[data-placement="p2"]')).toBeVisible(FIRST);
  await btn(page, 'Delete').click();
  await expect(page.locator('[data-placement="p2"]')).toHaveCount(0);
  const a = await h.saveAs();
  const fileA = readFileSync(join(h.dir, 'saved-1.json'), 'utf8');
  // d) by hand
  expect(a.placements).toEqual([
    { id: 'p1', productId: 'nhf-c', variantId: 'default', center: { x: 3_000_000, y: 2_000_000 }, rotationUdeg: 90_000_000 },
  ]);
  await h.end();

  // b) the 3D run in a new app launch with a fresh folder
  h.begin();
  page = await h.launch();
  await h.openRoom(protectedDoorway);
  await expect(page.getByRole('heading', { name: 'Fixtures' })).toBeVisible(FIRST);
  await topView3d(page);
  await btn(page, `Place ${counter.name}`).click();
  await click3d(page, 2000, 2000);
  await expect(selectedPanel(page)).toBeVisible(FIRST);
  await drag3d(page, { x: 2000, y: 2000 }, { x: 3000, y: 2000 });
  await btn(page, 'Rotate 90°').click();
  await btn(page, 'Duplicate').click();
  await expect(page.getByText('(p2)')).toBeVisible(FIRST);
  await btn(page, 'Delete').click();
  await expect(page.getByText('(p2)')).toHaveCount(0);
  await h.saveAs();
  const fileB = readFileSync(join(h.dir, 'saved-1.json'), 'utf8');

  // c) identical
  expect(fileB).toBe(fileA);
});

test('clicking a box in 3D selects it, the panel edits work, and the selection is shared with 2D', async () => {
  const page = await h.launch();
  await h.openDocument(twoBins());
  await topView3d(page);
  await click3d(page, 5000, 2500);
  await expect(selectedPanel(page)).toBeVisible(FIRST);
  await expect(page.getByText('(b2)')).toBeVisible(FIRST);
  const x = page.getByRole('textbox', { name: 'X', exact: true });
  await expect(x).toHaveValue('500 cm'); // the default unit is cm
  await x.fill('600');
  await x.press('Enter');
  expect(await centerOf('b2')).toEqual({ x: 6_000_000, y: 2_500_000 });

  await btn(page, '2D plan').click();
  await expect(page.locator('svg[aria-label="Plan"]')).toBeVisible(FIRST);
  await expect(page.locator('[data-placement="b2"]')).toBeVisible(FIRST);
  await expect(page.getByText('(b2)')).toBeVisible(FIRST);
});

test('a drag in 3D is one undo step', async () => {
  const page = await h.launch();
  await h.openDocument(twoBins());
  await topView3d(page);
  await drag3d(page, { x: 2000, y: 2500 }, { x: 2500, y: 2500 });
  expect(await centerOf('b1')).toEqual({ x: 2_500_000, y: 2_500_000 });
  await btn(page, 'Undo').click();
  expect(await centerOf('b1')).toEqual({ x: 2_000_000, y: 2_500_000 });
});

test('a press and release on a box without moving selects it and does not move it', async () => {
  const page = await h.launch();
  await h.openDocument(twoBins());
  await topView3d(page);
  await click3d(page, 2000, 2500);
  await expect(page.getByText('(b1)')).toBeVisible(FIRST);
  expect(await centerOf('b1')).toEqual({ x: 2_000_000, y: 2_500_000 });
});
