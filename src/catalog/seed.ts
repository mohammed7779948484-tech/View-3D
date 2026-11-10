/**
 * The real catalog seed: products of New Horizon Fixture as stated on newhorizonfixture.com,
 * read on 2026-11-09.
 *
 * RULES (see TEAM_RULES.md):
 * - Only values written on the website. No dimension here is invented, guessed or adjusted.
 * - Nothing is confirmed by the owner yet, so every product is "unverified" (prices included),
 *   or "unknown" when the page states no dimensions. Unknown products cannot be auto-placed.
 * - `source.dimensionsAsWritten` is the page text character for character.
 * - Clearances are not stated by the website: they are 0 here and flagged. Planning aisles are
 *   enforced separately by the layout rules.
 * - No product here is `testOnly`. Synthetic products live only in `test/fixtures`.
 */
import { toUm } from '../core/index';
import type { Entered, LengthUnit, Product, Variant } from '../core/index';

const SITE = 'https://www.newhorizonfixture.com/products/';

const FLAG_CLEARANCES = 'clearances not specified by the owner yet';
const FLAG_NO_DIMENSIONS = 'no dimensions on the page';

const NO_CLEARANCES = { frontUm: 0, backUm: 0, sideUm: 0 } as const;

/** A variant whose three dimensions are stated on the page, in the stated unit. */
function sized(id: string, width: number, depth: number, height: number, unit: LengthUnit): Variant {
  const entered = (value: number): Entered => ({ value, unit });
  return {
    id,
    label: `${width} x ${depth} x ${height} ${unit}`,
    widthUm: toUm(width, unit),
    depthUm: toUm(depth, unit),
    heightUm: toUm(height, unit),
    entered: { width: entered(width), depth: entered(depth), height: entered(height) },
  };
}

/** The single variant of a product whose page states no dimensions. */
const UNKNOWN_SIZE: Variant = {
  id: 'default',
  label: 'size unknown',
  widthUm: null,
  depthUm: null,
  heightUm: null,
};

