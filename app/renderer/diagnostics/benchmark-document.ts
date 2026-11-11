/**
 * The 3D speed test's scene: a real design document with real catalog products (sizes as stated on
 * the website), 10 per row on a fixed grid. Nothing is invented: only products with a known size.
 */
import { parseDesignDocument } from '../../../src/core/index';
import type { DesignDocument, Placement } from '../../../src/core/index';
import { seedProducts } from '../../../src/catalog/index';

const MM = 1000;
const DEG = 1_000_000;
const PER_ROW = 10;
const COLUMN_PITCH_MM = 2200;
const ROW_PITCH_MM = 1900;
const FIRST_X_MM = 1100;
const FIRST_Y_MM = 1000;
const ROOM_WIDTH_MM = 22_000;
/** Room depth = rows x row pitch + this margin. */
const ROOM_MARGIN_MM = 600;
const CEILING_MM = 3000;

/** product / variant / rotation, cycled over the placements. */
const CYCLE: readonly [string, string, number][] = [
  ['nhf-6ft-extra-view-showcase', 'default', 0],
  ['nhf-6ft-full-view-led-lights-showcase', 'h38', 90],
  ['nhf-6ft-full-view-led-lights-showcase', 'h42', 0],
  ['nhf-c', 'default', 90],
  ['nhf-g', 'default', 0],
  ['nhf-s-1', 'default', 30],
];

export function benchmarkDocument(fixtures: number): DesignDocument {
  const rows = Math.ceil(fixtures / PER_ROW);
  const depthMm = rows * ROW_PITCH_MM + ROOM_MARGIN_MM;
  const placements: Placement[] = Array.from({ length: fixtures }, (_, i) => {
    const [productId, variantId, degrees] = CYCLE[i % CYCLE.length]!;
    return {
      id: `bench-${String(i + 1).padStart(3, '0')}`,
      productId,
      variantId,
      center: { x: (FIRST_X_MM + COLUMN_PITCH_MM * (i % PER_ROW)) * MM, y: (FIRST_Y_MM + ROW_PITCH_MM * Math.floor(i / PER_ROW)) * MM },
      rotationUdeg: degrees * DEG,
    };
  });
  const used = new Set(CYCLE.map(([id]) => id));
  const parsed = parseDesignDocument({
    schemaVersion: 1,
    id: `benchmark-${fixtures}`,
    name: `3D speed test, ${fixtures} fixtures`,
    room: {
      outline: [
        { x: 0, y: 0 },
        { x: ROOM_WIDTH_MM * MM, y: 0 },
        { x: ROOM_WIDTH_MM * MM, y: depthMm * MM },
        { x: 0, y: depthMm * MM },
      ],
      ceilingHeightUm: CEILING_MM * MM,
      columns: [],
      openings: [],
    },
    products: seedProducts.filter((p) => used.has(p.id)),
    placements,
  });
  if (!parsed.ok) throw new Error(`benchmarkDocument: ${parsed.errors.join('; ')}`);
  return parsed.document;
}
