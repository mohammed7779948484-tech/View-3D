/**
 * Every change to a fixture, as one immer recipe for `documentStore.edit`: one undo step each.
 * The 2D plan and the 3D view call these same commands, so the same action gives the same document.
 */
import { current } from 'immer';
import type { DesignDocument, Placement, Point, Product } from '../../../src/core/index';
import { defaultConfig, footprint, placedFixtures, quarterTurn, snapBackToBack, snapToWall } from '../../../src/rules/index';

type Recipe = (draft: DesignDocument) => void;

/** The smallest unused id `p1`, `p2`, ... */
export function nextPlacementId(document: DesignDocument): string {
  const used = new Set(document.placements.map((p) => p.id));
  for (let n = 1; ; n++) if (!used.has(`p${n}`)) return `p${n}`;
}

const find = (draft: DesignDocument, id: string): Placement | undefined => draft.placements.find((p) => p.id === id);
/** Whole micrometres, never -0. */
const whole = (v: number): number => Math.round(v) || 0;

/** Places a catalog product; the document embeds its own copy the first time. The schema refuses an unknown size. */
export const placeProduct =
  (product: Product, variantId: string, center: Point, rotationUdeg: number): Recipe =>
  (draft) => {
    if (!draft.products.some((p) => p.id === product.id)) draft.products.push(structuredClone(product));
    draft.placements.push({ id: nextPlacementId(draft), productId: product.id, variantId, center: { ...center }, rotationUdeg });
  };

export const movePlacement =
  (id: string, dxUm: number, dyUm: number): Recipe =>
  (draft) => {
    const p = find(draft, id);
    if (p !== undefined) p.center = { x: p.center.x + dxUm, y: p.center.y + dyUm };
  };

export const setPlacementPose =
  (id: string, pose: { center?: Point; rotationUdeg?: number }): Recipe =>
  (draft) => {
    const p = find(draft, id);
    if (p === undefined) return;
    if (pose.center !== undefined) p.center = { ...pose.center };
    if (pose.rotationUdeg !== undefined) p.rotationUdeg = pose.rotationUdeg;
  };

/** A quarter turn, lined up with the nearest wall (`quarterTurn`). */
export const rotatePlacement =
  (id: string): Recipe =>
  (draft) => {
    const p = find(draft, id);
    if (p !== undefined) p.rotationUdeg = quarterTurn(draft.room, p.center, p.rotationUdeg);
  };

/** A copy standing beside the original, along its local +x (its width further on). */
export const duplicatePlacement =
  (id: string): Recipe =>
  (draft) => {
    const p = find(draft, id);
    const width = draft.products.find((q) => q.id === p?.productId)?.variants.find((v) => v.id === p?.variantId)?.widthUm;
    if (p === undefined || width === undefined || width === null) return;
    const angle = (p.rotationUdeg / 1_000_000) * (Math.PI / 180);
    draft.placements.push({
      id: nextPlacementId(draft),
      productId: p.productId,
      variantId: p.variantId,
      center: { x: whole(p.center.x + width * Math.cos(angle)), y: whole(p.center.y + width * Math.sin(angle)) },
      rotationUdeg: p.rotationUdeg,
    });
  };

/** Removes the fixture; its product stays embedded (it costs nothing and keeps the file self-contained). */
export const deletePlacement =
  (id: string): Recipe =>
  (draft) => {
    draft.placements = draft.placements.filter((p) => p.id !== id);
  };

/**
 * A single-sided unit (product placement 'wall') lands flush on the nearest wall within the snap
 * distance, sliding off doors; failing that, back to back with another single-sided unit. Other
 * fixtures stay where they were put. Applied in the same edit as the move, so it is one undo step.
 */
export const snapPlacement =
  (id: string): Recipe =>
  (draft) => {
    const p = find(draft, id);
    const product = draft.products.find((q) => q.id === p?.productId);
    const variant = product?.variants.find((v) => v.id === p?.variantId);
    if (p === undefined || product?.placement !== 'wall' || variant === undefined || variant.widthUm === null || variant.depthUm === null) return;
    const rect = footprint(p, variant);
    const onWall = snapToWall(draft.room, rect, defaultConfig);
    const others = onWall === null ? placedFixtures(current(draft), defaultConfig).filter((f) => f.placement.id !== id) : [];
    const pose = onWall ?? snapBackToBack(rect, others, defaultConfig);
    if (pose === null) return;
    p.center = { ...pose.center };
    p.rotationUdeg = pose.rotationUdeg;
  };

/** Several recipes as one edit (one undo step). */
export const together =
  (...recipes: Recipe[]): Recipe =>
  (draft) => {
    for (const recipe of recipes) recipe(draft);
  };

/**
 * Takes an automatic layout option: its placements replace the document's, and every product they
 * use is embedded as the option's copy (the one the engine laid out, which may be newer than the
 * document's). Other embedded products, the room, id and name stay. One undo step.
 */
export const useLayoutOption =
  (option: { document: DesignDocument }): Recipe =>
  (draft) => {
    draft.placements = structuredClone(option.document.placements);
    const used = new Set(option.document.placements.map((p) => p.productId));
    for (const product of option.document.products) {
      if (!used.has(product.id)) continue;
      const at = draft.products.findIndex((p) => p.id === product.id);
      if (at === -1) draft.products.push(structuredClone(product));
      else draft.products[at] = structuredClone(product);
    }
  };
