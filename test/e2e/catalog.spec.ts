/** Issue M3-1: the catalog screen. The file `<userData>/catalog.json` is read from disk after each action. */
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedProducts } from '../../src/catalog/index';
import type { Product } from '../../src/core/index';
import { launchApp } from './launch';

const FIRST = { timeout: 10_000 };
const UNKNOWN_TEXT = 'Size unknown: cannot be placed';

let app: ElectronApplication | undefined;
let dir = '';
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'view3d-catalog-e2e-'));
});
test.afterEach(async () => {
  await app?.close().catch(() => undefined);
  app = undefined;
  rmSync(dir, { recursive: true, force: true });
});

const catalogPath = (): string => join(dir, 'catalog.json');
const readCatalog = (): { schemaVersion: number; products: Product[] } =>
  JSON.parse(readFileSync(catalogPath(), 'utf8')) as { schemaVersion: number; products: Product[] };
/** The products now on disk, or null while the file is missing or half-written. */
function productsOnDisk(): Product[] | null {
  if (!existsSync(catalogPath())) return null;
  try {
    return readCatalog().products;
  } catch {
    return null;
  }
}
const seed = (id: string): Product => {
  const found = seedProducts.find((p) => p.id === id);
  if (found === undefined) throw new Error(`seed has no ${id}`);
  return found;
};
const hasUnknownSize = (p: Product): boolean =>
  p.variants.some((v) => v.widthUm === null || v.depthUm === null || v.heightUm === null);

async function openCatalog(): Promise<Page> {
  const launched = await launchApp({ userDataDir: dir });
  app = launched.app;
  const page = launched.page;
  await page.getByRole('button', { name: 'Catalog' }).click(FIRST);
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible(FIRST);
  return page;
}
const row = (page: Page, id: string) => page.locator(`[data-product="${id}"]`);

type Form = { name: string; category?: string; placement?: string; width?: string; depth?: string; height?: string; price?: string; servedFrom?: string };
async function fillForm(page: Page, form: Form): Promise<void> {
  await page.getByLabel('Name', { exact: true }).fill(form.name);
  if (form.category !== undefined) await page.getByLabel('Category', { exact: true }).selectOption(form.category);
  if (form.placement !== undefined) await page.getByLabel('Placement', { exact: true }).selectOption(form.placement);
  if (form.width !== undefined) await page.getByLabel('Width', { exact: true }).fill(form.width);
  if (form.depth !== undefined) await page.getByLabel('Depth', { exact: true }).fill(form.depth);
  if (form.height !== undefined) await page.getByLabel('Height', { exact: true }).fill(form.height);
  if (form.price !== undefined) await page.getByLabel('Price (USD)', { exact: true }).fill(form.price);
  if (form.servedFrom !== undefined) await page.getByLabel('Served from', { exact: true }).selectOption(form.servedFrom);
  await page.getByRole('button', { name: 'Save product' }).click();
}
async function addProductThroughForm(page: Page, form: Form): Promise<void> {
  await page.getByRole('button', { name: 'Add a product' }).click();
  await fillForm(page, form);
}

test('first start: the seed is written to catalog.json and shown, unknown sizes flagged', async () => {
  const page = await openCatalog();
  await expect(page.locator('[data-product]')).toHaveCount(9, FIRST);
  await expect.poll(productsOnDisk, FIRST).not.toBeNull();
  expect(readCatalog().schemaVersion).toBe(1);
  expect(readCatalog().products).toEqual(seedProducts);

  const unknown = seedProducts.filter(hasUnknownSize);
  expect(unknown.map((p) => p.id)).toEqual(
    expect.arrayContaining(['nhf-s', 'nhf-jan', 'nhf-cigarette-display-stand-with-led-lights', 'nhf-dip-and-cigarettes-rack-with-led-lights']),
  );
  for (const p of seedProducts) {
    const r = row(page, p.id);
    await expect(r).toHaveAttribute('data-verification', p.verification);
    if (hasUnknownSize(p)) await expect(r).toContainText(UNKNOWN_TEXT);
    else await expect(r).not.toContainText(UNKNOWN_TEXT);
  }
});

test('adding a product with every size known writes a verified owner-1', async () => {
  const page = await openCatalog();
  await addProductThroughForm(page, {
    name: 'Owner counter',
    category: 'counter',
    placement: 'counter',
    width: '48 in',
    depth: '24 in',
    height: '38 in',
    price: '700',
  });
  await expect.poll(() => productsOnDisk()?.length, FIRST).toBe(10);
  const added = readCatalog().products[9]!;
  expect(added.id).toBe('owner-1');
  expect(added.name).toBe('Owner counter');
  expect(added.category).toBe('counter');
  expect(added.placement).toBe('counter');
  expect(added.variants).toHaveLength(1);
  expect(added.variants[0]).toMatchObject({ widthUm: 1_219_200, depthUm: 609_600, heightUm: 965_200 });
  expect(added.verification).toBe('verified');
  expect(added.priceCents).toBe(70000);
  expect(added.testOnly).toBe(false);
  expect(readCatalog().products.slice(0, 9)).toEqual(seedProducts);
  await expect(row(page, 'owner-1')).toHaveAttribute('data-verification', 'verified', FIRST);
});

