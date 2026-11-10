/**
 * The design document: one JSON file that is the single source of truth for a shop layout.
 *
 * Conventions that other modules rely on:
 *
 * - LENGTHS are integer micrometres (um). Field names end in `Um`.
 * - PLAN FRAME: x to the right, y up. The origin is chosen by the document.
 * - ROOM OUTLINE: counter-clockwise simple polygon. Wall `i` runs from `outline[i]` to
 *   `outline[(i + 1) % n]`, so the inside of the room is on the LEFT of each wall.
 * - ROTATION: integer micro-degrees (1 degree = 1 000 000), counter-clockwise from +x,
 *   in the range [0, 360 000 000).
 * - PRODUCT LOCAL FRAME: the origin is the centre of the footprint. WIDTH runs along local +x and
 *   DEPTH along local +y. The FRONT (customer side) faces local +y; the BACK faces local -y
 *   (the back of a wall unit touches the wall). A placement puts the local origin at `center` and
 *   turns the local frame by `rotationUdeg`. With rotation 0 the footprint spans
 *   x in [center.x - width/2, center.x + width/2] and y in [center.y - depth/2, center.y + depth/2],
 *   and the front faces up (+y).
 *
 * Not checked here because it needs geometry (see `src/geometry`): the outline being a simple
 * (non-self-intersecting) polygon, columns lying inside the room, an opening fitting on its wall
 * (`offsetUm + widthUm` no longer than the wall), openings not overlapping each other, and
 * placements lying inside the room.
 */
import { z } from 'zod';
import { LENGTH_UNITS, toUm } from './units';
import type { LengthUnit } from './units';

/** The only document version that exists today. */
export const SCHEMA_VERSION = 1;

/** One full turn in micro-degrees. Rotations are in [0, FULL_TURN_UDEG). */
export const FULL_TURN_UDEG = 360_000_000;

/** A non-empty identifier, unique inside its collection. */
const Id = z.string().min(1);
/** A signed coordinate in integer micrometres. */
const CoordUm = z.int();
/** A size in integer micrometres, greater than zero. */
const SizeUm = z.int().positive();
/** A distance in integer micrometres, zero or more. */
const DistanceUm = z.int().nonnegative();

/** A point on the plan, in integer micrometres. x right, y up. */
export const PointSchema = z.strictObject({
  /** Distance to the right of the origin, um. */
  x: CoordUm,
  /** Distance above the origin, um. */
  y: CoordUm,
});

/** A length as the owner typed it (see `Entered` in units.ts). */
export const EnteredSchema = z.strictObject({
  /** The number as typed. */
  value: z.number(),
  /** The unit it was typed in. */
  unit: z.enum(LENGTH_UNITS as readonly [LengthUnit, ...LengthUnit[]]),
});

/** A structural column (or any fixed obstacle) inside the room. */
export const ColumnSchema = z.strictObject({
  /** Unique among the room's columns. */
  id: Id,
  /** Footprint of the column: at least 3 points, counter-clockwise, um. */
  outline: z.array(PointSchema).min(3),
});

/** Extra data that only doors have. */
export const DoorSchema = z.strictObject({
  /** True for the customer entrance of the shop. */
  isEntrance: z.boolean(),
  /** Which way the leaf opens: into the room, out of it, or no swinging leaf (sliding / open). */
  swing: z.enum(['in', 'out', 'none']),
  /** Which end of the opening carries the hinge: the end nearer the wall's start vertex or its end vertex. */
  hinge: z.enum(['start', 'end']),
});

/** A door or window in a wall. */
export const OpeningSchema = z.strictObject({
  /** Unique among the room's openings. */
  id: Id,
  /** Door or window. */
  kind: z.enum(['door', 'window']),
  /** The wall that holds the opening: wall i runs from outline[i] to outline[(i + 1) % n]. */
  wallIndex: z.int().nonnegative(),
  /** Distance along the wall from the wall's start vertex to the near edge of the opening, um. */
  offsetUm: DistanceUm,
  /** Width of the opening along the wall, um. */
  widthUm: SizeUm,
  /** Height of the opening itself (not of its top edge above the floor), um. */
  heightUm: SizeUm,
  /** Height of the bottom edge above the floor, um. Always 0 for doors. */
  sillHeightUm: DistanceUm,
  /** Present exactly when `kind` is "door". */
  door: DoorSchema.optional(),
});

