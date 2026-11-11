/** The catalog products that can be placed (every size known), one button per size; then a click on the plan places it. */
import { useTranslation } from 'react-i18next';
import { isPlaceable } from '../../../src/catalog/index';
import type { Product } from '../../../src/core/index';

export type Picked = { product: Product; variantId: string };
type Props = { products: readonly Product[] | null; picked: Picked | null; onPick: (picked: Picked | null) => void };

export function FixturesPanel({ products, picked, onPick }: Props) {
  const { t } = useTranslation();
  const placeable = (products ?? []).flatMap((product) => {
    const variants = product.variants.filter((v) => isPlaceable(product, v.id));
    return variants.map((v) => ({
      product,
      variantId: v.id,
      label: variants.length === 1 ? t('fixtures.place', { name: product.name }) : t('fixtures.placeVariant', { name: product.name, size: v.label }),
    }));
  });
  return (
    <section className="panel">
      <h2>{t('fixtures.title')}</h2>
      {products === null && <p className="hint">{t('fixtures.noCatalog')}</p>}
      {picked !== null ? (
        <p className="status">
          {t('fixtures.clickToPlace', { name: picked.product.name })}{' '}
          <button type="button" className="quiet" onClick={() => onPick(null)}>
            {t('fixtures.cancel')}
          </button>
        </p>
      ) : (
        <ul className="items">
          {placeable.map((p) => (
            <li key={`${p.product.id}/${p.variantId}`}>
              <button type="button" onClick={() => onPick({ product: p.product, variantId: p.variantId })}>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
