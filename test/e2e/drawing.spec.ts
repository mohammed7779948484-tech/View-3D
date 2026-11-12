/** Drawing a shop with the mouse, labels that never overlap, scan texts in the chosen unit (M3 UX). */
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { join, resolve } from 'node:path';
import { Harness, clickWorld, unitSelect, worldToScreen } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };
const ROOT = resolve(import.meta.dirname, '../..');
const SAMPLE = join(ROOT, 'test/fixtures/scans/roomtrace-sample.json');
const SQUARE = [[0, 0], [6000, 0], [6000, 4000], [0, 4000]] as const;

async function openDraw(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Draw the shop' })).toBeVisible(FIRST);
  await page.getByRole('button', { name: 'Draw the shop' }).click();
  await expect(page.locator('svg[aria-label="Plan"]')).toBeVisible(FIRST);
}
const ceiling = (page: Page) => page.getByRole('textbox', { name: 'Ceiling height' });
const finish = (page: Page) => page.getByRole('button', { name: 'Finish the shop' });

async function clickSquare(page: Page): Promise<void> {
  for (const [x, y] of SQUARE) await clickWorld(page, x, y);
}

test('clicking the first corner closes the outline and finishing gives 4 corners', async () => {
  const page = await h.launch();
  await openDraw(page);
  await clickSquare(page);
  await expect(page.locator('polyline.plan-room.open')).toHaveCount(1);
  await clickWorld(page, 0, 0);
  await expect(page.locator('polygon.plan-room')).toHaveCount(1, FIRST);
  await expect(page.locator('polyline.plan-room.open')).toHaveCount(0);
  await ceiling(page).fill('300');
  await expect(finish(page)).toBeEnabled();
  await finish(page).click();
  const saved = await h.saveAs();
  expect(saved.room.outline).toHaveLength(4);
});

test('a line and its length follow the mouse after the first corner', async () => {
  const page = await h.launch();
  await openDraw(page);
  const preview = page.locator('[data-draw-preview]');
  await page.mouse.move(300, 300);
  await expect(preview).toHaveCount(0);
  await clickWorld(page, 0, 0);
  const p = await worldToScreen(page, 3000, 0);
  await page.mouse.move(p.x, p.y);
  await expect(preview).toHaveCount(1, FIRST);
  const label = page.locator('[data-draw-preview-length]');
  await expect(label).toHaveCount(1, FIRST);
  const text = ((await label.textContent()) ?? '').trim();
  expect(text.endsWith(' cm')).toBe(true);
  expect(Number(text.slice(0, -3))).toBeGreaterThan(0);
});

test('the empty drawing area has a grid and a scale bar', async () => {
  const page = await h.launch();
  await openDraw(page);
  await expect(page.locator('[data-grid]').first()).toBeVisible(FIRST);
  await expect(unitSelect(page)).toHaveValue(/cm/);
  await expect(page.locator('[data-scale-bar]')).toContainText('100 cm', FIRST);
  await unitSelect(page).selectOption({ label: 'm' });
  await expect(page.locator('[data-scale-bar]')).toContainText('1 m', FIRST);
});

test('finish says why it is disabled until the ceiling height is typed', async () => {
  const page = await h.launch();
  await openDraw(page);
  await clickSquare(page);
  await clickWorld(page, 0, 0);
  const why = page.getByText('Type the ceiling height to finish.');
  await expect(finish(page)).toBeDisabled();
  await expect(why).toBeVisible(FIRST);
  await ceiling(page).fill('300');
  await expect(why).toHaveCount(0);
  await expect(finish(page)).toBeEnabled();
});

async function reviewScan(page: Page): Promise<void> {
  await h.app!.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, SAMPLE);
  await page.getByRole('button', { name: 'Import a shop scan' }).click();
  await expect(page.getByRole('heading', { name: 'Check the scan' })).toBeVisible(FIRST);
  await expect(page.locator('svg[aria-label="Plan"]')).toBeVisible(FIRST);
}

type Box = { x: number; y: number; width: number; height: number };
async function boxes(loc: Locator): Promise<Box[]> {
  const out: Box[] = [];
  for (const item of await loc.all()) {
    const b = await item.boundingBox();
    if (b !== null) out.push(b);
  }
  return out;
}
const hit = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('on the scan review plan no two labels overlap', async () => {
  const page = await h.launch();
  await reviewScan(page);
  const lengths = await boxes(page.locator('text.plan-length'));
  const numbers = await boxes(page.locator('[data-wall-number]'));
  expect(lengths).toHaveLength(7);
  expect(numbers).toHaveLength(7);
  const clashes: string[] = [];
  for (let i = 0; i < lengths.length; i++) {
    for (let j = i + 1; j < lengths.length; j++) if (hit(lengths[i]!, lengths[j]!)) clashes.push(`length ${i + 1} / length ${j + 1}`);
  }
  for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) if (hit(numbers[i]!, numbers[j]!)) clashes.push(`number ${i + 1} / number ${j + 1}`);
  }
  for (let i = 0; i < lengths.length; i++) {
    for (let j = 0; j < numbers.length; j++) if (hit(lengths[i]!, numbers[j]!)) clashes.push(`length ${i + 1} / number ${j + 1}`);
  }
  expect(clashes).toEqual([]);
});

test('scan findings read in the chosen unit (cm), not mm', async () => {
  const page = await h.launch();
  await reviewScan(page);
  await expect(unitSelect(page)).toHaveValue(/cm/);
  const list = page.getByRole('list', { name: 'What the scan did not know' });
  await expect(list).toContainText('81.1 cm gap', FIRST);
  await expect(list).toContainText('47.1 cm gap');
  expect(await list.innerText()).not.toContain(' mm');
});
