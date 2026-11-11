/** Issue M2-7 (UI): add and remove doors, windows and columns; refuse the ones validateRoom rejects. */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { lShapeWithColumn } from '../fixtures/rooms';
import { Harness } from './editor-helpers';

const h = new Harness();
test.beforeEach(() => h.begin());
test.afterEach(() => h.end());

const FIRST = { timeout: 5000 };

/** The fixture room without its openings and column; every test starts here. */
const bareL = { ...lShapeWithColumn, columns: [], openings: [] };

const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const problems = (page: Page) => page.getByRole('list', { name: 'Room problems' });

type DoorForm = { wall: string; at: string; width: string; height: string; entrance?: boolean };

async function addDoor(page: Page, d: DoorForm): Promise<void> {
  const open = page.getByRole('button', { name: 'Add a door' });
  await expect(open).toBeVisible(FIRST);
  await open.click();
  await field(page, 'Door wall').fill(d.wall);
  await field(page, 'Door distance from wall start').fill(d.at);
  await field(page, 'Door width').fill(d.width);
  await field(page, 'Door height').fill(d.height);
  if (d.entrance === true) await page.getByRole('checkbox', { name: 'Customer entrance' }).check();
  await page.getByRole('combobox', { name: 'Door opens' }).selectOption({ label: 'Into the room' });
  await page.getByRole('combobox', { name: 'Hinge at' }).selectOption({ label: 'Start of the wall' });
  await page.getByRole('button', { name: 'Add the door' }).click();
}

type WindowForm = { wall: string; at: string; width: string; height: string; sill: string };

async function addWindow(page: Page, w: WindowForm): Promise<void> {
  const open = page.getByRole('button', { name: 'Add a window' });
  await expect(open).toBeVisible(FIRST);
  await open.click();
  await field(page, 'Window wall').fill(w.wall);
  await field(page, 'Window distance from wall start').fill(w.at);
  await field(page, 'Window width').fill(w.width);
  await field(page, 'Window height').fill(w.height);
  await field(page, 'Window sill height').fill(w.sill);
  await page.getByRole('button', { name: 'Add the window' }).click();
}

async function addColumn(page: Page, c: { width: string; depth: string; x: string; y: string }): Promise<void> {
  const open = page.getByRole('button', { name: 'Add a column' });
  await expect(open).toBeVisible(FIRST);
  await open.click();
  await field(page, 'Column width').fill(c.width);
  await field(page, 'Column depth').fill(c.depth);
  await field(page, 'Column x from corner 1').fill(c.x);
  await field(page, 'Column y from corner 1').fill(c.y);
  await page.getByRole('button', { name: 'Add the column' }).click();
}

const ENTRANCE: DoorForm = { wall: '1', at: '400', width: '100', height: '210', entrance: true };
const WINDOW_1: WindowForm = { wall: '6', at: '250', width: '200', height: '120', sill: '90' };

test('adding the fixture door, window and column saves exactly the fixture room', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addDoor(page, ENTRANCE);
  await expect(page.getByRole('button', { name: 'Remove door 1' })).toBeVisible(FIRST);
  await expect(problems(page)).not.toContainText('no entrance');
  await addWindow(page, WINDOW_1);
  await expect(page.getByRole('button', { name: 'Remove window 1' })).toBeVisible(FIRST);
  await addColumn(page, { width: '40', depth: '40', x: '300', y: '300' });
  await expect(page.getByRole('button', { name: 'Remove column 1' })).toBeVisible(FIRST);

  const saved = await h.saveAs();
  const [entrance, window1] = lShapeWithColumn.openings;
  const expected = {
    ...lShapeWithColumn,
    openings: [{ ...entrance!, id: 'door-1' }, { ...window1! }],
    columns: lShapeWithColumn.columns.map((c) => ({ ...c, id: 'column-1' })),
  };
  expect(saved.room).toEqual(expected);
});

