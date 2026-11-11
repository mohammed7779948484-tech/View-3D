import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDisplayLength } from '../../../src/core/index';
import type { Column, DisplayUnit, Opening, Point } from '../../../src/core/index';
import { pointerToPlan, wallLengthUm } from './geometry';

type Props = {
  outline: readonly Point[];
  /** Whether the outline is closed (a room) or still being drawn. */
  closed: boolean;
  unit: DisplayUnit;
  view: { x: number; y: number; width: number; height: number };
  /** A click on empty plan, snapped. */
  onPlanClick?: (point: Point) => void;
  /** A corner was dragged and released at this snapped point. */
  onCornerMoved?: (index: number, point: Point) => void;
  openings?: readonly Opening[];
  columns?: readonly Column[];
  /** Fixture footprints: corners [back-left, back-right, front-right, front-left], um. */
  fixtures?: readonly { id: string; corners: readonly Point[] }[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** A fixture was dragged and released, moved by this snapped delta. */
  onFixtureMoved?: (id: string, dxUm: number, dyUm: number) => void;
};

const mm = (um: number): number => um / 1000;

/**
 * The plan as svg. World coordinates are millimetres with y up inside `<g data-world>`; labels sit
 * outside it so their text is not mirrored. Every label is formatted from the document.
 */
export function Plan({ outline, closed, unit, view, onPlanClick, onCornerMoved, openings = [], columns = [], fixtures = [], selectedId = null, onSelect, onFixtureMoved }: Props) {
  const { t } = useTranslation();
  const world = useRef<SVGGElement>(null);
  const [drag, setDrag] = useState<{ index: number; point: Point } | null>(null);
  const [move, setMove] = useState<{ id: string; from: Point; to: Point } | null>(null);
  const shown = drag === null ? outline : outline.map((p, i) => (i === drag.index ? drag.point : p));
  const size = Math.max(view.width, view.height);
  const handle = size / 90;
  const label = size / 42;

  const at = (event: { clientX: number; clientY: number }): Point | null => (world.current === null ? null : pointerToPlan(world.current, event.clientX, event.clientY));

  const walls = closed ? shown.map((p, i) => [p, shown[(i + 1) % shown.length]!] as const) : shown.slice(1).map((p, i) => [shown[i]!, p] as const);

  return (
    <svg
      className="plan"
      aria-label={t('plan.label')}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      onClick={(event) => {
        const p = onPlanClick && !(event.target instanceof SVGCircleElement) ? at(event) : null;
        if (p !== null) onPlanClick?.(p);
      }}
    >
      <g ref={world} data-world="" transform="scale(1 -1)">
        {shown.length > 1 &&
          (closed ? (
            <polygon className="plan-room" points={shown.map((p) => `${mm(p.x)},${mm(p.y)}`).join(' ')} />
          ) : (
            <polyline className="plan-room open" points={shown.map((p) => `${mm(p.x)},${mm(p.y)}`).join(' ')} />
          ))}
        {columns.map((c) => (
          <polygon key={c.id} className="plan-column" data-column={c.id} points={c.outline.map((p) => `${mm(p.x)},${mm(p.y)}`).join(' ')} />
        ))}
        {openings.map((o) => {
          const a = shown[o.wallIndex];
          const b = shown[(o.wallIndex + 1) % shown.length];
          if (a === undefined || b === undefined) return null;
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          const along = (d: number) => ({ x: mm(a.x + ((b.x - a.x) * d) / length), y: mm(a.y + ((b.y - a.y) * d) / length) });
          const from = along(o.offsetUm);
          const to = along(o.offsetUm + o.widthUm);
          return <line key={o.id} className={`plan-${o.kind}`} data-opening={o.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        })}
        {fixtures.map((f) => {
          const offset = move?.id === f.id ? `translate(${mm(move.to.x - move.from.x)} ${mm(move.to.y - move.from.y)})` : undefined;
          const [, , frontRight, frontLeft] = f.corners;
          return (
            <g key={f.id} transform={offset}>
              <polygon
                className={`plan-fixture${f.id === selectedId ? ' selected' : ''}`}
                data-placement={f.id}
                points={f.corners.map((p) => `${mm(p.x)},${mm(p.y)}`).join(' ')}
                onClick={(event) => {
                  if (onSelect === undefined) return;
                  event.stopPropagation();
                  onSelect(f.id);
                }}
                onPointerDown={(event) => {
                  const p = onFixtureMoved === undefined ? null : at(event);
                  if (p === null) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setMove({ id: f.id, from: p, to: p });
                }}
                onPointerMove={(event) => {
                  const p = move?.id === f.id ? at(event) : null;
                  if (p !== null && (p.x !== move?.to.x || p.y !== move.to.y)) setMove({ id: f.id, from: move!.from, to: p });
                }}
                onPointerUp={() => {
                  if (move?.id !== f.id) return;
                  setMove(null);
                  const dx = move.to.x - move.from.x;
                  const dy = move.to.y - move.from.y;
                  if (dx !== 0 || dy !== 0) onFixtureMoved?.(f.id, dx, dy);
                }}
              />
              {frontRight !== undefined && frontLeft !== undefined && (
                <line className="plan-fixture-front" x1={mm(frontRight.x)} y1={mm(frontRight.y)} x2={mm(frontLeft.x)} y2={mm(frontLeft.y)} />
              )}
            </g>
          );
        })}
        {shown.map((p, i) => (
          <circle
            key={i}
            className="plan-corner"
            role="button"
            aria-label={t('plan.corner', { n: i + 1 })}
            cx={mm(p.x)}
            cy={mm(p.y)}
            r={handle}
            onPointerDown={(event) => {
              if (onCornerMoved === undefined) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDrag({ index: i, point: p });
            }}
            onPointerMove={(event) => {
              const point = drag?.index === i ? at(event) : null;
              if (point !== null && (point.x !== drag?.point.x || point.y !== drag.point.y)) setDrag({ index: i, point });
            }}
            onPointerUp={() => {
              if (drag?.index !== i) return;
              setDrag(null);
              if (drag.point.x !== outline[i]!.x || drag.point.y !== outline[i]!.y) onCornerMoved?.(i, drag.point);
            }}
          />
        ))}
      </g>
      {walls.map(([a, b], i) => (
        <text key={i} className="plan-length" data-wall={i} x={mm((a.x + b.x) / 2)} y={-mm((a.y + b.y) / 2)} fontSize={label} direction="ltr">
          {formatDisplayLength(wallLengthUm(a, b), unit)}
        </text>
      ))}
    </svg>
  );
}