export const seedProducts: readonly Product[] = [
  {
    id: 'nhf-6ft-extra-view-showcase',
    name: '6FT EXTRA VIEW SHOWCASE',
    category: 'showcase',
    placement: 'freestanding',
    variants: [sized('default', 72, 22, 38, 'in')],
    clearances: { ...NO_CLEARANCES },
    priceCents: 70000,
    verification: 'unverified',
    source: { url: `${SITE}6ft-extra-view-showcase`, dimensionsAsWritten: '72″L x 22″W x 38″H' },
    flags: [FLAG_CLEARANCES],
    testOnly: false,
  },
  {
    id: 'nhf-6ft-full-view-led-lights-showcase',
    name: '4 FT FULL VIEW LED lights Showcase',
    category: 'showcase',
    placement: 'freestanding',
    variants: [sized('h38', 72, 20, 38, 'in'), sized('h42', 72, 20, 42, 'in')],
    clearances: { ...NO_CLEARANCES },
    priceCents: 60000,
    verification: 'unverified',
    source: {
      url: `${SITE}6ft-full-view-led-lights-showcase`,
      dimensionsAsWritten: '72″L x 20″W x 38″/42”H',
    },
    flags: ['title says 4 FT but the page text says 72 in; the owner says 72 in, pending his final confirmation', FLAG_CLEARANCES],
    testOnly: false,
  },
  {
    id: 'nhf-c',
    name: 'Counter',
    category: 'counter',
    placement: 'counter',
    variants: [sized('default', 24, 20, 38, 'in')],
    clearances: { ...NO_CLEARANCES },
    priceCents: 24000,
    verification: 'unverified',
    source: { url: `${SITE}c`, dimensionsAsWritten: '24x20x38inch ,black color' },
    flags: ['axis order not stated on the page; assumed width x depth x height', FLAG_CLEARANCES],
    testOnly: false,
  },
  {
    id: 'nhf-jan',
    name: 'Gondola wood 4 feet',
    category: 'gondola',
    // Single-sided: it goes against a wall or back-to-back in pairs (owner, 2026-11-10).
    placement: 'wall',
    variants: [
      {
        id: 'default',
        label: 'outer width unknown x 24 x 54 in',
        widthUm: null,
        depthUm: toUm(24, 'in'),
        heightUm: toUm(54, 'in'),
      },
    ],
    clearances: { ...NO_CLEARANCES },
    priceCents: 45000,
    verification: 'unknown',
    source: { url: `${SITE}jan`, dimensionsAsWritten: '48(inside )*24*54inch' },
    flags: [
      '48 in is the inside width; the outer width is not stated, so it cannot be placed until the owner gives it',
      FLAG_CLEARANCES,
    ],
    testOnly: false,
  },
  {
    id: 'nhf-g',
    name: 'Gondola 4 feet',
    category: 'gondola',
    placement: 'island',
    variants: [sized('default', 4, 3, 5, 'ft')],
    clearances: { ...NO_CLEARANCES },
    priceCents: 45000,
    verification: 'unverified',
    source: { url: `${SITE}g`, dimensionsAsWritten: "L4*W3*H5'" },
    flags: [FLAG_CLEARANCES],
    testOnly: false,
  },
  {
    id: 'nhf-s-1',
    name: 'Stand showcases',
    category: 'showcase',
    placement: 'wall',
    variants: [sized('default', 48, 20, 72, 'in')],
    clearances: { ...NO_CLEARANCES },
    priceCents: 85000,
    verification: 'unverified',
    source: {
      url: `${SITE}s-1`,
      dimensionsAsWritten: '48*20*72 6mm thickness tempering glass 7pcs shelf',
    },
    flags: [
      'size confirmed by the owner on 2026-11-10: width 48 x depth 20 x height 72 in; price not confirmed',
      FLAG_CLEARANCES,
    ],
    testOnly: false,
  },
  {
    id: 'nhf-s',
    name: 'Showcase 6 feet',
    category: 'showcase',
    placement: 'freestanding',
    variants: [{ ...UNKNOWN_SIZE }],
    clearances: { ...NO_CLEARANCES },
    priceCents: 55000,
    verification: 'unknown',
    source: { url: `${SITE}s`, dimensionsAsWritten: null },
    flags: [FLAG_NO_DIMENSIONS, FLAG_CLEARANCES],
    testOnly: false,
  },
  {
    id: 'nhf-cigarette-display-stand-with-led-lights',
    name: 'CIGARETTE DISPLAY STAND With LED lights',
    category: 'accessory',
    placement: 'wall',
    variants: [{ ...UNKNOWN_SIZE }],
    clearances: { ...NO_CLEARANCES },
    priceCents: 159999,
    verification: 'unknown',
    source: { url: `${SITE}cigarette-display-stand-with-led-lights`, dimensionsAsWritten: null },
    flags: [
      FLAG_NO_DIMENSIONS,
      'category and placement not stated; assumed a wall unit, confirm with the owner',
      FLAG_CLEARANCES,
    ],
    testOnly: false,
  },
  {
    id: 'nhf-dip-and-cigarettes-rack-with-led-lights',
    name: 'Dip and cigarettes rack With LED lights',
    category: 'accessory',
    placement: 'wall',
    variants: [{ ...UNKNOWN_SIZE }],
    clearances: { ...NO_CLEARANCES },
    priceCents: 160000,
    verification: 'unknown',
    source: { url: `${SITE}dip-and-cigarettes-rack-with-led-lights`, dimensionsAsWritten: null },
    flags: [
      FLAG_NO_DIMENSIONS,
      'category and placement not stated; assumed a wall unit, confirm with the owner',
      FLAG_CLEARANCES,
    ],
    testOnly: false,
  },
];
