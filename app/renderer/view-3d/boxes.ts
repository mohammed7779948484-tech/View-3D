/**
 * The 3D view is a pure function of the document: one exact-size box per placement. A placement
 * whose size is unknown cannot exist (the schema refuses it), so every box has a real size.
 */
import type { DesignDocument, Product } from '../../../src/core/index';
import { planToScene, rotationToYaw, umToScene } from './units';

export type SceneBox = {
  id: string;
  category: Product['category'];
  /** Metres, scene axes; y is half the height (the box stands on the floor). */
  center: [number, number, number];
  /** Width (scene x before turning), height (y), depth (scene z before turning), metres. */
  size: [number, number, number];
  yawRad: number;
};

export function sceneBoxes(document: DesignDocument): SceneBox[] {
  return document.placements.map((placement) => {
    const product = document.products.find((p) => p.id === placement.productId);
    const variant = product?.variants.find((v) => v.id === placement.variantId);
    if (product === undefined || variant === undefined || variant.widthUm === null || variant.depthUm === null || variant.heightUm === null) {
      throw new Error(`sceneBoxes: placement "${placement.id}" has no known size; the schema should have refused it`);
    }
    const at = planToScene(placement.center);
    const height = umToScene(variant.heightUm);
    return {
      id: placement.id,
      category: product.category,
      center: [at.x, height / 2, at.z],
      size: [umToScene(variant.widthUm), height, umToScene(variant.depthUm)],
      yawRad: rotationToYaw(placement.rotationUdeg),
    };
  });
}
