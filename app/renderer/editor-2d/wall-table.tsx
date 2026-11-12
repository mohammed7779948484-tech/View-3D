import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkClosure, checkDiagonal, sanityWarnings, suspectsMatchingDiagonal, wallsToOutline } from '../../../src/capture/index';
import type { CapturedWall, Diagonal, Suspect } from '../../../src/capture/index';
import { formatAngle, formatDisplayLength, parseAngle, parseLength } from '../../../src/core/index';
import type { DisplayUnit, Point } from '../../../src/core/index';
import { validateRoomOutline } from '../../../src/geometry/index';
import { viewBoxAround } from './geometry';
import { angleInputText, captureProblemText, lengthInputText, warningText } from '../i18n/messages';
import { typedUnit } from './length-field';
import { Plan } from './plan';

/** Space around the room on the preview, mm. */
const PREVIEW_MARGIN_MM = 1500;

type Row = { length: string; angle: string };
/** `start` prefills the table (editing an open room); `submitLabel` names the button. */
type Props = {
  unit: DisplayUnit;
  onCreate: (outline: Point[], ceilingHeightUm: number) => void;
  onBack: () => void;
  start?: { rows: Row[]; ceiling: string };
  submitLabel?: string;
};

const FIRST_ROWS = 4;
/** A new wall: no length yet, and an ordinary corner (90) at its end, the usual case. */
const emptyRow = (): Row => ({ length: '', angle: '90' });

