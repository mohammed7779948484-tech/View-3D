import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseLength } from '../../../src/core/index';
import type { DisplayUnit, Point } from '../../../src/core/index';
import { validateRoomOutline } from '../../../src/geometry/index';
import { normalizeOutline } from '../../../src/rules/index';
import { typedUnit } from './length-field';
import { Plan } from './plan';

type Props = { unit: DisplayUnit; onCreate: (outline: Point[], ceilingHeightUm: number) => void; onBack: () => void };

/** A fixed sketch area, 20 m x 15 m with a 2 m margin, so the view never moves while drawing. */
const SKETCH_VIEW = { x: -2000, y: -17000, width: 24000, height: 19000 };

/** "Draw the room": click the corners on a 100 mm grid, then type exact lengths on the plan. */
export function DrawRoom({ unit, onCreate, onBack }: Props) {
  const { t } = useTranslation();
  const [corners, setCorners] = useState<Point[]>([]);
  const [ceiling, setCeiling] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const ceilingRead = parseLength(ceiling, typedUnit(unit));

  function finish(): void {
    if (!ceilingRead.ok) return;
    const outline = normalizeOutline(corners);
    if (validateRoomOutline(outline).length > 0) return setProblem(t('draw.notARoom'));
    onCreate(outline, ceilingRead.um);
  }

  return (
    <div className="workspace">
      <section className="panel">
        <h2>{t('draw.title')}</h2>
        <p className="hint">{t('draw.hint')}</p>
        <div className="field">
          <label htmlFor="draw-ceiling">{t('room.ceiling')}</label>
          <input id="draw-ceiling" value={ceiling} dir="ltr" onChange={(e) => setCeiling(e.currentTarget.value)} />
          {ceiling.trim() !== '' && !ceilingRead.ok && <p className="field-error">{ceilingRead.message}</p>}
        </div>
        {problem !== null && <p role="alert">{problem}</p>}
        <div className="actions">
          <button type="button" className="primary" disabled={corners.length < 3 || !ceilingRead.ok} onClick={finish}>
            {t('draw.finish')}
          </button>
          <button type="button" disabled={corners.length === 0} onClick={() => setCorners((c) => c.slice(0, -1))}>
            {t('draw.undoCorner')}
          </button>
          <button type="button" className="quiet" onClick={onBack}>
            {t('common.back')}
          </button>
        </div>
      </section>
      <Plan outline={corners} closed={false} unit={unit} view={SKETCH_VIEW} onPlanClick={(p) => setCorners((c) => [...c, p])} />
    </div>
  );
}