test("the form has a \"Served from\" select with front (default) and rear; rear is written to catalog.json", async () => {
  const page = await openCatalog();
  await page.getByRole('button', { name: 'Add a product' }).click();
  await page.getByLabel('Placement', { exact: true }).selectOption('freestanding'); // the choice is only offered for freestanding
  const served = page.getByLabel('Served from', { exact: true });
  await expect(served).toBeVisible(FIRST);
  await expect(served).toHaveValue('front');
  expect(await served.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).toEqual(['front', 'rear']);
  await fillForm(page, {
    name: 'Owner rear showcase',
    category: 'showcase',
    placement: 'freestanding',
    width: '60 in',
    depth: '20 in',
    height: '40 in',
    price: '',
    servedFrom: 'rear',
  });
  await expect.poll(() => productsOnDisk()?.length, FIRST).toBe(10);
  const added = readCatalog().products[9]!;
  expect(added.id).toBe('owner-1');
  expect(added.serviceSide).toBe('rear');
  expect(readCatalog().products.slice(0, 9)).toEqual(seedProducts);
});

test('a product added with the default "Served from" has no serviceSide key', async () => {
  const page = await openCatalog();
  await addProductThroughForm(page, { name: 'Owner plain', category: 'accessory', placement: 'freestanding', width: '30 cm', depth: '30 cm', height: '30 cm' });
  await expect.poll(() => productsOnDisk()?.length, FIRST).toBe(10);
  expect('serviceSide' in readCatalog().products[9]!).toBe(false);
});

test('editing a rear-served seed product without touching "Served from" keeps it served from the rear', async () => {
  const page = await openCatalog();
  const name = seed('nhf-6ft-extra-view-showcase').name;
  await expect.poll(productsOnDisk, FIRST).not.toBeNull();
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(page.getByLabel('Served from', { exact: true })).toHaveValue('rear', FIRST);
  await page.getByLabel('Name', { exact: true }).fill(`${name} 2`);
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect.poll(() => productsOnDisk()?.find((p) => p.id === 'nhf-6ft-extra-view-showcase')?.name, FIRST).toBe(`${name} 2`);
  const edited = readCatalog().products.find((p) => p.id === 'nhf-6ft-extra-view-showcase')!;
  expect(edited.serviceSide).toBe('rear');
  expect(edited.serviceSide).toBe(seed('nhf-6ft-extra-view-showcase').serviceSide);
});

test('a product with the height left empty is unknown and cannot be placed', async () => {
  const page = await openCatalog();
  await addProductThroughForm(page, {
    name: 'Owner half-known',
    category: 'counter',
    placement: 'counter',
    width: '48 in',
    depth: '24 in',
    height: '',
    price: '',
  });
  await expect.poll(() => productsOnDisk()?.length, FIRST).toBe(10);
  const added = readCatalog().products[9]!;
  expect(added.id).toBe('owner-1');
  expect(added.variants[0]).toMatchObject({ widthUm: 1_219_200, depthUm: 609_600, heightUm: null });
  expect(added.verification).toBe('unknown');
  expect(added.priceCents).toBeNull();
  await expect(row(page, 'owner-1')).toHaveAttribute('data-verification', 'unknown', FIRST);
  await expect(row(page, 'owner-1')).toContainText(UNKNOWN_TEXT);
});

test('a price of 12.5 is 1250 cents, and the second owner product is owner-2', async () => {
  const page = await openCatalog();
  const form = { category: 'accessory', placement: 'freestanding', width: '30 cm', depth: '30 cm', height: '30 cm' };
  await addProductThroughForm(page, { ...form, name: 'First' });
  await expect.poll(() => productsOnDisk()?.length, FIRST).toBe(10);
  await addProductThroughForm(page, { ...form, name: 'Second', price: '12.5' });
  await expect.poll(() => productsOnDisk()?.length, FIRST).toBe(11);
  const second = readCatalog().products[10]!;
  expect(second.id).toBe('owner-2');
  expect(second.priceCents).toBe(1250);
  expect(second.variants[0]).toMatchObject({ widthUm: 300_000, depthUm: 300_000, heightUm: 300_000 });
});

