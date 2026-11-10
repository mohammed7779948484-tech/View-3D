/** Shared helpers for the rules tests: build small design documents by hand. */
import { toUm } from '../../src/core/index';
import type { DesignDocument, Placement, Point, Product, Room } from '../../src/core/index';
import type { Violation } from '../../src/rules/index';

export const mm = (value: number): number => toUm(value, 'mm');
export const pt = (xMm: number, yMm: number): Point => ({ x: mm(xMm), y: mm(yMm) });
export const DEG = 1_000_000;

/** A document holding the room, the products and the placements. */
export function makeDoc(room: Room, products: readonly Product[], placements: readonly Placement[]): DesignDocument {
  return {
    schemaVersion: 1,
    id: 'test-doc',
    name: 'Test document',
    room,
    products: [...products],
    placements: [...placements],
  };
}

/** A placement of the product's first variant; centre in mm, rotation in whole degrees. */
export function place(id: string, product: Product, xMm: number, yMm: number, rotationDeg = 0): Placement {
  return {
    id,
    productId: product.id,
    variantId: product.variants[0]!.id,
    center: pt(xMm, yMm),
    rotationUdeg: rotationDeg * DEG,
  };
}

/** The violations of one rule. */
export function ofRule(violations: readonly Violation[], rule: Violation['rule']): Violation[] {
  return violations.filter((v) => v.rule === rule);
}

/** A plain rectangular room with a 1000 mm entrance (swing in) in the middle of the bottom wall. */
export function rectRoom(widthMm: number, depthMm: number): Room {
  return {
    outline: [pt(0, 0), pt(widthMm, 0), pt(widthMm, depthMm), pt(0, depthMm)],
    ceilingHeightUm: mm(3000),
    columns: [],
    openings: [
      {
        id: 'entrance',
        kind: 'door',
        wallIndex: 0,
        offsetUm: mm(widthMm / 2 - 500),
        widthUm: mm(1000),
        heightUm: mm(2100),
        sillHeightUm: 0,
        door: { isEntrance: true, swing: 'in', hinge: 'start' },
      },
    ],
  };
}
