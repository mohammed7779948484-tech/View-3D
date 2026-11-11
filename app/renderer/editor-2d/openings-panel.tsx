import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDisplayLength, parseLength } from '../../../src/core/index';
import type { DisplayUnit, Opening, Room } from '../../../src/core/index';
import { validateRoom } from '../../../src/rules/index';
import { typedUnit } from './length-field';

type Kind = 'door' | 'window' | 'column';
type Props = { room: Room; unit: DisplayUnit; onRoom: (room: Room) => void };

const FIELDS: Record<Kind, readonly string[]> = {
  door: ['wall', 'offset', 'width', 'height'],
  window: ['wall', 'offset', 'width', 'height', 'sill'],
  column: ['width', 'depth', 'x', 'y'],
};

/** The smallest free number for `door-N`, `window-N` or `column-N`. */
function nextId(room: Room, kind: Kind): string {
  const ids = kind === 'column' ? room.columns.map((c) => c.id) : room.openings.map((o) => o.id);
  const used = new Set(ids.map((id) => new RegExp(`^${kind}-(\\d+)$`).exec(id)?.[1]).filter((n) => n !== undefined).map(Number));
  let n = 1;
  while (used.has(n)) n++;
  return `${kind}-${n}`;
}

const numberOf = (id: string): string => /-(\d+)$/.exec(id)?.[1] ?? id;

/** Doors, windows and columns: listed, added through a form, refused when the room check objects. */
export function OpeningsPanel({ room, unit, onRoom }: Props) {
  const { t } = useTranslation();
  const formId = useId();
  const [kind, setKind] = useState<Kind | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [door, setDoor] = useState({ isEntrance: false, swing: 'in' as 'in' | 'out' | 'none', hinge: 'start' as 'start' | 'end' });
  const [errors, setErrors] = useState<string[]>([]);
  const len = (um: number): string => formatDisplayLength(um, unit);

  function open(next: Kind): void {
    setKind(next);
    setValues({});
    setErrors([]);
    setDoor({ isEntrance: false, swing: 'in', hinge: 'start' });
  }

  function add(): void {
    if (kind === null) return;
    const read: Record<string, number> = {};
    const problems: string[] = [];
    for (const field of FIELDS[kind]) {
      const text = values[field] ?? '';
      if (field === 'wall') {
        if (/^\s*\d+\s*$/.test(text) && Number(text) >= 1) read[field] = Number(text) - 1;
        else problems.push(t('openings.wallNumber'));
        continue;
      }
      const result = parseLength(text, typedUnit(unit));
      if (result.ok) read[field] = result.um;
      else problems.push(`${t(`openings.${kind}.${field}`)}: ${result.message}`);
    }
    if (problems.length > 0) return setErrors(problems);
    const id = nextId(room, kind);
    let candidate: Room;
    if (kind === 'column') {
      const { x, y, width, depth } = read as Record<'x' | 'y' | 'width' | 'depth', number>;
      const outline = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + depth }, { x, y: y + depth }];
      candidate = { ...room, columns: [...room.columns, { id, outline }] };
    } else {
      const opening: Opening = {
        id,
        kind,
        wallIndex: read['wall']!,
        offsetUm: read['offset']!,
        widthUm: read['width']!,
        heightUm: read['height']!,
        sillHeightUm: kind === 'window' ? read['sill']! : 0,
        ...(kind === 'door' ? { door: { ...door } } : {}),
      };
      candidate = { ...room, openings: [...room.openings, opening] };
    }
    const objections = validateRoom(candidate).filter((p) => p.openingId === id || p.otherOpeningId === id || p.columnId === id);
    if (objections.length > 0) return setErrors(objections.map((p) => p.message));
    onRoom(candidate);
    setKind(null);
  }

  const field = (name: string) => {
    const id = `${formId}-${name}`;
    return (
      <div className="field" key={name}>
        <label htmlFor={id}>{t(`openings.${kind}.${name}`)}</label>
        <input id={id} dir="ltr" value={values[name] ?? ''} onChange={(e) => {
          const text = e.currentTarget.value;
          setValues((v) => ({ ...v, [name]: text }));
        }} />
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>{t('openings.title')}</h2>
      <ul className="items">
        {room.openings.map((o) => (
          <li key={o.id}>
            <span>
              {t(o.kind === 'door' ? (o.door?.isEntrance ? 'openings.entranceItem' : 'openings.doorItem') : 'openings.windowItem', {
                n: numberOf(o.id),
                wall: o.wallIndex + 1,
                offset: len(o.offsetUm),
                width: len(o.widthUm),
              })}
            </span>
            <button
              type="button"
              className="quiet"
              onClick={() => onRoom({ ...room, openings: room.openings.filter((x) => x.id !== o.id) })}
            >
              {t(o.kind === 'door' ? 'openings.removeDoor' : 'openings.removeWindow', { n: numberOf(o.id) })}
            </button>
          </li>
        ))}
        {room.columns.map((c) => (
          <li key={c.id}>
            <span>{t('openings.columnItem', { n: numberOf(c.id) })}</span>
            <button type="button" className="quiet" onClick={() => onRoom({ ...room, columns: room.columns.filter((x) => x.id !== c.id) })}>
              {t('openings.removeColumn', { n: numberOf(c.id) })}
            </button>
          </li>
        ))}
      </ul>
      {kind === null ? (
        <div className="actions">
          <button type="button" onClick={() => open('door')}>{t('openings.addDoor')}</button>
          <button type="button" onClick={() => open('window')}>{t('openings.addWindow')}</button>
          <button type="button" onClick={() => open('column')}>{t('openings.addColumn')}</button>
        </div>
      ) : (
        <fieldset className="item-form">
          <legend>{t(`openings.${kind}.title`)}</legend>
          {kind === 'column' && <p className="hint">{t('openings.column.hint')}</p>}
          {FIELDS[kind].map(field)}
          {kind === 'door' && (
            <>
              <label className="check">
                <input type="checkbox" checked={door.isEntrance} onChange={(e) => {
                    const isEntrance = e.currentTarget.checked;
                    setDoor((d) => ({ ...d, isEntrance }));
                  }} />
                {t('openings.door.entrance')}
              </label>
              <label className="field">
                {t('openings.door.swing')}
                <select value={door.swing} onChange={(e) => {
                    const swing = e.currentTarget.value as 'in' | 'out' | 'none';
                    setDoor((d) => ({ ...d, swing }));
                  }}>
                  <option value="in">{t('openings.door.swingIn')}</option>
                  <option value="out">{t('openings.door.swingOut')}</option>
                  <option value="none">{t('openings.door.swingNone')}</option>
                </select>
              </label>
              <label className="field">
                {t('openings.door.hinge')}
                <select value={door.hinge} onChange={(e) => {
                    const hinge = e.currentTarget.value as 'start' | 'end';
                    setDoor((d) => ({ ...d, hinge }));
                  }}>
                  <option value="start">{t('openings.door.hingeStart')}</option>
                  <option value="end">{t('openings.door.hingeEnd')}</option>
                </select>
              </label>
            </>
          )}
          {errors.length > 0 && (
            <div role="alert">
              {errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}
          <div className="actions">
            <button type="button" className="primary" onClick={add}>
              {t(`openings.${kind}.add`)}
            </button>
            <button type="button" className="quiet" onClick={() => setKind(null)}>
              {t('openings.cancel')}
            </button>
          </div>
        </fieldset>
      )}
    </section>
  );
}