test('editing a name changes only that product, in place', async () => {
  const page = await openCatalog();
  await addProductThroughForm(page, {
    name: 'Owner counter',
    category: 'counter',
    placement: 'counter',
    width: '48 in',
    depth: '24 in',
    height: '38 in',
    price: '700',
  });
  await expect.poll(() => productsOnDisk()?.length, FIRST).toBe(10);
  const before = readCatalog().products;

  await page.getByRole('button', { name: 'Edit Owner counter' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Owner counter', FIRST);
  await page.getByLabel('Name', { exact: true }).fill('Owner counter 2');
  await page.getByRole('button', { name: 'Save product' }).click();

  await expect.poll(() => productsOnDisk()?.[9]?.name, FIRST).toBe('Owner counter 2');
  const after = readCatalog().products;
  expect(after).toHaveLength(10);
  expect(after[9]).toEqual({ ...before[9]!, name: 'Owner counter 2' });
  expect(after.slice(0, 9)).toEqual(before.slice(0, 9));
});

test('removing a product asks first, then deletes only that product', async () => {
  const page = await openCatalog();
  const name = seed('nhf-6ft-extra-view-showcase').name;
  await expect(row(page, 'nhf-6ft-extra-view-showcase')).toBeVisible(FIRST);
  await expect.poll(productsOnDisk, FIRST).not.toBeNull();
  await page.getByRole('button', { name: `Remove ${name}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Yes, remove' })).toBeVisible(FIRST);
  expect(productsOnDisk()).toEqual(seedProducts); // nothing is removed before the answer
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect.poll(() => productsOnDisk()?.length, FIRST).toBe(8);
  expect(readCatalog().products).toEqual(seedProducts.filter((p) => p.id !== 'nhf-6ft-extra-view-showcase'));
  await expect(row(page, 'nhf-6ft-extra-view-showcase')).toHaveCount(0);
});

test('confirming an unverified product verifies it and nothing else; unknown ones have no Confirm', async () => {
  const page = await openCatalog();
  const c = seed('nhf-6ft-extra-view-showcase');
  expect(c.verification).toBe('unverified');
  await expect(row(page, 'nhf-s').getByRole('button', { name: `Edit ${seed('nhf-s').name}`, exact: true })).toBeVisible(FIRST);
  await expect(page.getByRole('button', { name: `Confirm ${seed('nhf-s').name}`, exact: true })).toHaveCount(0);
  await expect(row(page, 'nhf-6ft-extra-view-showcase').getByRole('button', { name: `Confirm ${c.name}`, exact: true })).toBeVisible();

  await page.getByRole('button', { name: `Confirm ${c.name}`, exact: true }).click();
  await expect.poll(() => productsOnDisk()?.find((p) => p.id === 'nhf-6ft-extra-view-showcase')?.verification, FIRST).toBe('verified');
  const index = seedProducts.findIndex((p) => p.id === 'nhf-6ft-extra-view-showcase');
  const after = readCatalog().products;
  expect(after[index]).toEqual({ ...c, verification: 'verified' });
  expect(after.filter((_, i) => i !== index)).toEqual(seedProducts.filter((_, i) => i !== index));
  await expect(row(page, 'nhf-6ft-extra-view-showcase')).toHaveAttribute('data-verification', 'verified', FIRST);
  await expect(page.getByRole('button', { name: `Confirm ${c.name}`, exact: true })).toHaveCount(0);
});

test('a corrupt catalog.json shows an alert, disables adding, and is never rewritten', async () => {
  writeFileSync(catalogPath(), '{oops');
  const page = await openCatalog();
  await expect(page.getByRole('alert')).toBeVisible(FIRST);
  await expect(page.getByRole('button', { name: 'Add a product' })).toBeDisabled();
  await expect(page.locator('[data-product]')).toHaveCount(0);
  await app!.close().catch(() => undefined);
  app = undefined;
  expect(readFileSync(catalogPath()).equals(Buffer.from('{oops'))).toBe(true);
});

test('a product added on the catalog screen is offered for a room created afterwards, without a restart', async () => {
  const page = await openCatalog();
  await addProductThroughForm(page, {
    name: 'Owner counter',
    category: 'counter',
    placement: 'counter',
    width: '48 in',
    depth: '24 in',
    height: '38 in',
    price: '700',
  });
  await expect(row(page, 'owner-1')).toBeVisible(FIRST);
  await page.getByRole('button', { name: 'Back' }).click();

  // Create a 500 x 400 cm room by typing four walls.
  await page.getByRole('button', { name: 'Type the walls' }).click(FIRST);
  await page.getByRole('textbox', { name: 'Ceiling height' }).fill('300');
  const lengths = ['500', '400', '500', '400'];
  for (const [i, length] of lengths.entries()) {
    await page.getByRole('textbox', { name: `Wall ${i + 1} length`, exact: true }).fill(length);
    await page.getByRole('textbox', { name: `Wall ${i + 1} end angle`, exact: true }).fill('90');
  }
  await page.getByRole('button', { name: 'Create the shop' }).click();

  await expect(page.getByRole('heading', { name: 'Fixtures' })).toBeVisible(FIRST);
  await expect(page.getByRole('button', { name: 'Place Owner counter', exact: true })).toBeVisible(FIRST);
  await expect(page.getByRole('spinbutton', { name: 'Quantity of Owner counter', exact: true })).toBeVisible(FIRST);
});
