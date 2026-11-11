import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { checkDiagonal } from '../../../src/capture/index';
import { formatDisplayLength, parseLength } from '../../../src/core/index';
import type { DisplayUnit, Room } from '../../../src/core/index';
import type { PendingWindow, ScanFinding } from '../../../src/import-scan/index';
import { validateRoom } from '../../../src/rules/index';
import { lengthInputText, problemText } from '../i18n/messages';
import { viewBoxAround } from './geometry';
import { typedUnit } from './length-field';
import { nextId } from './openings-panel';
import { Plan } from './plan';

type Props = { room: Room; pendingWindows: PendingWindow[]; findings: ScanFinding[]; unit: DisplayUnit; onUse: (room: Room) => void; onBack: () => void };

const PREVIEW_MARGIN_MM = 1500;
const mm = (um: number): string => `${Math.round(um / 1000)} mm`;

function findingText(t: TFunction, f: ScanFinding): string {
  switch (f.code) {
    case 'gap-closed':
    case 'gap-filled':
      return t(`scan.findings.${f.code}`, { size: mm(f.sizeUm), wall: f.wallIndex + 1 });
    case 'window-sill-unknown':
      return t('scan.findings.window-sill-unknown', { wall: f.wallIndex + 1 });
    case 'window-not-on-wall':
      return t('scan.findings.window-not-on-wall', { distance: mm(f.distanceUm) });
    case 'doors-not-read':
      return t('scan.findings.doors-not-read', { doors: f.count });
    case 'ceiling-height-varies':
      return t('scan.findings.ceiling-height-varies', { min: mm(f.minUm), max: mm(f.maxUm) });
    default:
      return t(`scan.findings.${f.code}`);
  }
}

/** "Check the scan": what the scan did not know, the windows waiting for a sill height, a diagonal check. */
export function ScanReview({ room: scanned, pendingWindows, findings, unit, onUse, onBack }: Props) {
  const { t } = useTranslation();
  const formId = useId();
  const [room, setRoom] = useState(scanned);
  const [decided, setDecided] = useState<Record<string, true>>({});
  const [sills, setSills] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [diagonal, setDiagonal] = useState({ from: '', to: '', length: '' });
  const waiting = pendingWindows.filter((w) => decided[w.id] !== true);

  function add(w: PendingWindow): void {
    const read = parseLength(sills[w.id] ?? '', typedUnit(unit));
    if (!read.ok) return setErrors((e) => ({ ...e, [w.id]: lengthInputText(t, read.code) }));
    const id = nextId(room, 'window');
    const candidate: Room = {
      ...room,
      openings: [...room.openings, { id, kind: 'window', wallIndex: w.wallIndex, offsetUm: w.offsetUm, widthUm: w.widthUm, heightUm: w.heightUm, sillHeightUm: read.um }],
    };
    const objections = validateRoom(candidate).filter((p) => p.openingId === id || p.otherOpeningId === id);
    if (objections.length > 0) return setErrors((e) => ({ ...e, [w.id]: objections.map((p) => problemText(t, candidate, p)).join(' ') }));
    setRoom(candidate);
    setDecided((d) => ({ ...d, [w.id]: true }));
  }

  const corner = (text: string): number | null => (/^\s*\d+\s*$/.test(text) && Number(text) >= 1 && Number(text) <= room.outline.length ? Number(text) - 1 : null);
  const from = corner(diagonal.from);
  const to = corner(diagonal.to);
  const measured = parseLength(diagonal.length, typedUnit(unit));
  const check = from !== null && to !== null && from !== to && measured.ok ? checkDiagonal(room.outline, { fromCorner: from, toCorner: to, measuredUm: measured.um }) : null;

  const input = (key: 'from' | 'to' | 'length', label: string) => (
    <div className="field">
      <label htmlFor={`${formId}-${key}`}>{label}</label>
      <input
        id={`${formId}-${key}`}
        dir="ltr"
        value={diagonal[key]}
        onChange={(e) => {
          const value = e.currentTarget.value;
          setDiagonal((d) => ({ ...d, [key]: value }));
        }}
      />
    </div>
  );

  return (
    <div className="workspace">
      <section className="panel">
        <h2>{t('scan.title')}</h2>
        <ul className="warnings" aria-label={t('scan.findingsLabel')}>
          {findings.map((f, i) => (
            <li key={`${f.code}${i}`}>{findingText(t, f)}</li>
          ))}
        </ul>
        {waiting.map((w, i) => (
          <div role="group" className="item-form" key={w.id} aria-label={t('scan.window', { n: i + 1 })}>
            <p>{t('scan.windowSize', { width: formatDisplayLength(w.widthUm, unit), height: formatDisplayLength(w.heightUm, unit), wall: w.wallIndex + 1 })}</p>
            <div className="field">
              <label htmlFor={`${formId}-${w.id}`}>{t('scan.sill')}</label>
              <input
                id={`${formId}-${w.id}`}
                dir="ltr"
                value={sills[w.id] ?? ''}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setSills((s) => ({ ...s, [w.id]: value }));
                }}
              />
            </div>
            {errors[w.id] !== undefined && <p role="alert">{errors[w.id]}</p>}
            <div className="actions">
              <button type="button" className="primary" onClick={() => add(w)}>
                {t('scan.addWindow')}
              </button>
              <button type="button" className="quiet" onClick={() => setDecided((d) => ({ ...d, [w.id]: true }))}>
                {t('scan.leaveOut')}
              </button>
            </div>
          </div>
        ))}
        <fieldset className="diagonal">
          <legend>{t('walls.diagonal')}</legend>
          {input('from', t('walls.diagonalFrom'))}
          {input('to', t('walls.diagonalTo'))}
          {input('length', t('walls.diagonalLength'))}
          {check !== null && (
            <p className={check.ok ? 'status ok' : 'status'}>
              {check.ok ? t('walls.diagonalOk') : t('walls.diagonalOff', { difference: formatDisplayLength(check.differenceUm, unit) })}
            </p>
          )}
        </fieldset>
        <div className="actions">
          <button type="button" className="primary" disabled={waiting.length > 0} onClick={() => onUse(room)}>
            {t('scan.use')}
          </button>
          <button type="button" className="quiet" onClick={onBack}>
            {t('common.back')}
          </button>
        </div>
      </section>
      <Plan outline={room.outline} closed unit={unit} openings={room.openings} view={viewBoxAround(room.outline, PREVIEW_MARGIN_MM)} />
    </div>
  );
}
