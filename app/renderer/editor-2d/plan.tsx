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
  fixtures?: readonly { id: string; corners: readonly Point[]; problem?: boolean; label?: string }[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** A fixture was dragged and released, moved by this snapped delta. */
  onFixtureMoved?: (id: string, dxUm: number, dyUm: number) => void;
};

const mm = (um: number): number => um / 1000;
/** Points on the quarter circle a door leaf sweeps (display only). */
const SWING_STEPS = 12;
/** Screen angle (degrees) of the line a -> b, turned so text along it never reads upside down. */
function readableAngle(a: Point, b: Point): number {
  let deg = (-Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

/**
 * The plan as svg. World coordinates are millimetres with y up inside `<g data-world>`; labels sit
 * outside it so their text is not mirrored. Every label is formatted from the document.
 */
export function Plan({ outline, closed, unit, view, onPlanClick, onCornerMoved, openings = [], columns = [], fixtures = [], selectedId = null, onSelect, onFixtureMoved }: Props) {
  const { t } = useTranslation();
  const tEntrance = t('plan.entrance');
  const world = useRef<SVGGElement>(null);
  const [drag, setDrag] = useState<{ index: number; point: Point } | null>(null);
  // As for fixtures below: the corner drag in a ref, so no pointer event reads a stale drag.
  const dragging = useRef<{ index: number; point: Point; down: Point | null } | null>(null);
  const trackCorner = (next: { index: number; point: Point; down: Point | null } | null): void => {
    dragging.current = next;
    setDrag(next === null ? null : { index: next.index, point: next.point });
  };
  // The drag lives in a ref so pointer events that arrive before React re-renders still see it;
  // the state copy only redraws the fixture where it is being dragged.
  const moving = useRef<{ id: string; from: Point; to: Point } | null>(null);
  const [move, setMove] = useState<{ id: string; from: Point; to: Point } | null>(null);
  const track = (next: { id: string; from: Point; to: Point } | null): void => {
    moving.current = next;
    setMove(next);
  };
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
          const gap = <line key={o.id} className={`plan-${o.kind}`} data-opening={o.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
          const swing = o.door?.swing;
          if (o.kind !== 'door' || swing === undefined || swing === 'none') return gap;
          // The leaf turns about its hinge, into the room (left of the wall's direction) or out of it.
          const ux = (b.x - a.x) / length;
          const uy = (b.y - a.y) / length;
          const side = swing === 'in' ? 1 : -1;
          const n = { x: -uy * side, y: ux * side };
          const [hinge, free] = o.door?.hinge === 'end' ? [to, from] : [from, to];
          const r = mm(o.widthUm);
          const toFree = { x: (free.x - hinge.x) / r, y: (free.y - hinge.y) / r };
          const arc = Array.from({ length: SWING_STEPS + 1 }, (_, k) => {
            const angle = (k / SWING_STEPS) * (Math.PI / 2);
            return `${hinge.x + r * (Math.cos(angle) * toFree.x + Math.sin(angle) * n.x)},${hinge.y + r * (Math.cos(angle) * toFree.y + Math.sin(angle) * n.y)}`;
          });
          return (
            <g key={o.id}>
              {gap}
              <polyline className="plan-door-swing" data-door-swing={o.id} points={`${hinge.x + r * n.x},${hinge.y + r * n.y} ${hinge.x},${hinge.y} ${arc.join(' ')}`} />
            </g>
          );
        })}
        {fixtures.map((f) => {
          const offset = move?.id === f.id ? `translate(${mm(move.to.x - move.from.x)} ${mm(move.to.y - move.from.y)})` : undefined;
          const [, , frontRight, frontLeft] = f.corners;
          return (
            <g key={f.id} transform={offset}>
              <polygon
                className={`plan-fixture${f.id === selectedId ? ' selected' : ''}${f.problem === true ? ' problem' : ''}`}
                data-placement={f.id}
                data-problem={f.problem === true ? 'true' : undefined}
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
                  track({ id: f.id, from: p, to: p });
                }}
                onPointerMove={(event) => {
                  const now = moving.current;
                  const p = now?.id === f.id ? at(event) : null;
                  if (now !== null && p !== null && (p.x !== now.to.x || p.y !== now.to.y)) track({ id: f.id, from: now.from, to: p });
                }}
                onPointerUp={(event) => {
                  const now = moving.current;
                  if (now?.id !== f.id) return;
                  // The release point counts too, even when no move event came before it.
                  const p = at(event) ?? now.to;
                  track(null);
                  const dx = p.x - now.from.x;
                  const dy = p.y - now.from.y;
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
              trackCorner({ index: i, point: p, down: at(event) });
            }}
            onPointerMove={(event) => {
              const now = dragging.current;
              const point = now?.index === i ? at(event) : null;
              if (now !== null && point !== null && (point.x !== now.point.x || point.y !== now.point.y)) trackCorner({ ...now, point });
            }}
            onPointerUp={(event) => {
              const now = dragging.current;
              if (now?.index !== i) return;
              trackCorner(null);
              // The release point counts, even with no move event before it; a plain click (released
              // where it was pressed) never snaps an exact corner onto the grid.
              const released = at(event);
              const moved = released !== null && now.down !== null && (released.x !== now.down.x || released.y !== now.down.y);
              const point = moved ? released : now.point;
              if (point.x !== outline[i]!.x || point.y !== outline[i]!.y) onCornerMoved?.(i, point);
            }}
          />
        ))}
      </g>
      {walls.map(([a, b], i) => {
        // Outside the room (right of the wall's direction), clear of the wall and of any door in it.
        // The length first, then the wall's number (the door form asks for walls by number) further out.
        const length = mm(Math.hypot(b.x - a.x, b.y - a.y)) || 1;
        const ox = mm(b.y - a.y) / length;
        const oy = -mm(b.x - a.x) / length;
        const cx = mm((a.x + b.x) / 2);
        const cy = mm((a.y + b.y) / 2);
        const text = formatDisplayLength(wallLengthUm(a, b), unit);
        // How far the label reaches along the outward direction: half its width or half its height.
        const reach = Math.abs(ox) * text.length * 0.32 * label + Math.abs(oy) * 1.25 * label;
        const near = 0.7 * label + reach;
        const far = near + reach + 1.1 * label;
        return (
          <g key={i}>
            <text className="plan-length" data-wall={i} x={cx + ox * near} y={-(cy + oy * near)} fontSize={label} direction="ltr">
              {text}
            </text>
            <circle className="plan-wall-badge" cx={cx + ox * far} cy={-(cy + oy * far)} r={label * 0.8} />
            <text className="plan-wall-number" data-wall-number={i} x={cx + ox * far} y={-(cy + oy * far)} fontSize={label * 0.9} direction="ltr">
              {i + 1}
            </text>
          </g>
        );
      })}
      {closed &&
        openings.map((o) => {
          if (o.kind !== 'door' || o.door?.isEntrance !== true) return null;
          const a = shown[o.wallIndex];
          const b = shown[(o.wallIndex + 1) % shown.length];
          if (a === undefined || b === undefined) return null;
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const middle = (o.offsetUm + o.widthUm / 2) / length;
          // Inside the room, beyond the leaf's sweep.
          const inward = (o.widthUm + label * 1000) / length;
          const x = mm(a.x + (b.x - a.x) * middle - (b.y - a.y) * inward);
          const y = mm(a.y + (b.y - a.y) * middle + (b.x - a.x) * inward);
          return (
            <text key={o.id} className="plan-entrance" data-entrance={o.id} x={x} y={-y} fontSize={label}>
              {tEntrance}
            </text>
          );
        })}
      {fixtures.map((f) => {
        if (f.label === undefined || f.corners.length < 4) return null;
        const [backLeft, backRight, frontRight] = f.corners as [Point, Point, Point, Point];
        const width = mm(Math.hypot(backRight.x - backLeft.x, backRight.y - backLeft.y));
        const depth = mm(Math.hypot(frontRight.x - backRight.x, frontRight.y - backRight.y));
        const cx = mm((backLeft.x + frontRight.x) / 2) + (move?.id === f.id ? mm(move.to.x - move.from.x) : 0);
        const cy = mm((backLeft.y + frontRight.y) / 2) + (move?.id === f.id ? mm(move.to.y - move.from.y) : 0);
        // As large as fits along the fixture's width and inside its depth, never above the wall labels.
        const size = Math.min(label * 0.8, (width * 0.9) / Math.max(1, f.label.length * 0.6), depth * 0.6);
        return (
          <text key={f.id} className="plan-fixture-label" data-fixture-label={f.id} x={cx} y={-cy} fontSize={size} transform={`rotate(${readableAngle(backLeft, backRight)} ${cx} ${-cy})`}>
            {f.label}
          </text>
        );
      })}
    </svg>
  );
}
