import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDisplayLength, parseLength } from '../../../src/core/index';
import type { DisplayUnit, LengthUnit } from '../../../src/core/index';
import { lengthInputText } from '../i18n/messages';

/** ft-in is typed as feet and inches; a bare number in ft-in is read as feet. */
export const typedUnit = (unit: DisplayUnit): LengthUnit => (unit === 'ft-in' ? 'ft' : unit);

/** onCommit returns false when the change was refused: the field then shows the stored value again. */
type Props = { label: string; valueUm: number; unit: DisplayUnit; onCommit: (um: number) => boolean };

/** A length field bound to a stored value: shows it formatted, commits on Enter or leaving the field. */
export function LengthField({ label, valueUm, unit, onCommit }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(0);
  const shown = formatDisplayLength(valueUm, unit);
  function commit(text: string): void {
    if (text === shown) return setError(null);
    const read = parseLength(text, typedUnit(unit));
    if (!read.ok) return setError(lengthInputText(t, read.code));
    setError(null);
    if (read.um !== valueUm && !onCommit(read.um)) setRefused((n) => n + 1);
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        key={`${valueUm}:${unit}:${refused}`}
        defaultValue={shown}
        dir="ltr"
        aria-invalid={error !== null}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget.value);
        }}
      />
      {error !== null && <p className="field-error">{error}</p>}
    </div>
  );
}
