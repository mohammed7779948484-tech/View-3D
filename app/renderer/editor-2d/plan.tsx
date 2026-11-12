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
  /** While drawing: the first corner was clicked again (3 or more corners), so the outline closes. */
  onCloseOutline?: () => void;
  /** A 1 m grid and a 1 m scale bar, for drawing on an empty sheet. */
  grid?: boolean;
};

/** A label's screen box in world units (x right, y down), for keeping labels apart. */
type Box = { x0: number; y0: number; x1: number; y1: number };
const boxAround = (x: number, y: number, halfW: number, halfH: number): Box => ({ x0: x - halfW, y0: y - halfH, x1: x + halfW, y1: y + halfH });
const clash = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** Steps a label may move further out to get clear of the labels before it. */
const LABEL_STEPS = 12;

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
export function Plan({ outline, closed, unit, view, onPlanClick, onCornerMoved, openings = [], columns = [], fixtures = [], selectedId = null, onSelect, onFixtureMoved, onCloseOutline, grid = false }: Props) {
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
  // While drawing, where the next corner would go (snapped), so a line can follow the mouse.
  const [hover, setHover] = useState<Point | null>(null);
  const drawing = !closed && onPlanClick !== undefined;
  const size = Math.max(view.width, view.height);
  const handle = size / 90;
  const label = size / 42;

  const at = (event: { clientX: number; clientY: number }): Point | null => (world.current === null ? null : pointerToPlan(world.current, event.clientX, event.clientY));

  const walls = closed ? shown.map((p, i) => [p, shown[(i + 1) % shown.length]!] as const) : shown.slice(1).map((p, i) => [shown[i]!, p] as const);

  // Each wall's length, then its number further out, both outside the shop and clear of the wall
  // and its doors. A label that would touch an earlier one moves further out; the view then grows
  // to show every label.
  const layoutLabels = (list: readonly (readonly [Point, Point])[]) => {
    const placed: Box[] = [];
    return list.map(([a, b], i) => {
      const length = mm(Math.hypot(b.x - a.x, b.y - a.y)) || 1;
      const ox = mm(b.y - a.y) / length;
      const oy = -mm(b.x - a.x) / length;
      const cx = mm((a.x + b.x) / 2);
      const cy = mm((a.y + b.y) / 2);
      const text = formatDisplayLength(wallLengthUm(a, b), unit);
      // Generous text boxes: fonts differ between Linux and Windows.
      const halfW = (text.length * 0.66 + 0.8) * label * 0.5;
      const halfH = 1.25 * label;
      const badge = 1.1 * label;
      const reach = Math.abs(ox) * halfW + Math.abs(oy) * halfH;
      let near = 0.9 * label + reach;
      let far = near + reach + 1.1 * label;
      let boxes: Box[] = [];
      for (let step = 0; step < LABEL_STEPS; step++) {
        boxes = [boxAround(cx + ox * near, -(cy + oy * near), halfW, halfH), boxAround(cx + ox * far, -(cy + oy * far), badge, badge)];
        if (!boxes.some((q) => placed.some((r) => clash(q, r)))) break;
        near += 1.2 * label;
        far += 1.2 * label;
      }
      placed.push(...boxes);
      return { i, text, length: { x: cx + ox * near, y: -(cy + oy * near) }, number: { x: cx + ox * far, y: -(cy + oy * far) }, boxes };
    });
  };
  const wallLabels = layoutLabels(walls);
  // The view follows the stored outline only, never a corner being dragged: a view that moved
  // under the pointer would move the corner too.
  const storedWalls = closed ? outline.map((p, i) => [p, outline[(i + 1) % outline.length]!] as const) : outline.slice(1).map((p, i) => [outline[i]!, p] as const);
  const shownView = layoutLabels(storedWalls)
    .flatMap((w) => w.boxes)
    .reduce(
      (v, q) => {
        const x0 = Math.min(v.x, q.x0 - label);
        const y0 = Math.min(v.y, q.y0 - label);
        const x1 = Math.max(v.x + v.width, q.x1 + label);
        const y1 = Math.max(v.y + v.height, q.y1 + label);
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      },
      { ...view },
    );

  return (
    <svg
      className="plan"
      aria-label={t('plan.label')}
      viewBox={`${shownView.x} ${shownView.y} ${shownView.width} ${shownView.height}`}
      onClick={(event) => {
        const p = onPlanClick && !(event.target instanceof SVGCircleElement) ? at(event) : null;
        if (p !== null) onPlanClick?.(p);
      }}
      onPointerMove={(event) => {
        if (!drawing || shown.length === 0) return;
        const p = at(event);
        if (p !== null && (hover === null || p.x !== hover.x || p.y !== hover.y)) setHover(p);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <g ref={world} data-world="" transform="scale(1 -1)">
        {grid && (
          // Wider than the view box: the svg keeps its aspect, so the sheet shows more than the box.
          <g data-grid="" className="plan-grid">
            {Array.from({ length: Math.ceil((view.width * 3) / 1000) + 1 }, (_, i) => {
              const x = (Math.floor((view.x - view.width) / 1000) + i) * 1000;
              return <line key={`x${i}`} x1={x} y1={-(view.y - view.height)} x2={x} y2={-(view.y + 2 * view.height)} />;
            })}
            {Array.from({ length: Math.ceil((view.height * 3) / 1000) + 1 }, (_, i) => {
              const y = (Math.floor(-(view.y + 2 * view.height) / 1000) + i) * 1000;
              return <line key={`y${i}`} x1={view.x - view.width} y1={y} x2={view.x + 2 * view.width} y2={y} />;
            })}
          </g>
        )}
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
        {drawing && hover !== null && shown.length > 0 && (
          <line
            className="plan-draw-preview"
            data-draw-preview=""
            x1={mm(shown[shown.length - 1]!.x)}
            y1={mm(shown[shown.length - 1]!.y)}
            x2={mm(hover.x)}
            y2={mm(hover.y)}
          />
        )}
        {shown.map((p, i) => (
          <circle
            key={i}
            className="plan-corner"
            role="button"
            aria-label={t('plan.corner', { n: i + 1 })}
            cx={mm(p.x)}
            cy={mm(p.y)}
            r={handle}
            onClick={() => {
              if (i === 0 && drawing && shown.length >= 3) onCloseOutline?.();
            }}
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
      {wallLabels.map((w) => (
        <g key={w.i}>
          <text className="plan-length" data-wall={w.i} x={w.length.x} y={w.length.y} fontSize={label} direction="ltr">
            {w.text}
          </text>
          <circle className="plan-wall-badge" cx={w.number.x} cy={w.number.y} r={label * 0.8} />
          <text className="plan-wall-number" data-wall-number={w.i} x={w.number.x} y={w.number.y} fontSize={label * 0.9} direction="ltr">
            {w.i + 1}
          </text>
        </g>
      ))}
      {drawing && hover !== null && shown.length > 0 && (
        <text
          className="plan-length plan-draw-preview-length"
          data-draw-preview-length=""
          x={mm((shown[shown.length - 1]!.x + hover.x) / 2)}
          y={-mm((shown[shown.length - 1]!.y + hover.y) / 2) - label * 1.2}
          fontSize={label}
          direction="ltr"
        >
          {formatDisplayLength(wallLengthUm(shown[shown.length - 1]!, hover), unit)}
        </text>
      )}
      {grid && (
        <g data-scale-bar="" className="plan-scale">
          <line x1={view.x + label} y1={view.y + view.height - label} x2={view.x + label + 1000} y2={view.y + view.height - label} />
          <text x={view.x + label + 500} y={view.y + view.height - label * 1.8} fontSize={label * 0.8} direction="ltr">
            {formatDisplayLength(1_000_000, unit)}
          </text>
        </g>
      )}
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
