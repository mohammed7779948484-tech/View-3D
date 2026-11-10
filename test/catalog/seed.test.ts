import { describe, expect, it } from 'vitest';
import { findProduct, isPlaceable, seedProducts } from '../../src/catalog/index';
import { ProductSchema } from '../../src/core/index';

const IN = 25400;
const FT = 304800;

/**
 * The website values restated by hand (newhorizonfixture.com, read 2026-11-09).
 * Each size is [width, depth, height] in the stated unit; null means the page states no size.
 */
const STATED: {
  name: string;
  url: string;
  priceCents: number;
  asWritten: string | null;
  unitUm: number;
  sizes: ([number | null, number | null, number | null] | null)[];
}[] = [
  {
    name: '6FT EXTRA VIEW SHOWCASE',
    url: 'https://www.newhorizonfixture.com/products/6ft-extra-view-showcase',
    priceCents: 70000,
    asWritten: '72″L x 22″W x 38″H',
    unitUm: IN,
    sizes: [[72, 22, 38]],
  },
  {
    name: '4 FT FULL VIEW LED lights Showcase',
    url: 'https://www.newhorizonfixture.com/products/6ft-full-view-led-lights-showcase',
    priceCents: 60000,
    asWritten: '72″L x 20″W x 38″/42”H',
    unitUm: IN,
    sizes: [
      [72, 20, 38],
      [72, 20, 42],
    ],
  },
  {
    name: 'Counter',
    url: 'https://www.newhorizonfixture.com/products/c',
    priceCents: 24000,
    asWritten: '24x20x38inch ,black color',
    unitUm: IN,
    sizes: [[24, 20, 38]],
  },
  {
    name: 'Gondola wood 4 feet',
    url: 'https://www.newhorizonfixture.com/products/jan',
    priceCents: 45000,
    asWritten: '48(inside )*24*54inch',
    unitUm: IN,
    // 48 in is the INSIDE width; the outer width is not stated, so the footprint is unknown.
    sizes: [[null, 24, 54]],
  },
  {
    name: 'Gondola 4 feet',
    url: 'https://www.newhorizonfixture.com/products/g',
    priceCents: 45000,
    asWritten: "L4*W3*H5'",
    unitUm: FT,
    sizes: [[4, 3, 5]],
  },
  {
    name: 'Stand showcases',
    url: 'https://www.newhorizonfixture.com/products/s-1',
    priceCents: 85000,
    asWritten: '48*20*72 6mm thickness tempering glass 7pcs shelf',
    unitUm: IN,
    sizes: [[48, 20, 72]],
  },
  {
    name: 'Showcase 6 feet',
    url: 'https://www.newhorizonfixture.com/products/s',
    priceCents: 55000,
    asWritten: null,
    unitUm: IN,
    sizes: [null],
  },
  {
    name: 'CIGARETTE DISPLAY STAND With LED lights',
    url: 'https://www.newhorizonfixture.com/products/cigarette-display-stand-with-led-lights',
    priceCents: 159999,
    asWritten: null,
    unitUm: IN,
    sizes: [null],
  },
  {
    name: 'Dip and cigarettes rack With LED lights',
    url: 'https://www.newhorizonfixture.com/products/dip-and-cigarettes-rack-with-led-lights',
    priceCents: 160000,
    asWritten: null,
    unitUm: IN,
    sizes: [null],
  },
];

