/** The catalog's products, read from the catalog file when the screen opens; null until read or when unreadable. */
import { useEffect, useState } from 'react';
import { parseCatalog } from '../../../src/catalog/index';
import type { Product } from '../../../src/core/index';
import { bridge } from '../storage/bridge';

export function useCatalogProducts(): Product[] | null {
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
  }, []);
  return products;
}
