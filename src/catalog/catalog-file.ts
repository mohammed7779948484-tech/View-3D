/**
 * The owner's catalog as a file (`catalog.json` on his laptop): the website seed on first start,
 * then his own products and confirmations. Pure: every edit returns a new catalog or a coded error.
 * A project embeds its own copies of products, so nothing here ever changes a saved project.
 */
import { z } from 'zod';
import { ProductSchema, toUm } from '../core/index';
import type { Entered, Product, Variant } from '../core/index';
import { seedProducts } from './seed';

export type Catalog = { schemaVersion: 1; products: Product[] };
export type CatalogErrorCode = 'not-json' | 'not-a-catalog' | 'invalid-product' | 'duplicate-id' | 'not-found' | 'cannot-confirm-unknown' | 'test-only';
export type CatalogResult = { ok: true; catalog: Catalog } | { ok: false; code: CatalogErrorCode; errors: string[] };

/** The flag every product carries until the owner gives its clearances (as in the seed). */
export const FLAG_CLEARANCES = 'clearances not specified by the owner yet';

const CatalogSchema = z
  .strictObject({ schemaVersion: z.literal(1), products: z.array(ProductSchema) })
  .superRefine((catalog, ctx) => {
    const seen = new Set<string>();
    catalog.products.forEach((p, i) => {
      if (seen.has(p.id)) ctx.addIssue({ code: 'custom', message: `duplicate product id "${p.id}"`, path: ['products', i, 'id'] });
      seen.add(p.id);
    });
  });

const issues = (error: z.ZodError): string[] => error.issues.map((i) => `${i.path.join('.') || '(catalog)'}: ${i.message}`);
const fail = (code: CatalogErrorCode, errors: string[]): CatalogResult => ({ ok: false, code, errors });

export function seedCatalog(): Catalog {
  return { schemaVersion: 1, products: structuredClone([...seedProducts]) };
}

export const serializeCatalog = (catalog: Catalog): string => `${JSON.stringify(catalog, null, 2)}\n`;

export function parseCatalog(text: string): CatalogResult {
  let json: unknown;
  try {
    json = JSON.parse(text.startsWith('﻿') ? text.slice(1) : text);
  } catch (error) {
    return fail('not-json', [error instanceof Error ? error.message : String(error)]);
  }
  const parsed = CatalogSchema.safeParse(json);
  return parsed.success ? { ok: true, catalog: parsed.data } : fail('not-a-catalog', issues(parsed.error));
}

export type OwnerSize = { id: string; width: Entered | null; depth: Entered | null; height: Entered | null };
export type OwnerProductInput = {
  id: string;
  name: string;
  category: Product['category'];
  placement: Product['placement'];
  variants: OwnerSize[];
  priceCents: number | null;
  /** 'rear' when staff serve it from behind; omitted or 'front' stores nothing. */
  serviceSide?: 'front' | 'rear';
};

const typed = (e: Entered | null): string => (e === null ? '?' : `${e.value} ${e.unit}`);
const umOf = (e: Entered | null): number | null => (e === null ? null : toUm(e.value, e.unit));

/**
 * A product typed by the owner: verified when every size is known (he is the one who confirms),
 * otherwise unknown and not placeable. Nothing is filled in for him.
 */
export function ownerProduct(input: OwnerProductInput): { ok: true; product: Product } | { ok: false; code: 'invalid-product'; errors: string[] } {
  let variants: Variant[];
  try {
    variants = input.variants.map((s) => ({
      id: s.id,
      label: `${typed(s.width)} x ${typed(s.depth)} x ${typed(s.height)}`,
      widthUm: umOf(s.width),
      depthUm: umOf(s.depth),
      heightUm: umOf(s.height),
      entered: { width: s.width, depth: s.depth, height: s.height },
    }));
  } catch (error) {
    return { ok: false, code: 'invalid-product', errors: [error instanceof Error ? error.message : String(error)] };
  }
  const known = variants.every((v) => v.widthUm !== null && v.depthUm !== null && v.heightUm !== null);
  const parsed = ProductSchema.safeParse({
    id: input.id,
    name: input.name.trim(),
    category: input.category,
    placement: input.placement,
    variants,
    clearances: { frontUm: 0, backUm: 0, sideUm: 0 },
    priceCents: input.priceCents,
    verification: known ? 'verified' : 'unknown',
    source: { url: null, dimensionsAsWritten: null },
    flags: [FLAG_CLEARANCES],
    testOnly: false,
    ...(input.serviceSide === 'rear' && input.placement === 'freestanding' ? { serviceSide: 'rear' } : {}),
  });
  return parsed.success ? { ok: true, product: parsed.data } : { ok: false, code: 'invalid-product', errors: issues(parsed.error) };
}

function checked(product: Product): CatalogResult | null {
  if (product.testOnly) return fail('test-only', [`"${product.id}" is a test product and cannot enter the real catalog`]);
  const parsed = ProductSchema.safeParse(product);
  return parsed.success ? null : fail('invalid-product', issues(parsed.error));
}

const indexOf = (catalog: Catalog, id: string): number => catalog.products.findIndex((p) => p.id === id);
const notFound = (id: string): CatalogResult => fail('not-found', [`no product "${id}" in the catalog`]);

export function addProduct(catalog: Catalog, product: Product): CatalogResult {
  const problem = checked(product);
  if (problem !== null) return problem;
  if (indexOf(catalog, product.id) >= 0) return fail('duplicate-id', [`a product "${product.id}" already exists`]);
  return { ok: true, catalog: { ...catalog, products: [...catalog.products, product] } };
}

export function updateProduct(catalog: Catalog, product: Product): CatalogResult {
  const i = indexOf(catalog, product.id);
  if (i < 0) return notFound(product.id);
  const problem = checked(product);
  if (problem !== null) return problem;
  return { ok: true, catalog: { ...catalog, products: catalog.products.map((p, k) => (k === i ? product : p)) } };
}

export function removeProduct(catalog: Catalog, productId: string): CatalogResult {
  if (indexOf(catalog, productId) < 0) return notFound(productId);
  return { ok: true, catalog: { ...catalog, products: catalog.products.filter((p) => p.id !== productId) } };
}

/** The owner confirms website data as it is. A product with an unknown size cannot be confirmed. */
export function confirmProduct(catalog: Catalog, productId: string): CatalogResult {
  const product = catalog.products[indexOf(catalog, productId)];
  if (product === undefined) return notFound(productId);
  if (product.verification === 'unknown') return fail('cannot-confirm-unknown', [`"${product.name}" has an unknown size; type the size first`]);
  if (product.verification === 'verified') return { ok: true, catalog };
  return updateProduct(catalog, { ...product, verification: 'verified' });
}
