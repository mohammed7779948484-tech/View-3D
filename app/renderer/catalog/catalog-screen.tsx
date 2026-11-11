/**
 * The owner's catalog: the products he sells, from `catalog.json` on this laptop. Website products
 * stay unverified until he confirms them; a product with an unknown size is listed but never placeable.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addProduct, confirmProduct, isPlaceable, parseCatalog, removeProduct, serializeCatalog, updateProduct } from '../../../src/catalog/index';
import type { Catalog, CatalogResult } from '../../../src/catalog/index';
import type { DisplayUnit, Product } from '../../../src/core/index';
import { bridge } from '../storage/bridge';
import { ProductForm } from './product-form';

type Editing = { product: Product | null } | null;

const sizeKnown = (p: Product): boolean => p.variants.every((v) => isPlaceable(p, v.id));
const dollars = (cents: number): string => (cents / 100).toFixed(2);

export function CatalogScreen({ unit, onBack }: { unit: DisplayUnit; onBack: () => void }) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    void bridge()
      .loadCatalog()
      .then((loaded) => {
        if (loaded.status === 'failed') return setProblem(t('catalog.unreadable', { message: loaded.message }));
        const parsed = parseCatalog(loaded.text);
        if (parsed.ok) setCatalog(parsed.catalog);
        else setProblem(t('catalog.unreadable', { message: parsed.errors[0] ?? parsed.code }));
      });
  }, [t]);

  /** Writes the new catalog; the screen shows it only once it is on disk. */
  async function commit(result: CatalogResult): Promise<boolean> {
    if (!result.ok) {
      setProblem(t(`catalog.errors.${result.code}`));
      return false;
    }
    const saved = await bridge().saveCatalog(serializeCatalog(result.catalog));
    if (saved.status === 'failed') {
      setProblem(t('catalog.notSaved', { message: saved.message }));
      return false;
    }
    setProblem(null);
    setCatalog(result.catalog);
    return true;
  }

  return (
    <section className="catalog">
      <h2>{t('catalog.title')}</h2>
      <p className="hint">{t('catalog.intro')}</p>
      <div className="actions">
        <button type="button" className="primary" disabled={catalog === null || editing !== null} onClick={() => setEditing({ product: null })}>
          {t('catalog.add')}
        </button>
        <button type="button" onClick={onBack}>
          {t('catalog.back')}
        </button>
      </div>
      {problem !== null && <p role="alert">{problem}</p>}
      {catalog !== null && editing !== null && (
        <ProductForm
          initial={editing.product}
          existingIds={catalog.products.map((p) => p.id)}
          unit={unit}
          onCancel={() => setEditing(null)}
          onSave={(product) =>
            void commit(editing.product === null ? addProduct(catalog, product) : updateProduct(catalog, product)).then((ok) => {
              if (ok) setEditing(null);
            })
          }
        />
      )}
      {catalog !== null && (
        <ul className="products">
          {catalog.products.map((p) => (
            <li key={p.id} data-product={p.id} data-verification={p.verification} className="product">
              <div>
                <strong>{p.name}</strong> <span className={`badge ${p.verification}`}>{t(`catalog.verification.${p.verification}`)}</span>
                <div dir="ltr" className="sizes">
                  {p.variants.map((v) => v.label).join(' · ')}
                </div>
                {!sizeKnown(p) && <div className="unknown">{t('catalog.unknownSize')}</div>}
                <div>{p.priceCents === null ? t('catalog.priceUnknown') : <span dir="ltr">$ {dollars(p.priceCents)}</span>}</div>
              </div>
              <div className="actions">
                <button type="button" aria-label={t('catalog.editOf', { name: p.name })} disabled={editing !== null} onClick={() => setEditing({ product: p })}>
                  {t('catalog.edit')}
                </button>
                {p.verification === 'unverified' && (
                  <button type="button" aria-label={t('catalog.confirmOf', { name: p.name })} onClick={() => void commit(confirmProduct(catalog, p.id))}>
                    {t('catalog.confirm')}
                  </button>
                )}
                {removing === p.id ? (
                  <>
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        void commit(removeProduct(catalog, p.id)).then(() => {
                          setRemoving(null);
                        })
                      }
                    >
                      {t('catalog.yesRemove')}
                    </button>
                    <button type="button" onClick={() => setRemoving(null)}>
                      {t('catalog.keep')}
                    </button>
                  </>
                ) : (
                  <button type="button" aria-label={t('catalog.removeOf', { name: p.name })} onClick={() => setRemoving(p.id)}>
                    {t('catalog.remove')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
