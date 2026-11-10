/**
 * 2D plan of a design document as an SVG string. Pure string building: no DOM, no browser or
 * Node APIs, so it runs anywhere and the same input always gives the same bytes.
 *
 * SVG user units are millimetres. The document's y axis points up and SVG's points down, so every
 * point is flipped once in `sx` / `sy`. Elements that matter for accuracy also carry the plan
 * coordinates untouched in `data-plan-points` (mm, 3 decimals = micrometre precision).
 */
import type { DesignDocument, Opening, Placement, Product, Variant } from '../core/index';
import { fromUm } from '../core/index';
import type { LengthUnit } from '../core/index';
import { areaMm2, openingSegment, rectCorners, wallSegments } from '../geometry/index';
import type { Point } from '../geometry/index';

export type PlanOverlays = {
  title?: string;
  subtitle?: string;
  /** Shown as "Option N" in the title block. */
  rank?: number;
  /** Keep-clear zones (door swing, door approach, entrance clear). */
  zones?: { id: string; kind: string; polygon: readonly Point[]; label?: string }[];
  /** Floor that must stay walkable next to fixtures. */
  accessZones?: { placementId: string; kind: 'customer' | 'staff'; polygon: readonly Point[] }[];
  /** Measured clear widths, drawn as dimension lines. */
  aisles?: { from: Point; to: Point; widthUm: number; kind: 'main' | 'secondary'; label?: string }[];
  violations?: { placementIds: string[]; message: string }[];
  unplaced?: { name: string; quantity: number; reason: string }[];
  scoreLines?: string[];
};

export type PlanOptions = {
  /** Unit of every length on the drawing. Default 'mm'. */
  unit?: LengthUnit;
  /** Optional second unit shown in brackets on wall dimensions. */
  secondaryUnit?: LengthUnit;
};

