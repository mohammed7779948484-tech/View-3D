/** Catalog: the real seed data and small helpers for reading products. */
import { toUm } from '../core/index';
import type { Product, Variant } from '../core/index';

export { seedProducts } from './seed';

/**
 * A unit is "tall" when it is higher than this: 1372 mm (54 in), in um.
 * Tall units block the view across the shop. This threshold is OUR OWN RULE, to be confirmed by
 * the owner. The comparison is strictly greater, so a gondola of exactly 54 in is NOT tall.
 */
export const TALL_THRESHOLD_UM = toUm(1372, 'mm');

/** Finds a product by id, or undefined. */
export function findProduct(products: readonly Product[], productId: string): Product | undefined {
  return products.find((product) => product.id === productId);
}

/**
 * True when the variant exists and its width, depth and height are all known.
 * A variant with any unknown dimension can never be placed in a room.
 */
export function isPlaceable(product: Product, variantId: string): boolean {
  const variant = product.variants.find((v) => v.id === variantId);
  if (variant === undefined) return false;
  return variant.widthUm !== null && variant.depthUm !== null && variant.heightUm !== null;
}

/** True when the variant's height is known and strictly greater than `TALL_THRESHOLD_UM`. */
export function isTall(variant: Variant): boolean {
  return variant.heightUm !== null && variant.heightUm > TALL_THRESHOLD_UM;
}
