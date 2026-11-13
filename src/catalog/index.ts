/** Catalog: the real seed data and small helpers for reading products. */
import type { Product } from '../core/index';

export { seedProducts } from './seed';
export * from './catalog-file';

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