const CATEGORY_COLOURS: Record<Product['category'], string> = {
  counter: '#f2b24c',
  showcase: '#7cc4e8',
  gondola: '#9ad08f',
  tower: '#c6a5e0',
  slatwall: '#d9c7a3',
  accessory: '#cfd4da',
};
const ZONE_COLOURS: Record<string, string> = {
  'door-swing': '#e4572e',
  'door-approach': '#f08a4b',
  'entrance-clear': '#f6c445',
  decompression: '#f6e58d',
};
const ZONE_NAMES: Record<string, string> = {
  'door-swing': 'Door swing (keep clear)',
  'door-approach': 'Door approach (keep clear)',
  'entrance-clear': 'Entrance clear zone',
  decompression: 'Entrance decompression zone (keep clear)',
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = (v: number): string => (Math.round(v * 10) / 10 + 0).toFixed(1);
const mm3 = (um: number): string => (um / 1000).toFixed(3);
const planPoints = (pts: readonly Point[]): string => pts.map((p) => `${mm3(p.x)},${mm3(p.y)}`).join(' ');

/** A length as a bare number in `unit`: whole mm, otherwise up to 1 decimal without trailing zeros. */
function num(um: number, unit: LengthUnit): string {
  const v = fromUm(Math.round(um), unit);
  return unit === 'mm' ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}
const len = (um: number, unit: LengthUnit): string => `${num(um, unit)} ${unit}`;

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line !== '' && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

type Drawn = { placement: Placement; product: Product; variant: Variant; corners: Point[]; code: string };

/** A, B, ... Z, AA, AB, ... */
function codeFor(index: number): string {
  let s = '';
  for (let i = index; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
  return s;
}

export function renderPlanSvg(doc: DesignDocument, overlays: PlanOverlays = {}, options: PlanOptions = {}): string {
  const unit = options.unit ?? 'mm';
  const room = doc.room;
  const xs = room.outline.map((p) => p.x / 1000);
  const ys = room.outline.map((p) => p.y / 1000);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const roomW = maxX - minX;
  const roomH = maxY - minY;
  const fs = Math.max(roomW, roomH) / 55; // base font size, mm
  const margin = fs * 5;
  const titleH = fs * 7;
  const panelW = fs * 30;
  const originX = margin;
  const originY = titleH + margin;
  const sx = (um: number): number => originX + (um / 1000 - minX);
  const sy = (um: number): number => originY + (maxY - um / 1000);
  const pts = (poly: readonly Point[]): string => poly.map((p) => `${n1(sx(p.x))},${n1(sy(p.y))}`).join(' ');
  const exactPts = (poly: readonly Point[]): string =>
    poly.map((p) => `${(sx(p.x)).toFixed(3)},${(sy(p.y)).toFixed(3)}`).join(' ');

  // ---- fixtures, in id order, with a letter per product variant
  const codes = new Map<string, string>();
  const drawn: Drawn[] = [];
  for (const placement of [...doc.placements].sort(byId)) {
    const product = doc.products.find((p) => p.id === placement.productId);
    const variant = product?.variants.find((v) => v.id === placement.variantId);
    if (product === undefined || variant === undefined || variant.widthUm === null || variant.depthUm === null) continue;
    const key = `${product.id}/${variant.id}`;
    if (!codes.has(key)) codes.set(key, '');
    drawn.push({
      placement,
      product,
      variant,
      corners: rectCorners({
        center: placement.center,
        widthUm: variant.widthUm,
        depthUm: variant.depthUm,
        rotationUdeg: placement.rotationUdeg,
      }),
      code: key,
    });
  }
  [...codes.keys()].sort().forEach((key, i) => codes.set(key, codeFor(i)));
  for (const d of drawn) d.code = codes.get(d.code)!;
  const violating = new Set((overlays.violations ?? []).flatMap((v) => v.placementIds));
  const hasTestOnly = drawn.some((d) => d.product.testOnly);

  const body: string[] = [];

  // ---- floor
  body.push(
    `<polygon data-role="room-outline" data-plan-points="${planPoints(room.outline)}" points="${exactPts(room.outline)}" fill="#fbfaf7" stroke="none"/>`,
  );

  // ---- overlays under the fixtures
  for (const zone of [...(overlays.accessZones ?? [])].sort((a, b) =>
    `${a.placementId}/${a.kind}` < `${b.placementId}/${b.kind}` ? -1 : 1,
  )) {
    body.push(
      `<polygon data-access-zone="${esc(zone.placementId)}" points="${pts(zone.polygon)}" fill="${zone.kind === 'staff' ? '#8e7cc3' : '#4a90d9'}" fill-opacity="0.10" stroke="none"/>`,
    );
  }
  const zoneKinds: string[] = [];
  for (const zone of [...(overlays.zones ?? [])].sort(byId)) {
    const colour = ZONE_COLOURS[zone.kind] ?? '#999999';
    if (!zoneKinds.includes(zone.kind)) zoneKinds.push(zone.kind);
    body.push(
      `<polygon data-zone-id="${esc(zone.id)}" points="${pts(zone.polygon)}" fill="${colour}" fill-opacity="0.22" stroke="${colour}" stroke-width="${n1(fs * 0.08)}" stroke-dasharray="${n1(fs * 0.4)} ${n1(fs * 0.3)}"/>`,
    );
  }

  // ---- walls, columns, openings
  const wallW = fs * 0.55;
  body.push(`<polygon points="${pts(room.outline)}" fill="none" stroke="#2b2b2b" stroke-width="${n1(wallW)}" stroke-linejoin="miter"/>`);
  for (const column of [...room.columns].sort(byId)) {
    body.push(`<polygon data-column-id="${esc(column.id)}" points="${pts(column.outline)}" fill="#555555" stroke="#2b2b2b" stroke-width="${n1(fs * 0.1)}"/>`);
  }
  for (const opening of [...room.openings].sort(byId)) body.push(...drawOpening(opening));

  function drawOpening(opening: Opening): string[] {
    const seg = openingSegment(room.outline, opening.wallIndex, opening.offsetUm, opening.widthUm);
    if (seg === null) return [];
    const a = { x: sx(seg.start.x), y: sy(seg.start.y) };
    const b = { x: sx(seg.end.x), y: sy(seg.end.y) };
    const nx = seg.inwardNormal.x;
    const ny = -seg.inwardNormal.y; // screen space
    const out: string[] = [];
    if (opening.kind === 'window') {
      out.push(`<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="#ffffff" stroke-width="${n1(wallW * 1.1)}"/>`);
      for (const k of [-0.3, 0.3]) {
        out.push(
          `<line data-window-id="${esc(opening.id)}" x1="${n1(a.x + nx * wallW * k)}" y1="${n1(a.y + ny * wallW * k)}" x2="${n1(b.x + nx * wallW * k)}" y2="${n1(b.y + ny * wallW * k)}" stroke="#2f7fc1" stroke-width="${n1(fs * 0.12)}"/>`,
        );
      }
      const mx = (a.x + b.x) / 2 + nx * fs * 2.2;
      const my = (a.y + b.y) / 2 + ny * fs * 2.2;
      out.push(`<text x="${n1(mx)}" y="${n1(my)}" font-size="${n1(fs * 0.7)}" fill="#2f7fc1" text-anchor="middle" dominant-baseline="middle">window</text>`);
      return out;
    }
    out.push(`<line data-door-id="${esc(opening.id)}" x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="#ffffff" stroke-width="${n1(wallW * 1.3)}"/>`);
    const door = opening.door;
    const w = opening.widthUm / 1000;
    if (door !== undefined && door.swing === 'in') {
      const hinge = door.hinge === 'start' ? a : b;
      const latch = door.hinge === 'start' ? b : a;
      const open = { x: hinge.x + nx * w, y: hinge.y + ny * w };
      // Sweep direction: from the closed leaf (hinge -> latch) to the open leaf (hinge -> open).
      const cross = (latch.x - hinge.x) * (open.y - hinge.y) - (latch.y - hinge.y) * (open.x - hinge.x);
      out.push(`<line x1="${n1(hinge.x)}" y1="${n1(hinge.y)}" x2="${n1(open.x)}" y2="${n1(open.y)}" stroke="#2b2b2b" stroke-width="${n1(fs * 0.14)}"/>`);
      out.push(
        `<path d="M ${n1(latch.x)} ${n1(latch.y)} A ${n1(w)} ${n1(w)} 0 0 ${cross > 0 ? 1 : 0} ${n1(open.x)} ${n1(open.y)}" fill="none" stroke="#2b2b2b" stroke-width="${n1(fs * 0.07)}" stroke-dasharray="${n1(fs * 0.3)} ${n1(fs * 0.25)}"/>`,
      );
    }
    if (door?.isEntrance === true) {
      const mx = (a.x + b.x) / 2 - nx * fs * 1.9;
      const my = (a.y + b.y) / 2 - ny * fs * 1.9;
      out.push(`<text x="${n1(mx)}" y="${n1(my)}" font-size="${n1(fs * 0.95)}" font-weight="bold" fill="#b3261e" text-anchor="middle" dominant-baseline="middle">ENTRANCE</text>`);
    }
    return out;
  }

  // ---- wall dimensions, outside the room
  for (const wall of wallSegments(room.outline)) {
    const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
    const hasEntrance = room.openings.some((o) => o.wallIndex === wall.index && o.door?.isEntrance === true);
    const off = fs * (hasEntrance ? 3.4 : 1.6);
    const x = sx(mid.x) - wall.inwardNormal.x * off;
    const y = sy(mid.y) + wall.inwardNormal.y * off;
    let angle = (-Math.atan2(wall.direction.y, wall.direction.x) * 180) / Math.PI;
    if (angle > 90 || angle <= -90) angle += angle > 0 ? -180 : 180;
    const lengthUm = Math.round(wall.lengthUm);
    const text =
      options.secondaryUnit === undefined ? len(lengthUm, unit) : `${len(lengthUm, unit)} (${len(lengthUm, options.secondaryUnit)})`;
    body.push(
      `<text data-wall-index="${wall.index}" data-length-um="${lengthUm}" x="${n1(x)}" y="${n1(y)}" font-size="${n1(fs * 0.9)}" fill="#444444" text-anchor="middle" dominant-baseline="middle" transform="rotate(${n1(angle)} ${n1(x)} ${n1(y)})">${esc(text)}</text>`,
    );
  }

  // ---- fixtures
  for (const d of drawn) {
    const { placement, product, variant, corners } = d;
    const [bl, br, fr, fl] = corners as [Point, Point, Point, Point];
    const bad = violating.has(placement.id);
    body.push(
      `<polygon data-placement-id="${esc(placement.id)}" data-product-id="${esc(product.id)}" data-width-um="${variant.widthUm}" data-depth-um="${variant.depthUm}"${bad ? ' data-violation="true"' : ''} data-plan-points="${planPoints(corners)}" points="${exactPts(corners)}" fill="${CATEGORY_COLOURS[product.category]}" stroke="${bad ? '#d11a1a' : '#333333'}" stroke-width="${n1(fs * (bad ? 0.3 : 0.1))}"/>`,
    );
    // Front marker: a dark band just inside the front edge.
    const w = variant.widthUm! / 1000;
    const dpt = variant.depthUm! / 1000;
    const inset = Math.min(fs * 0.25, dpt * 0.2);
    const ux = (bl.x - fl.x) / 1000 / dpt; // unit vector front -> back, plan space
    const uy = (bl.y - fl.y) / 1000 / dpt;
    const f1 = { x: sx(fl.x) + ux * inset, y: sy(fl.y) - uy * inset };
    const f2 = { x: sx(fr.x) + ux * inset, y: sy(fr.y) - uy * inset };
    body.push(`<line x1="${n1(f1.x)}" y1="${n1(f1.y)}" x2="${n1(f2.x)}" y2="${n1(f2.y)}" stroke="#1d3557" stroke-width="${n1(inset)}" stroke-opacity="0.75"/>`);
    // Label: the product letter, and the footprint size when there is room. Text runs along the long side.
    const cx = sx(placement.center.x);
    const cy = sy(placement.center.y);
    const long = Math.max(w, dpt);
    const short = Math.min(w, dpt);
    const along = w >= dpt ? { x: br.x - bl.x, y: br.y - bl.y } : { x: fl.x - bl.x, y: fl.y - bl.y };
    let angle = (-Math.atan2(along.y, along.x) * 180) / Math.PI;
    if (angle > 90 || angle <= -90) angle += angle > 0 ? -180 : 180;
    const size = `${num(variant.widthUm!, unit)}×${num(variant.depthUm!, unit)}`;
    const codeSize = Math.min(fs * 1.1, short * 0.5, long * 0.4);
    const sizeFont = Math.min(fs * 0.62, short * 0.22, (long * 0.9) / (size.length * 0.6));
    const twoLines = short >= codeSize + sizeFont * 1.6 && sizeFont >= fs * 0.4;
    const t = `transform="rotate(${n1(angle)} ${n1(cx)} ${n1(cy)})"`;
    body.push(
      `<text data-label-for="${esc(placement.id)}" x="${n1(cx)}" y="${n1(cy - (twoLines ? sizeFont * 0.55 : 0))}" font-size="${n1(codeSize)}" font-weight="bold" fill="#1b1b1b" text-anchor="middle" dominant-baseline="central" ${t}>${d.code}${product.verification === 'verified' ? '' : '*'}</text>`,
    );
    if (twoLines) {
      body.push(
        `<text x="${n1(cx)}" y="${n1(cy + codeSize * 0.6)}" font-size="${n1(sizeFont)}" fill="#1b1b1b" text-anchor="middle" dominant-baseline="central" ${t}>${esc(size)}</text>`,
      );
    }
  }

  // ---- measured aisles
  (overlays.aisles ?? []).forEach((aisle) => {
    const a = { x: sx(aisle.from.x), y: sy(aisle.from.y) };
    const b = { x: sx(aisle.to.x), y: sy(aisle.to.y) };
    const colour = aisle.kind === 'main' ? '#0b6e4f' : '#3a7ca5';
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const px = (-(b.y - a.y) / l) * fs * 0.35;
    const py = ((b.x - a.x) / l) * fs * 0.35;
    body.push(`<line data-aisle="${aisle.kind}" data-width-um="${Math.round(aisle.widthUm)}" x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="${colour}" stroke-width="${n1(fs * 0.09)}"/>`);
    for (const e of [a, b]) {
      body.push(`<line x1="${n1(e.x - px)}" y1="${n1(e.y - py)}" x2="${n1(e.x + px)}" y2="${n1(e.y + py)}" stroke="${colour}" stroke-width="${n1(fs * 0.09)}"/>`);
    }
    const label = `${aisle.label ?? (aisle.kind === 'main' ? 'main aisle' : 'aisle')} ${len(aisle.widthUm, unit)}`;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const tw = label.length * fs * 0.4;
    body.push(`<rect x="${n1(mx - tw / 2)}" y="${n1(my - fs * 0.5)}" width="${n1(tw)}" height="${n1(fs)}" fill="#ffffff" fill-opacity="0.85"/>`);
    body.push(`<text x="${n1(mx)}" y="${n1(my)}" font-size="${n1(fs * 0.68)}" fill="${colour}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`);
  });

  // ---- side panel
  const panelX = originX + roomW + margin;
  const maxChars = Math.floor(panelW / (fs * 0.42));
  const panel: string[] = [];
  let py = originY;
  const heading = (text: string): void => {
    py += fs * 0.6;
    panel.push(`<text x="${n1(panelX)}" y="${n1(py)}" font-size="${n1(fs * 0.95)}" font-weight="bold" fill="#1b1b1b">${esc(text)}</text>`);
    py += fs * 1.35;
  };
  const line = (text: string, colour = '#333333', indent = 0): void => {
    for (const piece of wrap(text, maxChars - Math.round(indent / (fs * 0.42)))) {
      panel.push(`<text x="${n1(panelX + indent)}" y="${n1(py)}" font-size="${n1(fs * 0.75)}" fill="${colour}">${esc(piece)}</text>`);
      py += fs * 1.05;
    }
  };
  const swatch = (colour: string, opacity = 1): void => {
    panel.push(`<rect x="${n1(panelX)}" y="${n1(py - fs * 0.7)}" width="${n1(fs * 1.1)}" height="${n1(fs * 0.8)}" fill="${colour}" fill-opacity="${opacity}" stroke="#333333" stroke-width="${n1(fs * 0.05)}"/>`);
  };

  if (drawn.length > 0) {
    heading('Fixtures');
    const seen = new Set<string>();
    for (const d of [...drawn].sort((a, b) => (a.code.length - b.code.length) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))) {
      if (seen.has(d.code)) continue;
      seen.add(d.code);
      const count = drawn.filter((o) => o.code === d.code).length;
      const dims = [d.variant.widthUm!, d.variant.depthUm!, ...(d.variant.heightUm === null ? [] : [d.variant.heightUm])]
        .map((v) => num(v, unit))
        .join(' × ');
      const marks = [
        d.product.testOnly ? 'TEST' : '',
        d.product.verification === 'unverified' ? '* unverified' : '',
        d.product.flags.some((flag) => /assumed/i.test(flag)) ? 'size assumed' : '',
      ].filter((m) => m !== '');
      swatch(CATEGORY_COLOURS[d.product.category]);
      const name = d.product.testOnly && !d.product.name.startsWith('TEST') ? `TEST ${d.product.name}` : d.product.name;
      line(`${d.code}  ${count} × ${name}`, '#1b1b1b', fs * 1.6);
      line(`${dims} ${unit}${marks.length > 0 ? `  [${marks.join(', ')}]` : ''}`, '#666666', fs * 1.6);
      py += fs * 0.25;
    }
    line('Dark band = front (customer side). Sizes are width × depth × height.', '#666666');
  }
  if (zoneKinds.length > 0) {
    heading('Keep clear');
    for (const kind of [...zoneKinds].sort()) {
      swatch(ZONE_COLOURS[kind] ?? '#999999', 0.35);
      line(ZONE_NAMES[kind] ?? kind, '#333333', fs * 1.6);
    }
  }
  if ((overlays.accessZones ?? []).length > 0) {
    swatch('#4a90d9', 0.2);
    line('Aisle / access space in front of fixtures', '#333333', fs * 1.6);
  }
  if ((overlays.scoreLines ?? []).length > 0) {
    heading('Why this option');
    for (const text of overlays.scoreLines!) line(text);
  }
  if ((overlays.unplaced ?? []).length > 0) {
    heading('Did not fit');
    for (const u of overlays.unplaced!) {
      line(`${u.quantity} × ${u.name}`, '#b3261e');
      line(u.reason, '#555555', fs * 0.8);
      py += fs * 0.2;
    }
  }
  if ((overlays.violations ?? []).length > 0) {
    heading('Problems');
    for (const v of overlays.violations!) line(`• ${v.message}`, '#d11a1a');
  }

  // ---- title block and scale bar
  const head: string[] = [];
  const title = overlays.title ?? doc.name;
  const rank = overlays.rank === undefined ? '' : `Option ${overlays.rank} — `;
  head.push(`<text x="${n1(margin)}" y="${n1(fs * 2.4)}" font-size="${n1(fs * 1.5)}" font-weight="bold" fill="#111111">${esc(rank + title)}</text>`);
  const facts = [
    `Floor area ${(areaMm2(room.outline) / 1e6).toFixed(2)} m²`,
    `${drawn.length} fixture${drawn.length === 1 ? '' : 's'}`,
    ...(overlays.subtitle === undefined ? [] : [overlays.subtitle]),
  ].join('  ·  ');
  head.push(`<text x="${n1(margin)}" y="${n1(fs * 4.1)}" font-size="${n1(fs * 0.85)}" fill="#444444">${esc(facts)}</text>`);
  if (drawn.some((d) => d.product.verification !== 'verified')) {
    head.push(`<text x="${n1(margin)}" y="${n1(fs * (hasTestOnly ? 6.6 : 5.4))}" font-size="${n1(fs * 0.8)}" fill="#8a5a00">Sizes marked * are from the website and not yet confirmed by the owner.</text>`);
  }
  if (hasTestOnly) {
    head.push(`<text x="${n1(margin)}" y="${n1(fs * 5.4)}" font-size="${n1(fs * 0.85)}" font-weight="bold" fill="#b3261e">Contains test-only fixtures (not real products)</text>`);
  }
  const barY = originY + roomH + margin * 0.75;
  body.push(`<line x1="${n1(originX)}" y1="${n1(barY)}" x2="${n1(originX + 1000)}" y2="${n1(barY)}" stroke="#111111" stroke-width="${n1(fs * 0.18)}"/>`);
  body.push(`<text x="${n1(originX + 1000 + fs * 0.5)}" y="${n1(barY)}" font-size="${n1(fs * 0.75)}" fill="#111111" dominant-baseline="central">${esc(len(1_000_000, unit))}</text>`);

  const width = panelX + panelW + margin * 0.5;
  const height = Math.max(originY + roomH + margin * 1.3, py + margin * 0.5);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n1(width)} ${n1(height)}" width="${n1(width)}mm" height="${n1(height)}mm" font-family="DejaVu Sans, Arial, sans-serif">`,
    `<rect x="0" y="0" width="${n1(width)}" height="${n1(height)}" fill="#ffffff"/>`,
    ...head,
    ...body,
    ...panel,
    '</svg>',
    '',
  ].join('\n');
}
