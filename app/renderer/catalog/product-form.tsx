/**
 * Add or edit one product: name, kind, where it stands, one row of sizes per variant, price.
 * An empty size or price stays unknown; nothing is filled in for the owner.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FLAG_CLEARANCES, ownerProduct } from '../../../src/catalog/index';
import { fromUm, parseLength } from '../../../src/core/index';
import type { DisplayUnit, Entered, Product } from '../../../src/core/index';
import { typedUnit } from '../editor-2d/length-field';
import { lengthInputText } from '../i18n/messages';

const CATEGORIES: Product['category'][] = ['showcase', 'counter', 'gondola', 'tower', 'slatwall', 'accessory'];
const PLACEMENTS: Product['placement'][] = ['wall', 'island', 'freestanding', 'counter'];
const SIDES = ['width', 'depth', 'height'] as const;
type Side = (typeof SIDES)[number];
type SizeRow = { id: string } & Record<Side, string>;

/** "700" -> 70000 cents, "12.5" -> 1250, "" -> null; anything else is not a price. */
export function parsePriceCents(text: string): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (m === null) return 'invalid';
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}
const priceText = (cents: number | null): string => (cents === null ? '' : String(cents / 100));

/** The smallest unused `owner-<n>` id. */
export function nextOwnerId(ids: readonly string[]): string {
  for (let n = 1; ; n++) if (!ids.includes(`owner-${n}`)) return `owner-${n}`;
}

function sizeText(entered: Entered | null | undefined, um: number | null): string {
  if (entered !== null && entered !== undefined) return `${entered.value} ${entered.unit}`;
  return um === null ? '' : `${fromUm(um, 'mm')} mm`;
}

type Props = { initial: Product | null; existingIds: readonly string[]; unit: DisplayUnit; onSave: (product: Product) => void; onCancel: () => void };

export function ProductForm({ initial, existingIds, unit, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<Product['category']>(initial?.category ?? 'showcase');
  const [placement, setPlacement] = useState<Product['placement']>(initial?.placement ?? 'freestanding');
  const [price, setPrice] = useState(priceText(initial?.priceCents ?? null));
  const [servedFrom, setServedFrom] = useState<'front' | 'rear'>(initial?.serviceSide ?? 'front');
  const [sizes, setSizes] = useState<SizeRow[]>(
    initial?.variants.map((v) => ({
      id: v.id,
      width: sizeText(v.entered?.width, v.widthUm),
      depth: sizeText(v.entered?.depth, v.depthUm),
      height: sizeText(v.entered?.height, v.heightUm),
    })) ?? [{ id: 'default', width: '', depth: '', height: '' }],
  );
  const [errors, setErrors] = useState<string[]>([]);

  const sideLabel = (side: Side, row: number): string => (row === 0 ? t(`catalog.${side}`) : t(`catalog.${side}Of`, { n: row + 1 }));

  function save(): void {
    const problems: string[] = [];
    const read = (text: string, label: string): Entered | null => {
      if (text.trim() === '') return null;
      const r = parseLength(text, typedUnit(unit));
      if (!r.ok) problems.push(`${label}: ${lengthInputText(t, r.code)}`);
      return r.ok ? r.entered : null;
    };
    const variants = sizes.map((s, row) => ({
      id: s.id,
      width: read(s.width, sideLabel('width', row)),
      depth: read(s.depth, sideLabel('depth', row)),
      height: read(s.height, sideLabel('height', row)),
    }));
    const cents = parsePriceCents(price);
    if (cents === 'invalid') problems.push(t('catalog.badPrice'));
    if (name.trim() === '') problems.push(t('catalog.noName'));
    if (problems.length > 0 || cents === 'invalid') return setErrors(problems);
    const made = ownerProduct({ id: initial?.id ?? nextOwnerId(existingIds), name, category, placement, variants, priceCents: cents, serviceSide: servedFrom });
    if (!made.ok) return setErrors(made.errors);
    // Editing keeps where the data came from and the open doubts; the owner's own sizes make it his.
    onSave(initial === null ? made.product : { ...made.product, source: initial.source, flags: initial.flags.length > 0 ? initial.flags : [FLAG_CLEARANCES], clearances: initial.clearances });
  }

  const setSize = (row: number, side: Side, value: string): void => setSizes((all) => all.map((s, i) => (i === row ? { ...s, [side]: value } : s)));
  const addSize = (): void =>
    setSizes((all) => {
      let n = all.length + 1;
      while (all.some((s) => s.id === `size-${n}`)) n++;
      return [...all, { id: `size-${n}`, width: '', depth: '', height: '' }];
    });

  return (
    <form
      className="product-form item-form"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h3>{initial === null ? t('catalog.addTitle') : t('catalog.editTitle', { name: initial.name })}</h3>
      <div className="field">
        <label htmlFor="product-name">{t('catalog.name')}</label>
        <input id="product-name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
      </div>
      <div className="field">
        <label htmlFor="product-category">{t('catalog.category')}</label>
        <select id="product-category" value={category} onChange={(e) => setCategory(e.currentTarget.value as Product['category'])}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`catalog.categories.${c}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="product-placement">{t('catalog.placement')}</label>
        <select id="product-placement" value={placement} onChange={(e) => setPlacement(e.currentTarget.value as Product['placement'])}>
          {PLACEMENTS.map((p) => (
            <option key={p} value={p}>
              {t(`catalog.placements.${p}`)}
            </option>
          ))}
        </select>
      </div>
      {placement === 'freestanding' && (
        <div className="field">
          <label htmlFor="product-served-from">{t('catalog.servedFrom')}</label>
          <select id="product-served-from" value={servedFrom} onChange={(e) => setServedFrom(e.currentTarget.value as 'front' | 'rear')}>
            <option value="front">{t('catalog.servedFromOptions.front')}</option>
            <option value="rear">{t('catalog.servedFromOptions.rear')}</option>
          </select>
        </div>
      )}
      <p className="hint">{t('catalog.sizesHint')}</p>
      {sizes.map((s, row) => (
        <fieldset key={s.id} className="size-row">
          {SIDES.map((side) => (
            <div className="field" key={side}>
              <label htmlFor={`size-${row}-${side}`}>{sideLabel(side, row)}</label>
              <input id={`size-${row}-${side}`} dir="ltr" value={s[side]} onChange={(e) => setSize(row, side, e.currentTarget.value)} />
            </div>
          ))}
          {sizes.length > 1 && (
            <button type="button" className="quiet" onClick={() => setSizes((all) => all.filter((_, i) => i !== row))}>
              {t('catalog.removeSize', { n: row + 1 })}
            </button>
          )}
        </fieldset>
      ))}
      <button type="button" className="quiet" onClick={addSize}>
        {t('catalog.addSize')}
      </button>
      <div className="field">
        <label htmlFor="product-price">{t('catalog.price')}</label>
        <input id="product-price" dir="ltr" value={price} onChange={(e) => setPrice(e.currentTarget.value)} />
      </div>
      {errors.length > 0 && (
        <ul role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" className="primary">
          {t('catalog.save')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('catalog.cancel')}
        </button>
      </div>
    </form>
  );
}
