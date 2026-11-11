/** Issue M2-6: the 2D editor. Type the walls, draw the room, edit the outline, numeric fields, unit switch. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { parseDesignDocument } from '../../src/core/index';
import { angledWall, lShapeWithColumn } from '../fixtures/rooms';
import { Harness, clickWorld, dragWorld, um, unitSelect } from './editor-helpers';
import type { SavedDoc } from './editor-helpers';

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

const L_LENGTHS = ['900', '400', '300', '300', '600', '700'];
const L_ANGLES = ['90', '90', '270', '90', '90', '90'];

function expectNewShop(saved: SavedDoc, ceilingUm: number): void {
  expect(saved.name).toBe('New shop');
  expect(saved.id.length).toBeGreaterThan(0);
  expect(saved.room.ceilingHeightUm).toBe(ceilingUm);
  expect(saved.room.columns).toEqual([]);
  expect(saved.room.openings).toEqual([]);
  expect(saved.products).toEqual([]);
  expect(saved.placements).toEqual([]);
  expect(parseDesignDocument(saved).ok).toBe(true);
}

test('typing the L room in cm creates exactly the fixture outline', async () => {
  const page = await h.launch();
  await typeWalls(page, L_LENGTHS, L_ANGLES);
  await expect(page.getByRole('status')).toContainText('The walls close.');
  await page.getByRole('button', { name: 'Create the room' }).click();
  const saved = await h.saveAs();
  expect(saved.room.outline).toEqual(lShapeWithColumn.outline);
  expectNewShop(saved, 3_000_000);
});

test('typing the angled room in cm creates exactly the fixture outline', async () => {
  const page = await h.launch();
  await typeWalls(page, ['800', '200', '447.2136', '600', '600'], ['90', '153.434949', '116.565051', '90', '90']);
  await expect(page.getByRole('status')).toContainText('The walls close.');
  await page.getByRole('button', { name: 'Create the room' }).click();
  const saved = await h.saveAs();
  expect(saved.room.outline).toEqual(angledWall.outline);
  expectNewShop(saved, 3_000_000);
});

test('a wall that does not close offers suspects, and a diagonal narrows them to one', async () => {
  const page = await h.launch();
  await typeWalls(page, ['900', '400', '300', '300', '610', '700'], L_ANGLES);
  const status = page.getByRole('status');
  await expect(status).toContainText('do not close');
  await expect(status).toContainText('10 cm');
  const use1 = page.getByRole('button', { name: 'Use 910 cm for wall 1', exact: true });
  const use3 = page.getByRole('button', { name: 'Use 290 cm for wall 3', exact: true });
  const use5 = page.getByRole('button', { name: 'Use 600 cm for wall 5', exact: true });
  await expect(use1).toBeVisible();
  await expect(use3).toBeVisible();
  await expect(use5).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create the room' })).toBeDisabled();

  // True diagonal from corner 1 to corner 4 is sqrt(6000^2 + 4000^2) = 7211.103 mm; 721.1 cm is within 20 mm.
  await page.getByRole('textbox', { name: 'Diagonal from corner' }).fill('1');
  await page.getByRole('textbox', { name: 'Diagonal to corner' }).fill('4');
  await page.getByRole('textbox', { name: 'Diagonal length' }).fill('721.1');
  await expect(use5).toBeVisible();
  await expect(use1).toBeHidden();
  await expect(use3).toBeHidden();

  await use5.click();
  await expect(page.getByRole('textbox', { name: 'Wall 5 length', exact: true })).toHaveValue(/^600( cm)?$/);
  await expect(status).toContainText('The walls close.');
  await expect(page.getByRole('button', { name: 'Create the room' })).toBeEnabled();
});

test('a field that cannot be read shows the parser message and blocks creating', async () => {
  const page = await h.launch();
  await typeWalls(page, L_LENGTHS, L_ANGLES);
  await page.getByRole('textbox', { name: 'Wall 1 length', exact: true }).fill('abc');
  await expect(page.getByText('This is not a length').first()).toBeVisible(FIRST);
  await expect(page.getByRole('button', { name: 'Create the room' })).toBeDisabled();
});

test('a very short wall shows a warning', async () => {
  const page = await h.launch();
  await typeWalls(page, L_LENGTHS, L_ANGLES);
  await page.getByRole('textbox', { name: 'Wall 1 length', exact: true }).fill('3');
  await expect(page.getByText('Wall 1 is shorter than 100 mm').first()).toBeVisible(FIRST);
});

const SQUARE_6x4 = [um(0, 0), um(6000, 0), um(6000, 4000), um(0, 4000)];

async function startDraw(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Draw the room' })).toBeVisible(FIRST);
  await page.getByRole('button', { name: 'Draw the room' }).click();
  await expect(page.locator('svg[aria-label="Plan"]')).toBeVisible(FIRST);
  await page.getByRole('textbox', { name: 'Ceiling height' }).fill('300');
}

test('drawing counter-clockwise snaps to the 100 mm grid and keeps the order', async () => {
  const page = await h.launch();
  await startDraw(page);
  for (const [x, y] of [[20, 20], [6020, -20], [5980, 4020], [-20, 3980]] as const) await clickWorld(page, x, y);
  await page.getByRole('button', { name: 'Finish the room' }).click();
  const saved = await h.saveAs();
  expect(saved.room.outline).toEqual(SQUARE_6x4);
  expectNewShop(saved, 3_000_000);
});

test('drawing clockwise is tidied to counter-clockwise with the first corner kept', async () => {
  const page = await h.launch();
  await startDraw(page);
  for (const [x, y] of [[0, 0], [0, 4000], [6000, 4000], [6000, 0]] as const) await clickWorld(page, x, y);
  await page.getByRole('button', { name: 'Finish the room' }).click();
  const saved = await h.saveAs();
  expect(saved.room.outline).toEqual(SQUARE_6x4);
});

test('undo last corner removes the last click', async () => {
  const page = await h.launch();
  await startDraw(page);
  for (const [x, y] of [[0, 0], [0, 4000], [6000, 4000], [6000, 0], [3000, -2000]] as const) await clickWorld(page, x, y);
  await page.getByRole('button', { name: 'Undo last corner' }).click();
  await page.getByRole('button', { name: 'Finish the room' }).click();
  const saved = await h.saveAs();
  expect(saved.room.outline).toEqual(SQUARE_6x4);
});

test('dragging a corner snaps to 100 mm and is one undo step', async () => {
  const page = await h.launch();
  await h.openRoom(lShapeWithColumn);
  await expect(page.locator('[aria-label="Corner 3"]')).toBeVisible(FIRST);
  await dragWorld(page, { x: 9000, y: 4000 }, { x: 9520, y: 3990 }, 8);
  const moved = await h.saveAs();
  const expected = lShapeWithColumn.outline.map((p, i) => (i === 2 ? { x: 9_500_000, y: 4_000_000 } : p));
  expect(moved.room.outline).toEqual(expected);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const undone = await h.saveAs();
  expect(undone.room.outline).toEqual(lShapeWithColumn.outline);
});

test('typing a wall length on the project screen moves the end corner', async () => {
  const page = await h.launch();
  await h.openRoom(lShapeWithColumn);
  const box = page.getByRole('textbox', { name: 'Wall 1 length', exact: true });
  await expect(box).toBeVisible(FIRST);
  await box.fill('950');
  await box.press('Enter');
  await expect(page.locator('[data-wall="1"]')).toHaveText('403.1 cm');
  const saved = await h.saveAs();
  const expected = lShapeWithColumn.outline.map((p, i) => (i === 1 ? { x: 9_500_000, y: 0 } : p));
  expect(saved.room.outline).toEqual(expected);
});

test('a refused wall length explains itself and changes nothing', async () => {
  const page = await h.launch();
  await h.openRoom(lShapeWithColumn);
  const box = page.getByRole('textbox', { name: 'Wall 1 length', exact: true });
  await expect(box).toBeVisible(FIRST);
  await box.fill('-5');
  await box.press('Enter');
  await expect(page.getByText('A length must be more than zero.').first()).toBeVisible();
  const saved = await h.saveAs();
  expect(saved.room.outline).toEqual(lShapeWithColumn.outline);
});

test('lengths are shown in cm by default', async () => {
  const page = await h.launch();
  await h.openRoom(lShapeWithColumn);
  await expect(unitSelect(page)).toHaveValue(/cm/);
  await expect(page.locator('[data-wall="0"]')).toHaveText('900 cm', FIRST);
  await expect(page.locator('[data-wall="2"]')).toHaveText('300 cm');
  await expect(page.getByRole('textbox', { name: 'Ceiling height' })).toHaveValue(/^300( cm)?$/);
});

/** The test's own reader for displayed lengths (not src/core). Returns micrometres. Bare numbers are in `unit`. */
function readUm(text: string, unit: string): number {
  const t = text.trim().replace(/′/g, "'").replace(/″/g, '"');
  const num = (s: string): number => {
    const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s.trim());
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const frac = /^(\d+)\/(\d+)$/.exec(s.trim());
    if (frac) return Number(frac[1]) / Number(frac[2]);
    return Number(s);
  };
  const feet = /^(\d+(?:\.\d+)?)\s*(?:ft|')\s*(.*)$/.exec(t);
  if (feet) {
    const rest = feet[2]!.replace(/\s*(in|")\s*$/, '').trim();
    return (Number(feet[1]) * 12 + (rest === '' ? 0 : num(rest))) * 25_400;
  }
  const m = /^(-?[\d./ ]+?)\s*(mm|cm|m|in|")?$/.exec(t);
  if (!m) throw new Error(`cannot read "${text}"`);
  const value = num(m[1]!);
  const u = m[2] ?? (unit === 'ft-in' ? 'ft' : unit);
  const perUnit: Record<string, number> = { mm: 1000, cm: 10_000, m: 1_000_000, in: 25_400, '"': 25_400, ft: 304_800 };
  return value * perUnit[u]!;
}

test('every length shown is within 1 mm of the document in every unit', async () => {
  const page = await h.launch();
  await h.openRoom(angledWall);
  const outline = angledWall.outline;
  const truth = outline.map((p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
  await expect(page.locator('[data-wall]')).toHaveCount(5, FIRST);
  for (const unit of ['mm', 'cm', 'm', 'in', 'ft-in']) {
    await unitSelect(page).selectOption({ label: unit });
    await expect
      .poll(async () => {
        let worst = 0;
        for (let i = 0; i < truth.length; i++) {
          const label = (await page.locator(`[data-wall="${i}"]`).textContent()) ?? '';
          const field = await page.getByRole('textbox', { name: `Wall ${i + 1} length`, exact: true }).inputValue();
          worst = Math.max(worst, Math.abs(readUm(label, unit) - truth[i]!), Math.abs(readUm(field, unit) - truth[i]!));
        }
        return worst;
      }, { message: `unit ${unit}` })
      .toBeLessThan(1000);
  }
});