/** "Type the walls": each wall's length and end angle, checked as the owner types. */
export function WallTable({ unit, onCreate, onBack, start, submitLabel }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>(() => start?.rows ?? Array.from({ length: FIRST_ROWS }, emptyRow));
  const [ceiling, setCeiling] = useState(start?.ceiling ?? '');
  const [diagonal, setDiagonal] = useState({ from: '', to: '', length: '' });

  const lengths = rows.map((r) => (r.length.trim() === '' ? null : parseLength(r.length, typedUnit(unit))));
  const angles = rows.map((r) => (r.angle.trim() === '' ? null : parseAngle(r.angle)));
  const ceilingRead = ceiling.trim() === '' ? null : parseLength(ceiling, typedUnit(unit));
  const walls: CapturedWall[] | null = lengths.every((l) => l?.ok) && angles.every((a) => a?.ok)
    ? rows.map((_, i) => {
        const l = lengths[i]!;
        const a = angles[i]!;
        return { lengthUm: l.ok ? l.um : 0, cornerAngleUdeg: a.ok ? a.udeg : 0 };
      })
    : null;
  const drawn = walls === null ? null : wallsToOutline(walls);
  const closure = drawn?.ok === true && walls !== null ? checkClosure(walls) : null;
  const warnings = drawn?.ok === true && walls !== null ? sanityWarnings(walls) : [];

  // Corners are numbered from 1 to the number of walls; anything else is not a corner.
  const corner = (text: string): number | null => (/^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= rows.length ? Number(text) - 1 : null);
  const diagonalRead = parseLength(diagonal.length, typedUnit(unit));
  const from = corner(diagonal.from);
  const to = corner(diagonal.to);
  const measured: Diagonal | null =
    diagonalRead.ok && from !== null && to !== null && from !== to && from < rows.length && to < rows.length
      ? { fromCorner: from, toCorner: to, measuredUm: diagonalRead.um }
      : null;
  let suspects: Suspect[] = closure?.suspects ?? [];
  if (measured !== null && walls !== null && closure !== null && !closure.closes) suspects = suspectsMatchingDiagonal(walls, suspects, measured);
  const diagonalCheck = measured !== null && closure?.closes === true && drawn?.ok === true ? checkDiagonal(drawn.outline, measured) : null;

  const outlineOk = drawn?.ok === true && validateRoomOutline(drawn.outline).length === 0;
  const canCreate = closure?.closes === true && outlineOk && ceilingRead?.ok === true;

  const setRow = (i: number, change: Partial<Row>): void => setRows((all) => all.map((r, k) => (k === i ? { ...r, ...change } : r)));
  function useSuspect(s: Suspect): void {
    if (s.kind === 'wall-length') setRow(s.wallIndex, { length: formatDisplayLength(s.correctedLengthUm, unit) });
    else setRow(s.cornerIndex, { angle: formatAngle(s.correctedAngleUdeg) });
  }

  let status = t('walls.incomplete');
  if (closure?.closes === true) {
    // Within tolerance the last wall is drawn from the corners, not from its typed length: say so.
    status = closure.gapUm === 0 && closure.angleSumErrorUdeg === 0 ? t('walls.closes') : t('walls.closesWithin', { gap: formatDisplayLength(closure.gapUm, unit) });
  }
  else if (closure !== null) status = t('walls.open', { gap: formatDisplayLength(closure.gapUm, unit) });
  else if (drawn?.ok === false) status = drawn.problems.map((p) => captureProblemText(t, p)).join(' ');

  return (
    <div className="workspace">
    <section className="panel">
      <h2>{t('walls.title')}</h2>
      <p className="hint">{t('walls.hint')}</p>
      <Field label={t('room.ceiling')} value={ceiling} onChange={setCeiling} error={ceilingRead?.ok === false ? lengthInputText(t, ceilingRead.code) : null} />
      <ol className="wall-rows">
        {rows.map((row, i) => {
          const l = lengths[i];
          const a = angles[i];
          return (
            <li key={i} className="wall-row">
              <Field label={t('walls.length', { n: i + 1 })} value={row.length} onChange={(v) => setRow(i, { length: v })} error={l?.ok === false ? lengthInputText(t, l.code) : null} />
              <Field label={t('walls.angle', { n: i + 1 })} value={row.angle} onChange={(v) => setRow(i, { angle: v })} error={a?.ok === false ? angleInputText(t, a.code) : null} />
              {rows.length > 3 && (
                <button type="button" className="quiet" onClick={() => setRows((all) => all.filter((_, k) => k !== i))}>
                  {t('walls.remove', { n: i + 1 })}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={() => setRows((all) => [...all, emptyRow()])}>
        {t('walls.add')}
      </button>
      <p role="status" className={closure?.closes === true ? 'status ok' : 'status'}>
        {status}
      </p>
      {suspects.length > 0 && (
        <div className="suspects">
          <p>{t('walls.suspects')}</p>
          {suspects.map((s) => (
            <button type="button" key={s.kind === 'wall-length' ? `w${s.wallIndex}` : `c${s.cornerIndex}`} onClick={() => useSuspect(s)}>
              {s.kind === 'wall-length'
                ? t('walls.useLength', { value: formatDisplayLength(s.correctedLengthUm, unit), n: s.wallIndex + 1 })
                : t('walls.useAngle', { value: formatAngle(s.correctedAngleUdeg), n: s.cornerIndex + 1 })}
            </button>
          ))}
        </div>
      )}
      <fieldset className="diagonal">
        <legend>{t('walls.diagonal')}</legend>
        <Field label={t('walls.diagonalFrom')} value={diagonal.from} onChange={(v) => setDiagonal((d) => ({ ...d, from: v }))} error={null} />
        <Field label={t('walls.diagonalTo')} value={diagonal.to} onChange={(v) => setDiagonal((d) => ({ ...d, to: v }))} error={null} />
        <Field label={t('walls.diagonalLength')} value={diagonal.length} onChange={(v) => setDiagonal((d) => ({ ...d, length: v }))} error={null} />
        {diagonalCheck !== null && (
          <p className={diagonalCheck.ok ? 'status ok' : 'status'}>
            {diagonalCheck.ok ? t('walls.diagonalOk') : t('walls.diagonalOff', { difference: formatDisplayLength(diagonalCheck.differenceUm, unit) })}
          </p>
        )}
      </fieldset>
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={`${w.code}${w.index}`}>{warningText(t, w)}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="button" className="primary" disabled={!canCreate} onClick={() => drawn?.ok && ceilingRead?.ok && onCreate(drawn.outline, ceilingRead.um)}>
          {submitLabel ?? t('walls.create')}
        </button>
        <button type="button" className="quiet" onClick={onBack}>
          {t('common.back')}
        </button>
      </div>
    </section>
    {drawn?.ok === true && <Plan outline={drawn.outline} closed unit={unit} view={viewBoxAround(drawn.outline, PREVIEW_MARGIN_MM)} />}
    </div>
  );
}

function Field({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error: string | null }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} dir="ltr" aria-invalid={error !== null} onChange={(e) => onChange(e.currentTarget.value)} />
      {error !== null && <p className="field-error">{error}</p>}
    </div>
  );
}
