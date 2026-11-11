import { useTranslation } from 'react-i18next';
import type { DesignDocument, DisplayUnit, Point } from '../../../src/core/index';
import { withWallLength, wallLengthUm } from './geometry';
import { LengthField } from './length-field';

type Props = { room: DesignDocument['room']; unit: DisplayUnit; onOutline: (outline: Point[]) => void; onCeiling: (um: number) => void };

/** The room's numbers: ceiling height and every wall length, editable. */
export function RoomPanel({ room, unit, onOutline, onCeiling }: Props) {
  const { t } = useTranslation();
  const n = room.outline.length;
  return (
    <section className="panel">
      <h2>{t('room.title')}</h2>
      <LengthField label={t('room.ceiling')} valueUm={room.ceilingHeightUm} unit={unit} onCommit={onCeiling} />
      <ol className="wall-rows">
        {room.outline.map((start, i) => (
          <li key={i}>
            <LengthField
              label={t('walls.length', { n: i + 1 })}
              valueUm={wallLengthUm(start, room.outline[(i + 1) % n]!)}
              unit={unit}
              onCommit={(um) => onOutline(withWallLength(room.outline, i, um))}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
