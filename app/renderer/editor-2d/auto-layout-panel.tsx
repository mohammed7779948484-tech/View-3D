/**
 * Automatic layout for the open room: how many of each catalog product, then Run. The engine runs
 * in a worker (the window never freezes), shows its progress, and can be cancelled. Running changes
 * nothing in the project; the options it finds are offered to pick from.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isPlaceable } from '../../../src/catalog/index';
import type { DesignDocument, Product, Room } from '../../../src/core/index';
import type { LayoutRequest } from '../../../src/layout/index';
import { runLayout } from '../worker/run-layout';
import type { LayoutRun } from '../worker/run-layout';
import { sha256Hex } from '../worker/sha256';

type Status =
  | { kind: 'idle' | 'cancelled' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; sha256: string }
  | { kind: 'failed'; message: string };

/** `room` is the room the options were made for (the document's room when Run was pressed). */
type Props = { products: readonly Product[] | null; document: DesignDocument; onResult: (resultJson: string, room: Room) => void };

export function AutoLayoutPanel({ products, document, onResult }: Props) {
  const { t } = useTranslation();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const current = useRef<LayoutRun | null>(null);
  // Leaving the editor stops a run: its options would be for a room no longer shown.
  useEffect(
    () => () => {
      current.current?.cancel();
      current.current = null;
    },
    [],
  );

  const sizes = (products ?? []).flatMap((product) => {
    const variants = product.variants.filter((v) => isPlaceable(product, v.id));
    return variants.map((v) => ({
      key: `${product.id}/${v.id}`,
      product,
      variantId: v.id,
      label: variants.length === 1 ? t('autoLayout.quantity', { name: product.name }) : t('autoLayout.quantityVariant', { name: product.name, size: v.label }),
    }));
  });
  const count = (key: string): number => {
    const n = Number(quantities[key] ?? '');
    return Number.isInteger(n) && n > 0 ? n : 0;
  };

  function run(): void {
    const request: LayoutRequest = {
      id: document.id,
      name: document.name,
      room: document.room,
      items: sizes.filter((s) => count(s.key) > 0).map((s) => ({ product: s.product, variantId: s.variantId, quantity: count(s.key) })),
    };
    setStatus({ kind: 'running', done: 0, total: 1 });
    const started = runLayout(request, (done, total) => {
      if (current.current === started) setStatus({ kind: 'running', done, total });
    });
    current.current = started;
    started.result.then(
      async (text) => {
        if (current.current !== started) return;
        current.current = null;
        setStatus({ kind: 'done', sha256: await sha256Hex(text) });
        onResult(text, request.room);
      },
      (error: unknown) => {
        if (current.current !== started) return;
        current.current = null;
        setStatus({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
      },
    );
  }

  function cancel(): void {
    current.current?.cancel();
    current.current = null;
    setStatus({ kind: 'cancelled' });
  }

  const running = status.kind === 'running';
  return (
    <section className="panel" data-auto-layout={status.kind} {...(status.kind === 'done' ? { 'data-result-sha256': status.sha256 } : {})}>
      <h2>{t('autoLayout.title')}</h2>
      <p className="hint">{t('autoLayout.hint')}</p>
      <ul className="items">
        {sizes.map((s) => (
          <li key={s.key}>
            <label className="quantity">
              <span>{s.label}</span>
              <input
                type="number"
                min={0}
                step={1}
                dir="ltr"
                value={quantities[s.key] ?? ''}
                disabled={running}
                onChange={(e) => {
                  const value = e.currentTarget.value; // read now: the event is reused after this handler
                  setQuantities((q) => ({ ...q, [s.key]: value }));
                }}
              />
            </label>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" className="primary" disabled={running} onClick={run}>
          {t('autoLayout.run')}
        </button>
        {running && (
          <button type="button" onClick={cancel}>
            {t('autoLayout.cancel')}
          </button>
        )}
      </div>
      {running && <progress aria-label={t('autoLayout.progress')} value={status.done} max={status.total} aria-valuenow={status.done} aria-valuemax={status.total} />}
      {status.kind === 'cancelled' && <p className="status">{t('autoLayout.cancelled')}</p>}
      {status.kind === 'failed' && <p role="alert">{t('autoLayout.failed', { message: status.message })}</p>}
    </section>
  );
}
