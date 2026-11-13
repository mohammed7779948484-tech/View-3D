/** The selected fixture: its position and rotation, typed exactly, and the actions on it. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAngle, parseAngle, parseCoordinate } from '../../../src/core/index';
import type { DisplayUnit, Placement, Product } from '../../../src/core/index';
import { angleInputText } from '../i18n/messages';
import { LengthField } from './length-field';

type Props = {
  placement: Placement;
  product: Product | undefined;
  unit: DisplayUnit;
  onPose: (pose: { center?: Placement['center']; rotationUdeg?: number }) => boolean;
  onRotate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

/** A rotation in degrees; unlike a room corner, 0 is allowed. */
function readRotation(text: string): ReturnType<typeof parseAngle> {
  const read = parseAngle(text);
  return !read.ok && read.code === 'out-of-range' && /^\s*0+(\.0*)?\s*(°|deg)?\s*$/.test(text) ? { ok: true, udeg: 0 } : read;
}

export function FixtureInspector({ placement, product, unit, onPose, onRotate, onDuplicate, onDelete }: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const shown = formatAngle(placement.rotationUdeg);
  const commitRotation = (text: string): void => {
    if (text === shown) return setError(null);
    const read = readRotation(text);
    if (!read.ok) return setError(angleInputText(t, read.code));
    setError(null);
    if (read.udeg !== placement.rotationUdeg) onPose({ rotationUdeg: read.udeg });
  };
  return (
    <section className="panel">
      <h2>{t('fixtures.selected')}</h2>
      <p>
        {product?.name ?? placement.productId} <span className="hint">({placement.id})</span>
      </p>
      <LengthField label={t('fixtures.x')} valueUm={placement.center.x} unit={unit} parse={parseCoordinate} onCommit={(x) => onPose({ center: { x, y: placement.center.y } })} />
      <LengthField label={t('fixtures.y')} valueUm={placement.center.y} unit={unit} parse={parseCoordinate} onCommit={(y) => onPose({ center: { x: placement.center.x, y } })} />
      <div className="field">
        <label htmlFor="fixture-rotation">{t('fixtures.rotation')}</label>
        <input
          id="fixture-rotation"
          key={`${placement.id}:${placement.rotationUdeg}`}
          defaultValue={shown}
          dir="ltr"
          aria-invalid={error !== null}
          onBlur={(e) => commitRotation(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRotation(e.currentTarget.value);
          }}
        />
        {error !== null && <p className="field-error">{error}</p>}
      </div>
      <div className="actions">
        <button type="button" onClick={onRotate}>
          {t('fixtures.rotate')}
        </button>
        <button type="button" onClick={onDuplicate}>
          {t('fixtures.duplicate')}
        </button>
        <button type="button" onClick={onDelete}>
          {t('fixtures.delete')}
        </button>
      </div>
    </section>
  );
}
