/** Issue M3-1: the catalog file, owner-typed products, add / update / remove / confirm. */
import { describe, expect, it } from 'vitest';
import {
  addProduct,
  confirmProduct,
  isPlaceable,
  ownerProduct,
  parseCatalog,
  removeProduct,
  seedCatalog,
  seedProducts,
  serializeCatalog,
  updateProduct,
} from '../../src/catalog/index';
import type { Catalog, CatalogResult } from '../../src/catalog/index';
import type { Product } from '../../src/core/index';
import { testBin } from '../fixtures/products';

const clone = <T>(value: T): T => structuredClone(value);

function okCatalog(result: CatalogResult): Catalog {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.errors.join('; ')}`);
  return result.catalog;
}
function product(id: string): Product {
  const found = seedProducts.find((p) => p.id === id);
  if (found === undefined) throw new Error(`seed has no ${id}`);
  return clone(found);
}
/** A valid owner product, typed by hand in inches (1 in = 25 400 um). */
function counterInput(overrides: Partial<Parameters<typeof ownerProduct>[0]> = {}): Parameters<typeof ownerProduct>[0] {
  return {
    id: 'owner-1',
    name: 'Owner counter',
    category: 'counter',
    placement: 'counter',
    variants: [
      {
        id: 'default',
        width: { value: 48, unit: 'in' },
        depth: { value: 24, unit: 'in' },
        height: { value: 38, unit: 'in' },
      },
    ],
    priceCents: 70000,
    ...overrides,
  };
}
function ownerOk(input: Parameters<typeof ownerProduct>[0]): Product {
  const result = ownerProduct(input);
  if (!result.ok) throw new Error(`expected ok, got ${result.errors.join('; ')}`);
  return result.product;
}

describe('seedCatalog', () => {
  it('has schemaVersion 1 and the seed products in order', () => {
    const catalog = seedCatalog();
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.products).toEqual(seedProducts);
    expect(catalog.products).toHaveLength(9);
  });

  it('is a copy: changing it leaves seedProducts alone', () => {
    const before = clone(seedProducts);
    const catalog = seedCatalog();
    catalog.products[0]!.name = 'changed';
    catalog.products[0]!.variants[0]!.label = 'changed';
    catalog.products.pop();
    expect(seedProducts).toEqual(before);
    expect(seedCatalog().products).toEqual(before);
  });
});

describe('serializeCatalog and parseCatalog', () => {
  it('serializes as two-space JSON with one trailing newline', () => {
    const catalog = seedCatalog();
    expect(serializeCatalog(catalog)).toBe(JSON.stringify(catalog, null, 2) + '\n');
  });

  it('round-trips the seed byte for byte', () => {
    const first = serializeCatalog(seedCatalog());
    const parsed = okCatalog(parseCatalog(first));
    expect(parsed).toEqual(seedCatalog());
    expect(serializeCatalog(parsed)).toBe(first);
  });

  it('accepts a leading BOM', () => {
    const text = '﻿' + serializeCatalog(seedCatalog());
    expect(okCatalog(parseCatalog(text))).toEqual(seedCatalog());
  });

  function failure(text: string): { code: string; errors: string[] } {
    const result = parseCatalog(text);
    if (result.ok) throw new Error('expected a failure');
    return result;
  }

  it('text that is not JSON gives not-json', () => {
    const result = failure('{');
    expect(result.code).toBe('not-json');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('schemaVersion 2 gives not-a-catalog', () => {
    const result = failure(JSON.stringify({ ...seedCatalog(), schemaVersion: 2 }));
    expect(result.code).toBe('not-a-catalog');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('a missing products list gives not-a-catalog', () => {
    const result = failure(JSON.stringify({ schemaVersion: 1 }));
    expect(result.code).toBe('not-a-catalog');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('a product that fails the Product schema gives not-a-catalog', () => {
    const catalog = clone(seedCatalog());
    catalog.products[2]!.variants[0]!.widthUm = -5;
    const result = failure(JSON.stringify(catalog));
    expect(result.code).toBe('not-a-catalog');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('two products with the same id give not-a-catalog', () => {
    const catalog = clone(seedCatalog());
    catalog.products.push(clone(catalog.products[0]!));
    const result = failure(JSON.stringify(catalog));
    expect(result.code).toBe('not-a-catalog');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('ownerProduct', () => {
  it('turns 48 x 24 x 38 in into exact micrometres and a verified product', () => {
    const p = ownerOk(counterInput());
    expect(p).toEqual({
      id: 'owner-1',
      name: 'Owner counter',
      category: 'counter',
      placement: 'counter',
      variants: [
        {
          id: 'default',
          label: '48 in x 24 in x 38 in',
          widthUm: 1_219_200, // 48 x 25 400
          depthUm: 609_600, // 24 x 25 400
          heightUm: 965_200, // 38 x 25 400
          entered: {
            width: { value: 48, unit: 'in' },
            depth: { value: 24, unit: 'in' },
            height: { value: 38, unit: 'in' },
          },
        },
      ],
      clearances: { frontUm: 0, backUm: 0, sideUm: 0 },
      priceCents: 70000,
      verification: 'verified',
      source: { url: null, dimensionsAsWritten: null },
      flags: ['clearances not specified by the owner yet'],
      testOnly: false,
    });
    expect(isPlaceable(p, 'default')).toBe(true);
  });

  describe('serviceSide', () => {
    it("'rear' gives the product serviceSide 'rear' and changes nothing else", () => {
      const p = ownerOk(counterInput({ placement: 'freestanding', serviceSide: 'rear' }));
      const { serviceSide, ...rest } = p;
      expect(serviceSide).toBe('rear');
      expect(rest).toEqual(ownerOk(counterInput({ placement: 'freestanding' })));
    });

    it("'rear' on a counter or a wall product is dropped: the form only offers it for freestanding", () => {
      for (const placement of ['counter', 'wall'] as const) {
        const p = ownerOk(counterInput({ placement, serviceSide: 'rear' }));
        expect('serviceSide' in p, placement).toBe(false);
      }
    });

    it("omitted or 'front' leaves no serviceSide key at all (byte-identical to before)", () => {
      const plain = ownerOk(counterInput());
      const front = ownerOk(counterInput({ serviceSide: 'front' }));
      expect('serviceSide' in plain).toBe(false);
      expect('serviceSide' in front).toBe(false);
      expect(JSON.stringify(front)).toBe(JSON.stringify(plain));
    });

    it('a rear product survives add, serialize and parse', () => {
      const rear = ownerOk(counterInput({ placement: 'freestanding', serviceSide: 'rear' }));
      const added = okCatalog(addProduct(seedCatalog(), rear));
      const back = okCatalog(parseCatalog(serializeCatalog(added)));
      expect(back.products[9]!.serviceSide).toBe('rear');
    });
  });

  it('keeps a null price as null', () => {
    expect(ownerOk(counterInput({ priceCents: null })).priceCents).toBeNull();
  });

  it('an unknown height stays unknown: label with ?, verification unknown, not placeable', () => {
    const p = ownerOk(
      counterInput({
        variants: [{ id: 'default', width: { value: 48, unit: 'in' }, depth: { value: 24, unit: 'in' }, height: null }],
      }),
    );
    const v = p.variants[0]!;
    expect(v.heightUm).toBeNull();
    expect(v.entered?.height).toBeNull();
    expect(v.widthUm).toBe(1_219_200);
    expect(v.depthUm).toBe(609_600);
    expect(v.label).toBe('48 in x 24 in x ?');
    expect(p.verification).toBe('unknown');
    expect(isPlaceable(p, 'default')).toBe(false);
  });

  it('120 cm is 1 200 000 um', () => {
    const p = ownerOk(
      counterInput({
        variants: [
          {
            id: 'default',
            width: { value: 120, unit: 'cm' },
            depth: { value: 24, unit: 'in' },
            height: { value: 38, unit: 'in' },
          },
        ],
      }),
    );
    expect(p.variants[0]!.widthUm).toBe(1_200_000);
  });

  it('a width of 0 is invalid-product', () => {
    const result = ownerProduct(
      counterInput({
        variants: [
          { id: 'default', width: { value: 0, unit: 'in' }, depth: { value: 24, unit: 'in' }, height: { value: 38, unit: 'in' } },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid-product');
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('an empty name is invalid-product', () => {
    const result = ownerProduct(counterInput({ name: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid-product');
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('addProduct', () => {
  it('appends at the end and never changes the input catalog', () => {
    const catalog = seedCatalog();
    const before = clone(catalog);
    const added = ownerOk(counterInput());
    const next = okCatalog(addProduct(catalog, added));
    expect(catalog).toEqual(before);
    expect(next.products).toHaveLength(10);
    expect(next.products.slice(0, 9)).toEqual(seedProducts);
    expect(next.products[9]).toEqual(added);
    expect(next.schemaVersion).toBe(1);
  });

  it('a duplicate id gives duplicate-id and leaves the input alone', () => {
    const catalog = seedCatalog();
    const before = clone(catalog);
    const result = addProduct(catalog, { ...product('nhf-c') });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('duplicate-id');
      expect(result.errors.length).toBeGreaterThan(0);
    }
    expect(catalog).toEqual(before);
  });

  it('a testOnly product gives test-only', () => {
    const catalog = seedCatalog();
    const before = clone(catalog);
    const result = addProduct(catalog, clone(testBin));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('test-only');
    expect(catalog).toEqual(before);
  });

  it('a product that fails the schema gives invalid-product', () => {
    const bad = ownerOk(counterInput());
    bad.variants[0]!.widthUm = -5;
    const result = addProduct(seedCatalog(), bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid-product');
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('updateProduct', () => {
  it('replaces the product with the same id at the same index', () => {
    const catalog = okCatalog(addProduct(seedCatalog(), ownerOk(counterInput())));
    const before = clone(catalog);
    const renamed = { ...clone(catalog.products[9]!), name: 'Owner counter 2' };
    const middle = { ...product('nhf-g'), name: 'Gondola renamed' };
    const next = okCatalog(updateProduct(okCatalog(updateProduct(catalog, renamed)), middle));
    expect(catalog).toEqual(before);
    expect(next.products).toHaveLength(10);
    expect(next.products[9]).toEqual(renamed);
    const index = seedProducts.findIndex((p) => p.id === 'nhf-g');
    expect(next.products[index]).toEqual(middle);
    next.products.forEach((p, i) => {
      if (i !== 9 && i !== index) expect(p).toEqual(catalog.products[i]);
    });
  });

  it('an unknown id gives not-found', () => {
    const result = updateProduct(seedCatalog(), ownerOk(counterInput()));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not-found');
  });

  it('a schema failure gives invalid-product', () => {
    const bad = product('nhf-c');
    bad.name = '';
    const result = updateProduct(seedCatalog(), bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid-product');
  });
});

describe('removeProduct', () => {
  it('removes the product and keeps the others in order', () => {
    const catalog = seedCatalog();
    const before = clone(catalog);
    const next = okCatalog(removeProduct(catalog, 'nhf-c'));
    expect(catalog).toEqual(before);
    expect(next.products).toEqual(seedProducts.filter((p) => p.id !== 'nhf-c'));
    expect(next.products).toHaveLength(8);
  });

  it('an unknown id gives not-found', () => {
    const result = removeProduct(seedCatalog(), 'no-such-id');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not-found');
  });
});

describe('confirmProduct', () => {
  it('turns unverified into verified and changes nothing else', () => {
    const catalog = seedCatalog();
    const before = clone(catalog);
    const next = okCatalog(confirmProduct(catalog, 'nhf-c'));
    expect(catalog).toEqual(before);
    const index = seedProducts.findIndex((p) => p.id === 'nhf-c');
    expect(seedProducts[index]!.verification).toBe('unverified');
    expect(next.products[index]!.verification).toBe('verified');
    expect({ ...next.products[index]!, verification: 'unverified' }).toEqual(seedProducts[index]);
    next.products.forEach((p, i) => {
      if (i !== index) expect(p).toEqual(seedProducts[i]);
    });
  });

  it('refuses an unknown-size product', () => {
    expect(seedProducts.find((p) => p.id === 'nhf-s')!.verification).toBe('unknown');
    const result = confirmProduct(seedCatalog(), 'nhf-s');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('cannot-confirm-unknown');
  });

  it('an already verified product is ok and unchanged', () => {
    const once = okCatalog(confirmProduct(seedCatalog(), 'nhf-c'));
    const twice = okCatalog(confirmProduct(once, 'nhf-c'));
    expect(twice).toEqual(once);
  });

  it('an unknown id gives not-found', () => {
    const result = confirmProduct(seedCatalog(), 'no-such-id');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not-found');
  });
});