describe('catalog seed', () => {
  it('validates against the product schema', () => {
    for (const product of seedProducts) {
      const result = ProductSchema.safeParse(product);
      expect(result.success, `${product.id}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it('has exactly the nine website products, with unique ids', () => {
    expect(seedProducts.map((p) => p.name)).toEqual(STATED.map((s) => s.name));
    expect(new Set(seedProducts.map((p) => p.id)).size).toBe(seedProducts.length);
  });

  it.each(STATED)('$name: url, price, text and dimensions are exactly as stated', (stated) => {
    const product = seedProducts.find((p) => p.name === stated.name);
    expect(product).toBeDefined();
    if (!product) return;
    expect(product.source.url).toBe(stated.url);
    expect(product.source.dimensionsAsWritten).toBe(stated.asWritten);
    expect(product.priceCents).toBe(stated.priceCents);
    expect(product.variants).toHaveLength(stated.sizes.length);
    stated.sizes.forEach((size, i) => {
      const variant = product.variants[i];
      expect(variant).toBeDefined();
      if (!variant) return;
      const dims = [variant.widthUm, variant.depthUm, variant.heightUm];
      if (size === null) {
        expect(dims).toEqual([null, null, null]);
      } else {
        expect(dims).toEqual(size.map((n) => (n === null ? null : n * stated.unitUm)));
      }
    });
    const incomplete = stated.sizes.some((size) => size === null || size.includes(null));
    expect(product.verification).toBe(incomplete ? 'unknown' : 'unverified');
  });

  it('every seed product has a source url on the owner site', () => {
    for (const product of seedProducts) {
      expect(product.source.url).toMatch(/^https:\/\/www\.newhorizonfixture\.com\/products\/[a-z0-9-]+$/);
    }
  });

  it('no seed product is testOnly and none is marked verified', () => {
    for (const product of seedProducts) {
      expect(product.testOnly).toBe(false);
      expect(product.verification).not.toBe('verified');
    }
  });

  it('clearances are zero and flagged as not specified', () => {
    for (const product of seedProducts) {
      expect(product.clearances).toEqual({ frontUm: 0, backUm: 0, sideUm: 0 });
      expect(product.flags).toContain('clearances not specified by the owner yet');
    }
  });

  it('carries the flags for the doubtful pages', () => {
    const flagsOf = (name: string): string[] => seedProducts.find((p) => p.name === name)?.flags ?? [];
    expect(flagsOf('4 FT FULL VIEW LED lights Showcase')).toContain(
      'title says 4 FT but the page text says 72 in; the owner says 72 in, pending his final confirmation',
    );
    expect(flagsOf('Counter')).toContain('axis order not stated on the page; assumed width x depth x height');
    expect(flagsOf('Gondola wood 4 feet')).toContain(
      '48 in is the inside width; the outer width is not stated, so it cannot be placed until the owner gives it',
    );
    expect(flagsOf('Stand showcases')).toContain(
      'size confirmed by the owner on 2026-11-10: width 48 x depth 20 x height 72 in; price not confirmed',
    );
    for (const name of [
      'Showcase 6 feet',
      'CIGARETTE DISPLAY STAND With LED lights',
      'Dip and cigarettes rack With LED lights',
    ]) {
      expect(flagsOf(name)).toContain('no dimensions on the page');
    }
  });

  it('uses the categories and placements from the brief', () => {
    const kind = (name: string): string => {
      const p = seedProducts.find((x) => x.name === name);
      return `${p?.category}/${p?.placement}`;
    };
    expect(kind('6FT EXTRA VIEW SHOWCASE')).toBe('showcase/freestanding');
    expect(kind('4 FT FULL VIEW LED lights Showcase')).toBe('showcase/freestanding');
    expect(kind('Counter')).toBe('counter/counter');
    expect(kind('Gondola wood 4 feet')).toBe('gondola/island');
    expect(kind('Gondola 4 feet')).toBe('gondola/island');
    expect(kind('Stand showcases')).toBe('showcase/wall');
  });
});

describe('catalog helpers', () => {
  it('findProduct finds by id and returns undefined otherwise', () => {
    const first = seedProducts[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(findProduct(seedProducts, first.id)).toBe(first);
    expect(findProduct(seedProducts, 'no-such-id')).toBeUndefined();
  });

  it('unknown-size products are not placeable; known ones are', () => {
    for (const product of seedProducts) {
      for (const variant of product.variants) {
        expect(isPlaceable(product, variant.id)).toBe(product.verification !== 'unknown');
      }
      expect(isPlaceable(product, 'no-such-variant')).toBe(false);
    }
    expect(seedProducts.filter((p) => p.verification === 'unknown')).toHaveLength(3);
  });

  it('a variant with a single unknown dimension is not placeable', () => {
    const base = seedProducts[0];
    expect(base).toBeDefined();
    if (!base) return;
    const v = base.variants[0];
    expect(v).toBeDefined();
    if (!v) return;
    const partial = { ...base, verification: 'unknown' as const, variants: [{ ...v, depthUm: null }] };
    expect(isPlaceable(partial, v.id)).toBe(false);
  });

  it('the wood gondola is single-sided (a wall unit) and not placeable while its outer width is unknown', () => {
    const wood = seedProducts.find((p) => p.id === 'nhf-jan')!;
    expect(wood.placement).toBe('wall');
    expect(isPlaceable(wood, 'default')).toBe(false);
  });
});
