/** Issue M3-2: the placement commands, as immer recipes for documentStore.edit. */
import { describe, expect, it } from 'vitest';
import { seedProducts } from '../../../../src/catalog/index';
import type { DesignDocument, Product } from '../../../../src/core/index';
import { quarterTurn } from '../../../../src/rules/index';
import { protectedDoorway } from '../../../fixtures/rooms';
import { createDocumentStore } from '../../../../app/renderer/state/document-store';
import {
  deletePlacement,
  duplicatePlacement,
  movePlacement,
  placeProduct,
  rotatePlacement,
  setPlacementPose,
} from '../../../../app/renderer/state/placement-commands';

const seed = (id: string): Product => {
  const p = seedProducts.find((q) => q.id === id);
  if (p === undefined) throw new Error('missing seed ' + id);
  return p;
};
const counter = seed('nhf-c'); // 24 x 20 x 38 in; width 24 x 25_400 = 609_600 um
const unknownSize = seed('nhf-s');

function makeStore() {
  return createDocumentStore(
    structuredClone({
      schemaVersion: 1,
      id: 'place-test',
      name: 'Place test',
      room: protectedDoorway,
      products: [],
      placements: [],
    }) as DesignDocument,
  );
}
const doc = (s: ReturnType<typeof makeStore>) => s.getState().document!;
const bytes = (s: ReturnType<typeof makeStore>) => JSON.stringify(doc(s));
const c0 = { x: 3_000_000, y: 2_000_000 };

describe('placeProduct', () => {
  it('adds p1 and embeds a deep copy of the product', () => {
    const s = makeStore();
    expect(s.edit(placeProduct(counter, 'default', c0, 0))).toEqual({ ok: true });
    expect(doc(s).placements).toEqual([
      { id: 'p1', productId: 'nhf-c', variantId: 'default', center: c0, rotationUdeg: 0 },
    ]);
    expect(doc(s).products).toEqual([counter]);
    expect(doc(s).products[0]).not.toBe(counter);
  });

  it('embeds the product only once', () => {
    const s = makeStore();
    s.edit(placeProduct(counter, 'default', c0, 0));
    s.edit(placeProduct(counter, 'default', { x: 1_000_000, y: 1_000_000 }, 90_000_000));
    expect(doc(s).products).toHaveLength(1);
    expect(doc(s).placements.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(doc(s).placements[1]!.rotationUdeg).toBe(90_000_000);
  });

  it('refuses a variant with an unknown size and changes nothing', () => {
    const s = makeStore();
    const before = bytes(s);
    const r = s.edit(placeProduct(unknownSize, unknownSize.variants[0]!.id, c0, 0));
    expect(r.ok).toBe(false);
    expect(bytes(s)).toBe(before);
    expect(s.getState().canUndo).toBe(false);
  });

  it('uses the smallest unused id after a delete', () => {
    const s = makeStore();
    s.edit(placeProduct(counter, 'default', c0, 0));
    s.edit(placeProduct(counter, 'default', { x: 1_000_000, y: 1_000_000 }, 0));
    s.edit(deletePlacement('p1'));
    s.edit(placeProduct(counter, 'default', { x: 5_000_000, y: 1_000_000 }, 0));
    expect(doc(s).placements.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(doc(s).placements.find((p) => p.id === 'p1')!.center).toEqual({ x: 5_000_000, y: 1_000_000 });
  });
});

describe('moving, posing, rotating', () => {
  const placed = () => {
    const s = makeStore();
    s.edit(placeProduct(counter, 'default', c0, 0));
    return s;
  };

  it('movePlacement moves by exactly the delta', () => {
    const s = placed();
    s.edit(movePlacement('p1', 100_000, -250_000));
    expect(doc(s).placements[0]!.center).toEqual({ x: 3_100_000, y: 1_750_000 });
  });

  it('setPlacementPose sets exactly the given values', () => {
    const s = placed();
    s.edit(setPlacementPose('p1', { center: { x: 4_000_000, y: 1_500_000 } }));
    expect(doc(s).placements[0]).toMatchObject({ center: { x: 4_000_000, y: 1_500_000 }, rotationUdeg: 0 });
    s.edit(setPlacementPose('p1', { rotationUdeg: 45_000_000 }));
    expect(doc(s).placements[0]).toMatchObject({ center: { x: 4_000_000, y: 1_500_000 }, rotationUdeg: 45_000_000 });
  });

  it('rotatePlacement turns to the next wall-relative quarter', () => {
    const s = placed();
    s.edit(rotatePlacement('p1'));
    // Nearest wall of (3000, 2000) mm is wall 0 (angle 0): 0 -> 90 degrees.
    expect(doc(s).placements[0]!.rotationUdeg).toBe(90_000_000);
    expect(doc(s).placements[0]!.rotationUdeg).toBe(quarterTurn(protectedDoorway, c0, 0));
    s.edit(rotatePlacement('p1'));
    expect(doc(s).placements[0]!.rotationUdeg).toBe(180_000_000);
  });
});

describe('duplicatePlacement', () => {
  it('moves the copy one width along local +x (rotation 0)', () => {
    const s = makeStore();
    s.edit(placeProduct(counter, 'default', c0, 0));
    s.edit(duplicatePlacement('p1'));
    expect(doc(s).placements).toEqual([
      { id: 'p1', productId: 'nhf-c', variantId: 'default', center: c0, rotationUdeg: 0 },
      { id: 'p2', productId: 'nhf-c', variantId: 'default', center: { x: 3_609_600, y: 2_000_000 }, rotationUdeg: 0 },
    ]);
  });

  it('moves the copy along local +x at 90 degrees, with no -0', () => {
    const s = makeStore();
    s.edit(placeProduct(counter, 'default', c0, 90_000_000));
    s.edit(duplicatePlacement('p1'));
    const copy = doc(s).placements[1]!;
    expect(copy.center).toEqual({ x: 3_000_000, y: 2_609_600 });
    expect(Object.is(copy.center.x, 3_000_000)).toBe(true);
    expect(copy.rotationUdeg).toBe(90_000_000);
    expect(copy.productId).toBe('nhf-c');
    expect(copy.variantId).toBe('default');
    expect(doc(s).products).toHaveLength(1);
  });
});

describe('deletePlacement', () => {
  it('removes the placement and keeps the embedded product', () => {
    const s = makeStore();
    s.edit(placeProduct(counter, 'default', c0, 0));
    expect(s.edit(deletePlacement('p1'))).toEqual({ ok: true });
    expect(doc(s).placements).toEqual([]);
    expect(doc(s).products).toEqual([counter]);
  });
});

describe('undo', () => {
  it('every command is exactly one undo step back to the previous document', () => {
    const s = makeStore();
    const steps: Array<(d: DesignDocument) => void> = [
      placeProduct(counter, 'default', c0, 0),
      movePlacement('p1', 100_000, 0),
      setPlacementPose('p1', { rotationUdeg: 45_000_000 }),
      rotatePlacement('p1'),
      duplicatePlacement('p1'),
      deletePlacement('p2'),
    ];
    for (const step of steps) {
      const before = doc(s);
      const beforeText = bytes(s);
      expect(s.edit(step)).toEqual({ ok: true });
      expect(bytes(s)).not.toBe(beforeText);
      expect(s.undo()).toBe(true);
      expect(doc(s)).toEqual(before);
      expect(bytes(s)).toBe(beforeText);
      s.redo();
    }
  });
});