test('a door that runs past the end of its wall is refused', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addDoor(page, { wall: '1', at: '850', width: '100', height: '210' });
  await expect(page.getByRole('alert')).toContainText('runs 500 mm past the end of the wall', FIRST);
  await expect(page.getByRole('button', { name: 'Remove door 1' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add the door' })).toBeVisible();
});

test('a window that overlaps the door is refused', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addDoor(page, ENTRANCE);
  await expect(page.getByRole('button', { name: 'Remove door 1' })).toBeVisible(FIRST);
  await addWindow(page, { wall: '1', at: '420', width: '100', height: '120', sill: '90' });
  await expect(page.getByRole('alert')).toContainText('overlap by 800 mm on wall 1', FIRST);
  await expect(page.getByRole('button', { name: 'Remove window 1' })).toHaveCount(0);
});

test('a window that reaches above the ceiling is refused', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addWindow(page, { wall: '6', at: '250', width: '200', height: '100', sill: '250' });
  await expect(page.getByRole('alert')).toContainText(
    'reaches 3500 mm above the floor, higher than the 3000 mm ceiling',
    FIRST,
  );
  await expect(page.getByRole('button', { name: 'Remove window 1' })).toHaveCount(0);
});

test('a column that crosses a wall is refused', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addColumn(page, { width: '40', depth: '40', x: '880', y: '100' });
  await expect(page.getByRole('alert')).toContainText('is not completely inside the room', FIRST);
  await expect(page.getByRole('button', { name: 'Remove column 1' })).toHaveCount(0);
});

test('a door on a wall that does not exist is refused', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addDoor(page, { wall: '7', at: '100', width: '100', height: '210' });
  await expect(page.getByRole('alert')).toContainText('the room has only 6 walls', FIRST);
  await expect(page.getByRole('button', { name: 'Remove door 1' })).toHaveCount(0);
});

test('a width that cannot be read shows the parser message and adds nothing', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addDoor(page, { wall: '1', at: '400', width: 'abc', height: '210' });
  await expect(page.getByText('This is not a length').first()).toBeVisible(FIRST);
  await expect(page.getByRole('button', { name: 'Remove door 1' })).toHaveCount(0);
});

test('removing the door brings the no-entrance problem back, and undo restores the door', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addDoor(page, ENTRANCE);
  await expect(page.getByRole('button', { name: 'Remove door 1' })).toBeVisible(FIRST);
  await page.getByRole('button', { name: 'Remove door 1' }).click();
  await expect(page.getByRole('button', { name: 'Remove door 1' })).toHaveCount(0);
  await expect(problems(page)).toContainText('no entrance');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove door 1' })).toBeVisible();
});

test('a new id uses the smallest number not yet used for its kind', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addWindow(page, { wall: '6', at: '100', width: '100', height: '120', sill: '90' });
  await expect(page.getByRole('button', { name: 'Remove window 1' })).toBeVisible(FIRST);
  await addWindow(page, { wall: '6', at: '400', width: '100', height: '120', sill: '90' });
  await expect(page.getByRole('button', { name: 'Remove window 2' })).toBeVisible(FIRST);
  await page.getByRole('button', { name: 'Remove window 1' }).click();
  await expect(page.getByRole('button', { name: 'Remove window 1' })).toHaveCount(0);
  await addWindow(page, { wall: '6', at: '100', width: '100', height: '120', sill: '90' });
  await expect(page.getByRole('button', { name: 'Remove window 1' })).toBeVisible(FIRST);
  const saved = await h.saveAs();
  expect((saved.room.openings as { id: string }[]).map((o) => o.id)).toEqual(['window-2', 'window-1']);
});

test('lowering the ceiling under the door is not refused; the problem is listed', async () => {
  const page = await h.launch();
  await h.openRoom(bareL);
  await addDoor(page, ENTRANCE);
  await expect(page.getByRole('button', { name: 'Remove door 1' })).toBeVisible(FIRST);
  const ceiling = page.getByRole('textbox', { name: 'Ceiling height' });
  await ceiling.fill('200');
  await ceiling.press('Enter');
  await expect(problems(page)).toContainText('reaches 2100 mm above the floor', FIRST);
});
