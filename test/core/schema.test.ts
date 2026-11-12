import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DesignDocumentSchema,
  ProductSchema,
  RoomSchema,
  SCHEMA_VERSION,
  migrate,
  parseDesignDocument,
} from '../../src/core/index';
import type { DesignDocument, ParseResult } from '../../src/core/index';
import { testShowcaseRear } from '../fixtures/products';

const MM = 1000;

/** A small valid document as plain JSON data (fresh copy on every call). */
function validDocument(): Record<string, any> {
  return {
    schemaVersion: 1,
    id: 'doc-1',
    name: 'Test shop',
    room: {
      outline: [
        { x: 0, y: 0 },
        { x: 6000 * MM, y: 0 },
        { x: 6000 * MM, y: 4000 * MM },
        { x: 0, y: 4000 * MM },
      ],
      ceilingHeightUm: 3000 * MM,
      columns: [
        {
          id: 'col-1',
          outline: [
            { x: 2000 * MM, y: 2000 * MM },
            { x: 2400 * MM, y: 2000 * MM },
            { x: 2400 * MM, y: 2400 * MM },
            { x: 2000 * MM, y: 2400 * MM },
          ],
        },
      ],
      openings: [
        {
          id: 'door-1',
          kind: 'door',
          wallIndex: 0,
          offsetUm: 2500 * MM,
          widthUm: 1000 * MM,
          heightUm: 2100 * MM,
          sillHeightUm: 0,
          door: { isEntrance: true, swing: 'in', hinge: 'start' },
        },
        {
          id: 'win-1',
          kind: 'window',
          wallIndex: 2,
          offsetUm: 1000 * MM,
          widthUm: 2000 * MM,
          heightUm: 1200 * MM,
          sillHeightUm: 900 * MM,
        },
      ],
    },
    products: [
      {
        id: 'test-shelf',
        name: 'TEST shelf',
        category: 'gondola',
        placement: 'wall',
        variants: [
          {
            id: 'v1',
            label: '1200 x 400 x 2100 mm',
            widthUm: 1200 * MM,
            depthUm: 400 * MM,
            heightUm: 2100 * MM,
            entered: {
              width: { value: 1200, unit: 'mm' },
              depth: { value: 400, unit: 'mm' },
              height: { value: 2100, unit: 'mm' },
            },
          },
        ],
        clearances: { frontUm: 600 * MM, backUm: 0, sideUm: 0 },
        priceCents: 12345,
        verification: 'verified',
        source: { url: null, dimensionsAsWritten: null },
        flags: [],
        testOnly: true,
      },
      {
        id: 'test-mystery',
        name: 'TEST unknown size',
        category: 'showcase',
        placement: 'freestanding',
        variants: [{ id: 'v1', label: 'Size unknown', widthUm: null, depthUm: null, heightUm: null }],
        clearances: { frontUm: 0, backUm: 0, sideUm: 0 },
        priceCents: null,
        verification: 'unknown',
        source: { url: null, dimensionsAsWritten: null },
        flags: ['no dimensions'],
        testOnly: true,
      },
    ],
    placements: [
      {
        id: 'pl-1',
        productId: 'test-shelf',
        variantId: 'v1',
        center: { x: 3000 * MM, y: 3800 * MM },
        rotationUdeg: 180_000_000,
      },
    ],
  };
}

function errorsOf(result: ParseResult): string[] {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

/** Asserts the document is rejected and one error line matches `pattern`. */
function expectRejected(doc: unknown, pattern: RegExp): void {
  const errors = errorsOf(parseDesignDocument(doc));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.join('\n')).toMatch(pattern);
}

describe('parseDesignDocument: valid input', () => {
  it('parses a valid document and returns it typed', () => {
    const result = parseDesignDocument(validDocument());
    expect(result).toEqual({ ok: true, document: validDocument() });
    if (result.ok) {
      const doc: DesignDocument = result.document;
      expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
      expect(doc.placements[0]?.rotationUdeg).toBe(180_000_000);
    }
  });

  it('survives a JSON round trip unchanged', () => {
    const json: unknown = JSON.parse(JSON.stringify(validDocument()));
    const result = parseDesignDocument(json);
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.document)).toBe(JSON.stringify(validDocument()));
  });

  it('accepts rotation 0 and the largest value below a full turn', () => {
    for (const rotationUdeg of [0, 359_999_999]) {
      const doc = validDocument();
      doc.placements[0].rotationUdeg = rotationUdeg;
      expect(parseDesignDocument(doc).ok).toBe(true);
    }
  });
});

