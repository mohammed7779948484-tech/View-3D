/** The ranked options of the last automatic layout: score explained, what did not fit, and Use. */
import { useTranslation } from 'react-i18next';
import type { LayoutOption, LayoutResult } from '../../../src/layout/index';
import type { Room } from '../../../src/core/index';
import { problemText, unplacedText } from '../i18n/messages';

type Props = { result: LayoutResult; room: Room; onShow: (option: LayoutOption) => void; onUse: (option: LayoutOption) => void };

export function OptionPicker({ result, room, onShow, onUse }: Props) {
  const { t } = useTranslation();
  // A term the strings do not know yet is shown as the engine names it.
  const term = (name: string): string => t(`options.terms.${name}`, { defaultValue: name });
  return (
    <section className="panel options">
      <h2>{t('options.title')}</h2>
      {result.problems.length > 0 && (
        <div role="alert">
          <p>{t('options.roomProblems')}</p>
          <ul>
            {result.problems.map((p) => (
              <li key={`${p.code}${p.index ?? ''}${p.openingId ?? ''}${p.columnId ?? ''}`}>{problemText(t, room, p)}</li>
            ))}
          </ul>
        </div>
      )}
      {result.problems.length === 0 && result.options.length === 0 && <p className="hint">{t('options.none')}</p>}
      {result.options.map((option) => (
        <article key={option.rank} className="option" data-option={option.rank}>
          <h3>
            {t('options.option', { rank: option.rank })} <span dir="ltr">{t('options.score', { score: option.score.toFixed(1) })}</span>
          </h3>
          <ul className="items">
            {option.scoreBreakdown.map((s) => (
              <li key={s.term}>
                <span>{term(s.term)}</span>{' '}
                <span dir="ltr">
                  {s.points.toFixed(1)} / {s.weight}
                </span>{' '}
                <span className="hint" lang="en" dir="ltr">
                  {s.note}
                </span>
              </li>
            ))}
          </ul>
          {option.unplaced.length > 0 && (
            <>
              <h4>{t('options.didNotFit')}</h4>
              <ul>
                {option.unplaced.map((u) => (
                  <li key={`${u.productId}/${u.variantId}`}>
                    {t('options.unplacedItem', { name: u.name, quantity: u.quantity })}: {unplacedText(t, u)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="actions">
            <button type="button" onClick={() => onShow(option)}>
              {t('options.show', { rank: option.rank })}
            </button>
            <button type="button" onClick={() => onUse(option)}>
              {t('options.use', { rank: option.rank })}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
