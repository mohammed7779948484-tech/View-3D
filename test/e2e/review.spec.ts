/** The confirmed findings of the independent Milestone 2 review, one test per finding (failing first). */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Harness, dragWorld, um } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };

async function typeWalls(page: Page, lengths: string[], angles: string[], ceiling = '300'): Promise<void> {
  await expect(page.getByRole('button', { name: 'Type the walls' })).toBeVisible(FIRST);
  await page.getByRole('button', { name: 'Type the walls' }).click();
  await expect(page.getByRole('textbox', { name: 'Ceiling height' })).toBeVisible(FIRST);
  await page.getByRole('textbox', { name: 'Ceiling height' }).fill(ceiling);
  for (let i = 4; i < lengths.length; i++) await page.getByRole('button', { name: 'Add a wall' }).click();
  for (let i = 0; i < lengths.length; i++) {
    await page.getByRole('textbox', { name: `Wall ${i + 1} length`, exact: true }).fill(lengths[i]!);
    await page.getByRole('textbox', { name: `Wall ${i + 1} end angle`, exact: true }).fill(angles[i]!);
  }
}

const RECT_LENGTHS = ['400', '300', '400', '300'];
const RECT_ANGLES = ['90', '90', '90', '90'];

// G1
for (const corner of ['0', '7']) {
  test(`a typed corner ${corner} does not crash the wall table`, async () => {
    const page = await h.launch();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await typeWalls(page, RECT_LENGTHS, RECT_ANGLES);
    await page.getByRole('textbox', { name: 'Diagonal from corner' }).fill(corner);
    await page.getByRole('textbox', { name: 'Diagonal to corner' }).fill('3');
    await page.getByRole('textbox', { name: 'Diagonal length' }).fill('500');
    await page.waitForTimeout(300); // a crash unmounts the table; give it time to happen
    await expect(page.getByRole('heading', { name: 'Type the walls' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create the shop' })).toBeEnabled();
    expect(errors).toEqual([]);
  });
}

// G2
test('no application menu: no reload, quit or dev tools shortcuts', async () => {
  const page = await h.launch();
  const menu = await h.app!.evaluate(({ Menu }) => Menu.getApplicationMenu());
  expect(menu).toBeNull();

  await h.openRoom({ outline: [um(0, 0), um(4000, 0), um(4000, 3000), um(0, 3000)], ceilingHeightUm: 3_000_000, columns: [], openings: [] });
  const name = page.getByRole('textbox', { name: 'Project name' });
  await name.fill('Kept');
  await name.press('Enter');
  await page.keyboard.press('Control+R');
  await page.waitForTimeout(1000); // a reload would take the project away within this time
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Kept');
});

// G4
test('the wall table says when the last wall was redrawn to close', async () => {
  const page = await h.launch();
  await typeWalls(page, ['400', '300', '400', '300.9'], RECT_ANGLES);
  const status = page.getByRole('status');
  await expect(status).toContainText('The walls close');
  await expect(status).toContainText('0.9 cm');
  await page.getByRole('textbox', { name: 'Wall 4 length', exact: true }).fill('300');
  await expect(status).toHaveText('The walls close.');
});

// G6
const ROOT = resolve(import.meta.dirname, '../..');
type Tree = { [key: string]: string | Tree };
function arString(key: string, vars: Record<string, string>): string {
  const path = join(ROOT, 'app/renderer/i18n/ar.json');
  if (!existsSync(path)) throw new Error(`${path} is missing`);
  let node: string | Tree | undefined = JSON.parse(readFileSync(path, 'utf8')) as Tree;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'string') throw new Error(`ar.json has no string for key ${key}`);
  return node.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_m, n: string) => vars[n] ?? `{{${n}}}`);
}

test('file errors are translated', async () => {
  const page = await h.launch();
  const missing = join(h.dir, 'missing.json');
  await h.app!.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, missing);
  await page.getByRole('button', { name: 'Open a project' }).click(FIRST);
  await expect(page.getByRole('alert')).toContainText('could not be read', FIRST);

  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption({ label: 'العربية' });
  await expect(page.getByRole('combobox', { name: 'اللغة', exact: true })).toBeVisible(FIRST);
  await page.getByRole('button', { name: arString('start.open', {}), exact: true }).click();
  const expected = arString('files.readFailed', { file: 'missing.json' });
  await expect(page.getByRole('alert')).toContainText(expected, FIRST);
  await expect(page.getByRole('alert')).not.toContainText('could not be read');
});

// G11
const TRIANGLE = [um(0, 0), um(4000, 0), um(0, 3000)];

test('a refused outline edit explains itself and the field goes back', async () => {
  const page = await h.launch();
  await h.openRoom({ outline: TRIANGLE, ceilingHeightUm: 3_000_000, columns: [], openings: [] });
  await expect(page.locator('[aria-label="Corner 3"]')).toBeVisible(FIRST);
  // Corner 3 at (5000, -1000) makes the walk (0,0) (4000,0) (5000,-1000) clockwise, which the document refuses.
  await dragWorld(page, { x: 0, y: 3000 }, { x: 5000, y: -1000 }, 8);
  await expect(page.getByRole('alert')).toContainText('inside out', FIRST);
  const saved = await h.saveAs();
  expect(saved.room.outline).toEqual(TRIANGLE);
});

// G16
test('the walls of an open room can be edited with lengths and angles', async () => {
  const page = await h.launch();
  const window2 = { id: 'window-1', kind: 'window' as const, wallIndex: 1, offsetUm: 500_000, widthUm: 1_000_000, heightUm: 1_200_000, sillHeightUm: 900_000 };
  const rect = [um(0, 0), um(4000, 0), um(4000, 3000), um(0, 3000)];
  await h.openRoom({ outline: rect, ceilingHeightUm: 3_000_000, columns: [], openings: [window2] });
  await page.getByRole('button', { name: 'Edit the walls' }).click(FIRST);

  const field = (name: string) => page.getByRole('textbox', { name, exact: true });
  await expect(field('Wall 4 length')).toBeVisible(FIRST);
  await expect(field('Wall 5 length')).toHaveCount(0);
  const lengths = [/^400( cm)?$/, /^300( cm)?$/, /^400( cm)?$/, /^300( cm)?$/];
  for (let i = 0; i < 4; i++) {
    await expect(field(`Wall ${i + 1} length`)).toHaveValue(lengths[i]!);
    await expect(field(`Wall ${i + 1} end angle`)).toHaveValue(/^90°?$/);
  }
  await expect(field('Ceiling height')).toHaveValue(/^300( cm)?$/);

  await field('Wall 1 length').fill('500');
  await field('Wall 3 length').fill('500');
  await page.getByRole('button', { name: 'Update the shop' }).click();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible(FIRST);

  const updated = await h.saveAs();
  expect(updated.room.outline).toEqual([um(0, 0), um(5000, 0), um(5000, 3000), um(0, 3000)]);
  expect(updated.room.openings).toEqual([window2]);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const undone = await h.saveAs();
  expect(undone.room.outline).toEqual(rect);
});
