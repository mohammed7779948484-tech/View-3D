/** The catalog products that can be placed (every size known), one button per size; then a click on the plan places it. */
import { useTranslation } from 'react-i18next';
import { isPlaceable } from '../../../src/catalog/index';
import type { Product } from '../../../src/core/index';

export type Picked = { product: Product; variantId: string };
type Props = { products: readonly Product[] | null; picked: Picked | null; onPick: (picked: Picked | null) => void };

const NAME = '\u0001';
const SIZE = '\u0002';

/** The translated sentence with the product name and size each in a <bdi>, so Latin names and numbers keep their order in Arabic. */
function Isolated({ text, name, size }: { text: string; name: string; size: string | null }) {
  return (
    <>
      {text.split(/(\u0001|\u0002)/).map((part, i) =>
        part === NAME ? <bdi key={i}>{name}</bdi> : part === SIZE ? <bdi key={i}>{size}</bdi> : part,
      )}
    </>
  );
}

export function FixturesPanel({ products, picked, onPick }: Props) {
  const { t } = useTranslation();
  const placeable = (products ?? []).flatMap((product) => {
    const variants = product.variants.filter((v) => isPlaceable(product, v.id));
    return variants.map((v) => ({ product, variantId: v.id, size: variants.length === 1 ? null : v.label }));
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
                <Isolated text={p.size === null ? t('fixtures.place', { name: NAME }) : t('fixtures.placeVariant', { name: NAME, size: SIZE })} name={p.product.name} size={p.size} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