/** Twice the signed area of a polygon, exact (BigInt). Positive means counter-clockwise. */
function twiceSignedArea(outline: readonly { x: number; y: number }[]): bigint {
  let sum = 0n;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (a === undefined || b === undefined) continue;
    sum += BigInt(a.x) * BigInt(b.y) - BigInt(b.x) * BigInt(a.y);
  }
  return sum;
}

/** Adds a "duplicate id" issue for every item whose id was already used earlier in the list. */
function checkUniqueIds(
  items: readonly { id: string }[],
  basePath: readonly (string | number)[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate id "${item.id}"`,
        path: [...basePath, index, 'id'],
      });
    }
    seen.add(item.id);
  });
}

/** The shop room: its outline, height, columns and openings. */
export const RoomSchema = z
  .strictObject({
    /** Room outline: at least 3 points, counter-clockwise, simple polygon, um. */
    outline: z.array(PointSchema).min(3),
    /** Floor-to-ceiling height, um. */
    ceilingHeightUm: SizeUm,
    /** Columns and other fixed obstacles inside the room. */
    columns: z.array(ColumnSchema),
    /** Doors and windows. */
    openings: z.array(OpeningSchema),
  })
  .superRefine((room, ctx) => {
    if (twiceSignedArea(room.outline) <= 0n) {
      ctx.addIssue({
        code: 'custom',
        message: 'the outline must be counter-clockwise and enclose an area',
        path: ['outline'],
      });
    }
    checkUniqueIds(room.columns, ['columns'], ctx);
    room.columns.forEach((column, index) => {
      if (twiceSignedArea(column.outline) <= 0n) {
        ctx.addIssue({
          code: 'custom',
          message: 'the outline must be counter-clockwise and enclose an area',
          path: ['columns', index, 'outline'],
        });
      }
    });
    checkUniqueIds(room.openings, ['openings'], ctx);
    room.openings.forEach((opening, index) => {
      const path = ['openings', index];
      if (opening.wallIndex >= room.outline.length) {
        ctx.addIssue({
          code: 'custom',
          message: `wall ${opening.wallIndex} does not exist; this room has walls 0 to ${room.outline.length - 1}`,
          path: [...path, 'wallIndex'],
        });
      }
      if (opening.kind === 'door') {
        if (opening.door === undefined) {
          ctx.addIssue({ code: 'custom', message: 'a door needs a "door" block', path: [...path, 'door'] });
        }
        if (opening.sillHeightUm !== 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'a door starts at the floor, so sillHeightUm must be 0',
            path: [...path, 'sillHeightUm'],
          });
        }
      } else if (opening.door !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'a window must not have a "door" block', path: [...path, 'door'] });
      }
      // Whether the opening fits on its wall (offsetUm + widthUm <= wall length) is NOT checked
      // here: wall length needs geometry. See src/geometry.
    });
  });

/** One size option of a product. A null dimension means "unknown". */
export const VariantSchema = z
  .strictObject({
    /** Unique among the product's variants. */
    id: Id,
    /** Short text shown to the owner, for example "72 x 22 x 38 in". */
    label: z.string(),
    /** Size along the product's front (local x), um. Null when unknown. */
    widthUm: SizeUm.nullable(),
    /** Size from front to back (local y), um. Null when unknown. */
    depthUm: SizeUm.nullable(),
    /** Size from the floor up, um. Null when unknown. */
    heightUm: SizeUm.nullable(),
    /**
     * Optional: the three dimensions as they were typed (value + unit), kept beside the um values.
     * An entry that is not null must convert to exactly the stored um value.
     */
    entered: z
      .strictObject({
        /** Width as typed, or null. */
        width: EnteredSchema.nullable(),
        /** Depth as typed, or null. */
        depth: EnteredSchema.nullable(),
        /** Height as typed, or null. */
        height: EnteredSchema.nullable(),
      })
      .optional(),
  })
  .superRefine((variant, ctx) => {
    const entered = variant.entered;
    if (entered === undefined) return;
    const pairs = [
      ['width', entered.width, variant.widthUm],
      ['depth', entered.depth, variant.depthUm],
      ['height', entered.height, variant.heightUm],
    ] as const;
    for (const [key, typed, storedUm] of pairs) {
      if (typed === null) continue;
      let convertedUm: number | null;
      try {
        convertedUm = toUm(typed.value, typed.unit);
      } catch {
        convertedUm = null;
      }
      if (convertedUm === null || convertedUm !== storedUm) {
        ctx.addIssue({
          code: 'custom',
          message: `the entered value ${typed.value} ${typed.unit} does not equal the stored ${key}Um (${String(storedUm)})`,
          path: ['entered', key],
        });
      }
    }
  });

/** True when every dimension of the variant is known. */
function hasAllDimensions(variant: {
  widthUm: number | null;
  depthUm: number | null;
  heightUm: number | null;
}): boolean {
  return variant.widthUm !== null && variant.depthUm !== null && variant.heightUm !== null;
}

/** A catalog product. Products used by a document are embedded in it. */
export const ProductSchema = z
  .strictObject({
    /** Unique among the document's products. */
    id: Id,
    /** Product name as shown to the owner. */
    name: z.string().min(1),
    /** What kind of fixture it is. */
    category: z.enum(['showcase', 'counter', 'gondola', 'tower', 'slatwall', 'accessory']),
    /** Where it may stand: against a wall, as an island, anywhere on the floor, or as the sales counter. */
    placement: z.enum(['wall', 'island', 'freestanding', 'counter']),
    /** Size options; at least one. */
    variants: z.array(VariantSchema).min(1),
    /** Free space the product itself needs, measured outward from its footprint, um. */
    clearances: z.strictObject({
      /** In front (local +y, the customer side). */
      frontUm: DistanceUm,
      /** Behind (local -y). */
      backUm: DistanceUm,
      /** On each side (local -x and +x). */
      sideUm: DistanceUm,
    }),
    /** Price in whole US cents, or null when unknown. */
    priceCents: z.int().nonnegative().nullable(),
    /**
     * How far the data can be trusted: "verified" = confirmed by the owner; "unverified" = read
     * from the website, not confirmed; "unknown" = at least one dimension is missing.
     */
    verification: z.enum(['verified', 'unverified', 'unknown']),
    /** Where the data came from. */
    source: z.strictObject({
      /** Web page the data was read from, or null. */
      url: z.string().nullable(),
      /** The dimension text exactly as written on that page, or null when none is stated. */
      dimensionsAsWritten: z.string().nullable(),
    }),
    /** Open doubts about this product, in plain words, for the owner to resolve. */
    flags: z.array(z.string()),
    /** True only for synthetic products made for tests; never true in the real catalog. */
    testOnly: z.boolean(),
  })
  .superRefine((product, ctx) => {
    checkUniqueIds(product.variants, ['variants'], ctx);
    const complete = product.variants.every(hasAllDimensions);
    if (!complete && product.verification !== 'unknown') {
      ctx.addIssue({
        code: 'custom',
        message: 'a product with an unknown dimension must have verification "unknown"',
        path: ['verification'],
      });
    }
    if (complete && product.verification === 'unknown') {
      ctx.addIssue({
        code: 'custom',
        message: 'verification "unknown" is only for products with an unknown dimension',
        path: ['verification'],
      });
    }
  });

/** One product standing in the room. See the product local frame in the file comment. */
export const PlacementSchema = z.strictObject({
  /** Unique among the document's placements. */
  id: Id,
  /** Id of a product embedded in this document. */
  productId: Id,
  /** Id of one of that product's variants; all its dimensions must be known. */
  variantId: Id,
  /** Centre of the product's footprint on the plan, um. */
  center: PointSchema,
  /** Rotation in integer micro-degrees, counter-clockwise from +x, in [0, 360 000 000). */
  rotationUdeg: z.int().min(0).max(FULL_TURN_UDEG - 1),
});

/** The whole design document. */
export const DesignDocumentSchema = z
  .strictObject({
    /** Version of this format. Only 1 exists. */
    schemaVersion: z.literal(SCHEMA_VERSION),
    /** Identifier of the design. */
    id: Id,
    /** Name of the design as shown to the owner. */
    name: z.string(),
    /** The shop room. */
    room: RoomSchema,
    /** Every product used by the placements, embedded so the document is self-contained. */
    products: z.array(ProductSchema),
    /** The products standing in the room. */
    placements: z.array(PlacementSchema),
  })
  .superRefine((doc, ctx) => {
    checkUniqueIds(doc.products, ['products'], ctx);
    checkUniqueIds(doc.placements, ['placements'], ctx);
    doc.placements.forEach((placement, index) => {
      const product = doc.products.find((p) => p.id === placement.productId);
      if (product === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `no product with id "${placement.productId}" in this document`,
          path: ['placements', index, 'productId'],
        });
        return;
      }
      const variant = product.variants.find((v) => v.id === placement.variantId);
      if (variant === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `product "${product.id}" has no variant "${placement.variantId}"`,
          path: ['placements', index, 'variantId'],
        });
        return;
      }
      if (!hasAllDimensions(variant)) {
        ctx.addIssue({
          code: 'custom',
          message: `variant "${variant.id}" of product "${product.id}" has unknown dimensions and cannot be placed`,
          path: ['placements', index, 'variantId'],
        });
      }
    });
  });

export type Point = z.infer<typeof PointSchema>;
export type Column = z.infer<typeof ColumnSchema>;
export type Door = z.infer<typeof DoorSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
export type DesignDocument = z.infer<typeof DesignDocumentSchema>;

/** Result of `migrate`: the input brought up to the current version (not yet validated), or errors. */
export type MigrateResult = { ok: true; value: unknown } | { ok: false; errors: string[] };

/** Result of `parseDesignDocument`: the typed document, or readable error lines. */
export type ParseResult = { ok: true; document: DesignDocument } | { ok: false; errors: string[] };

/**
 * Brings a stored document up to the current schema version, keyed on `schemaVersion`.
 * Only version 1 exists, so this passes version 1 through unchanged and rejects everything else.
 * When version 2 arrives, add a `1 -> 2` step here.
 */
export function migrate(json: unknown): MigrateResult {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, errors: ['(document): a design document must be a JSON object'] };
  }
  if (!('schemaVersion' in json)) {
    return { ok: false, errors: ['schemaVersion: missing; a design document must state its schemaVersion'] };
  }
  const version: unknown = json.schemaVersion;
  if (version === SCHEMA_VERSION) return { ok: true, value: json };
  return {
    ok: false,
    errors: [
      `schemaVersion: unsupported schemaVersion ${JSON.stringify(version) ?? String(version)}; this planner reads only schemaVersion ${SCHEMA_VERSION}`,
    ],
  };
}

/** Turns a zod issue path into text such as `room.outline[1].x`. */
function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return '(document)';
  let text = '';
  for (const key of path) {
    if (typeof key === 'number') text += `[${key}]`;
    else text += text === '' ? String(key) : `.${String(key)}`;
  }
  return text;
}

/**
 * Checks parsed JSON against the design-document schema.
 * Returns the typed document, or every problem found as one line each: `path: message`.
 * Never throws.
 */
export function parseDesignDocument(json: unknown): ParseResult {
  const migrated = migrate(json);
  if (!migrated.ok) return migrated;
  const result = DesignDocumentSchema.safeParse(migrated.value);
  if (result.success) return { ok: true, document: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`),
  };
}