describe('parseDesignDocument: rejections', () => {
  it('rejects a float coordinate', () => {
    const doc = validDocument();
    doc.room.outline[1].x = 6000 * MM + 0.5;
    expectRejected(doc, /^room\.outline\[1\]\.x: /m);
  });

  it('rejects a float dimension and a float placement centre', () => {
    const a = validDocument();
    a.products[0].variants[0].widthUm = 1200.25;
    expectRejected(a, /^products\[0\]\.variants\[0\]\.widthUm: /m);
    const b = validDocument();
    b.placements[0].center.y = 0.1;
    expectRejected(b, /^placements\[0\]\.center\.y: /m);
  });

  it('rejects duplicate product ids', () => {
    const doc = validDocument();
    doc.products[1].id = 'test-shelf';
    expectRejected(doc, /^products\[1\]\.id: duplicate id "test-shelf"/m);
  });

  it('rejects duplicate variant ids inside one product', () => {
    const doc = validDocument();
    doc.products[0].variants.push({ ...doc.products[0].variants[0] });
    expectRejected(doc, /^products\[0\]\.variants\[1\]\.id: duplicate id "v1"/m);
  });

  it('rejects duplicate placement, opening and column ids', () => {
    const a = validDocument();
    a.placements.push({ ...a.placements[0] });
    expectRejected(a, /^placements\[1\]\.id: duplicate id "pl-1"/m);
    const b = validDocument();
    b.room.openings[1].id = 'door-1';
    expectRejected(b, /^room\.openings\[1\]\.id: duplicate id "door-1"/m);
    const c = validDocument();
    c.room.columns.push({ ...c.room.columns[0] });
    expectRejected(c, /^room\.columns\[1\]\.id: duplicate id "col-1"/m);
  });

  it('rejects a dangling productId', () => {
    const doc = validDocument();
    doc.placements[0].productId = 'no-such-product';
    expectRejected(doc, /^placements\[0\]\.productId: no product with id "no-such-product"/m);
  });

  it('rejects a dangling variantId', () => {
    const doc = validDocument();
    doc.placements[0].variantId = 'v9';
    expectRejected(doc, /^placements\[0\]\.variantId: product "test-shelf" has no variant "v9"/m);
  });

  it('rejects a placement of a variant with unknown dimensions', () => {
    const doc = validDocument();
    doc.placements[0].productId = 'test-mystery';
    expectRejected(doc, /^placements\[0\]\.variantId: .*unknown dimensions/m);
  });

  it('rejects a door without a door block', () => {
    const doc = validDocument();
    delete doc.room.openings[0].door;
    expectRejected(doc, /^room\.openings\[0\]\.door: /m);
  });

  it('rejects a window with a door block and a door with a sill', () => {
    const a = validDocument();
    a.room.openings[1].door = { isEntrance: false, swing: 'none', hinge: 'start' };
    expectRejected(a, /^room\.openings\[1\]\.door: /m);
    const b = validDocument();
    b.room.openings[0].sillHeightUm = 100 * MM;
    expectRejected(b, /^room\.openings\[0\]\.sillHeightUm: /m);
  });

  it('rejects a bad schemaVersion with a clear message', () => {
    const doc = validDocument();
    doc.schemaVersion = 2;
    expectRejected(doc, /schemaVersion.*2.*only.*1/i);
    const missing = validDocument();
    delete missing.schemaVersion;
    expectRejected(missing, /schemaVersion/);
    const text = validDocument();
    text.schemaVersion = '1';
    expectRejected(text, /schemaVersion/);
  });

  it('rejects rotation out of range', () => {
    for (const rotationUdeg of [360_000_000, -1, 90_000_000.5]) {
      const doc = validDocument();
      doc.placements[0].rotationUdeg = rotationUdeg;
      expectRejected(doc, /^placements\[0\]\.rotationUdeg: /m);
    }
  });

  it('rejects a wallIndex outside the outline', () => {
    const doc = validDocument();
    doc.room.openings[0].wallIndex = 4; // a 4-vertex outline has walls 0..3
    expectRejected(doc, /^room\.openings\[0\]\.wallIndex: /m);
    const neg = validDocument();
    neg.room.openings[0].wallIndex = -1;
    expectRejected(neg, /^room\.openings\[0\]\.wallIndex: /m);
  });

  it('rejects an outline with fewer than three points and a clockwise outline', () => {
    const two = validDocument();
    two.room.outline = two.room.outline.slice(0, 2);
    two.room.openings = [];
    expectRejected(two, /^room\.outline: /m);
    const clockwise = validDocument();
    clockwise.room.outline.reverse();
    expectRejected(clockwise, /^room\.outline: .*counter-clockwise/m);
  });

  it('rejects verification that disagrees with the dimensions', () => {
    const a = validDocument();
    a.products[1].verification = 'unverified'; // has null dimensions, must be "unknown"
    expectRejected(a, /^products\[1\]\.verification: /m);
    const b = validDocument();
    b.products[0].verification = 'unknown'; // all dimensions known, must not be "unknown"
    expectRejected(b, /^products\[0\]\.verification: /m);
  });

  it('rejects an entered value that does not convert to the stored um value', () => {
    const doc = validDocument();
    doc.products[0].variants[0].entered.width = { value: 47, unit: 'in' };
    expectRejected(doc, /^products\[0\]\.variants\[0\]\.entered\.width: /m);
  });

  it('rejects unknown fields, zero sizes and input that is not an object', () => {
    const extra = validDocument();
    extra.room.colour = 'red';
    expectRejected(extra, /^room: /m);
    const zero = validDocument();
    zero.products[0].variants[0].depthUm = 0;
    expectRejected(zero, /^products\[0\]\.variants\[0\]\.depthUm: /m);
    expect(parseDesignDocument(null).ok).toBe(false);
    expect(parseDesignDocument('{}').ok).toBe(false);
    expect(parseDesignDocument([]).ok).toBe(false);
  });

  it('reports every problem, not only the first', () => {
    const doc = validDocument();
    doc.placements[0].productId = 'no-such-product';
    doc.room.openings[0].wallIndex = 9;
    const errors = errorsOf(parseDesignDocument(doc));
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('migrate', () => {
  it('passes a version 1 document through unchanged', () => {
    const doc = validDocument();
    expect(migrate(doc)).toEqual({ ok: true, value: doc });
  });

  it('rejects unknown versions with a clear error', () => {
    const result = migrate({ schemaVersion: 7 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/schemaVersion 7.*only.*1/i);
  });
});

describe('part schemas', () => {
  it('RoomSchema and ProductSchema validate the parts of a valid document', () => {
    const doc = validDocument();
    expect(RoomSchema.safeParse(doc.room).success).toBe(true);
    expect(ProductSchema.safeParse(doc.products[0]).success).toBe(true);
    expect(DesignDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe('ProductSchema: serviceSide (which side the staff serve a fixture from)', () => {
  const withServiceSide = (value: unknown) => ({ ...validDocument().products[0], serviceSide: value });

  it("keeps 'rear' on a product", () => {
    const result = ProductSchema.safeParse(withServiceSide('rear'));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.serviceSide).toBe('rear');
  });

  it("keeps 'front' on a product", () => {
    const result = ProductSchema.safeParse(withServiceSide('front'));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.serviceSide).toBe('front');
  });

  it("refuses any other value, such as 'side'", () => {
    expect(ProductSchema.safeParse(withServiceSide('side')).success).toBe(false);
  });

  it('a document with a rear product parses and keeps the field', () => {
    const doc = validDocument();
    doc.products[0] = withServiceSide('rear');
    const result = parseDesignDocument(doc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.products[0]!.serviceSide).toBe('rear');
  });

  it('a product without the field still parses and gets no key added (absent means front)', () => {
    const result = ProductSchema.safeParse(validDocument().products[0]);
    expect(result.success).toBe(true);
    if (result.success) expect('serviceSide' in result.data).toBe(false);
  });

  it('a document from Milestone 1 still parses, unchanged', () => {
    const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../fixtures/m1-document.json'), 'utf8')) as unknown;
    const result = parseDesignDocument(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document).toEqual(raw);
      expect(result.document.schemaVersion).toBe(1);
      for (const product of result.document.products) expect('serviceSide' in product).toBe(false);
    }
  });
});

describe("ProductSchema: serviceSide 'rear' only for freestanding products", () => {
  const base = validDocument().products[0]!;
  const as = (placement: string, serviceSide?: string) => ({
    ...base,
    placement,
    ...(serviceSide === undefined ? {} : { serviceSide }),
  });

  it("refuses 'rear' on a wall product (it must stand back to a wall, a rear staff zone forbids that)", () => {
    expect(ProductSchema.safeParse(as('wall', 'rear')).success).toBe(false);
  });

  it("refuses 'rear' on an island and on a counter product (it would be silently ignored)", () => {
    expect(ProductSchema.safeParse(as('island', 'rear')).success).toBe(false);
    expect(ProductSchema.safeParse(as('counter', 'rear')).success).toBe(false);
  });

  it("accepts 'rear' on a freestanding product (testShowcaseRear)", () => {
    expect(ProductSchema.safeParse(testShowcaseRear).success).toBe(true);
  });

  it("accepts 'front' or no serviceSide for every placement", () => {
    for (const placement of ['wall', 'island', 'counter', 'freestanding']) {
      expect(ProductSchema.safeParse(as(placement, 'front')).success, placement).toBe(true);
      expect(ProductSchema.safeParse(as(placement)).success, placement).toBe(true);
    }
  });
});
