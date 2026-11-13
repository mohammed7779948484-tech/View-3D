/**
 * The catalog's products, read from the catalog file at start and again whenever `version` changes
 * (after the catalog screen saved); null until read or when unreadable.
 */
import { useEffect, useState } from 'react';
import { parseCatalog } from '../../../src/catalog/index';
import type { Product } from '../../../src/core/index';
import { bridge } from '../storage/bridge';

export function useCatalogProducts(version: number): Product[] | null {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    let live = true;
    void bridge()
      .loadCatalog()
      .then((loaded) => {
        const parsed = loaded.status === 'loaded' ? parseCatalog(loaded.text) : null;
        if (live && parsed?.ok === true) setProducts(parsed.catalog.products);
      });
    return () => {
      live = false;
    };
  }, [version]);
  return products;
}
