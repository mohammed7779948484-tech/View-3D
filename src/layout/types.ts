/** Public types of the layout engine (re-exported by index.ts) and the search's order names. */
import type { DesignDocument, Product, Room } from '../core/index';
import type { Point } from '../geometry/index';
import type { PlanningConfig, RoomProblem } from '../rules/index';

// ---------------------------------------------------------------------------------------------
// Public types

export type LayoutItem = { product: Product; variantId: string; quantity: number };

export type LayoutRequest = {
  id: string;
  name: string;
  room: Room;
  items: LayoutItem[];
  config?: PlanningConfig;
  /** How many ranked options to return at most. Default 4. */
  maxOptions?: number;
};

export type ReasonCode =
  | 'unknown-size'
  | 'outside-room'
  | 'column'
  | 'blocked-door'
  | 'overlap'
  | 'window-blocked'
  | 'own-access'
  | 'blocks-access'
  | 'faces-door'
  | 'not-on-wall'
  | 'aisle-too-narrow'
  | 'unreachable'
  | 'main-aisle'
  | 'no-wall-long-enough'
  | 'needs-partner'
  | 'orphan';

export type Unplaced = {
  productId: string;
  variantId: string;
  name: string;
  quantity: number;
  /** Plain English: the causes most tried positions failed on. */
  reason: string;
  positionsTried: number;
  /** How many tried positions failed on each reason. */
  obstacles: Partial<Record<ReasonCode, number>>;
};

/**
 * One part of an option's score. `note` is the engine's English sentence; `code` and `values`
 * carry the same facts so the app can word them in any language and unit (lengths in um).
 */
export type ScoreTerm = { term: string; weight: number; value: number; points: number; note: string; code: string; values: Record<string, number> };

export type MeasuredAisle = { from: Point; to: Point; widthUm: number; kind: 'main' | 'secondary'; label: string };

export type LayoutStrategy = {
  id: string;
  description: string;
  /** Wall the checkout block stands at (with staff space between), or null without a counter. */
  counterWall: number | null;
  /** Island rows run along the entrance wall, or across the shop from front to back. */
  rows: 'along' | 'across';
  /** The placement order the search kept for this option. */
  walls: WallOrder;
  start: GridStart;
  islands: IslandOrder;
};

export type IslandRow = { index: number; placementIds: string[] };

export type LayoutOption = {
  rank: number;
  strategy: LayoutStrategy;
  score: number;
  scoreBreakdown: ScoreTerm[];
  document: DesignDocument;
  unplaced: Unplaced[];
  aisles: MeasuredAisle[];
  /** Island rows on the grid, in grid order; ids within a row run along the row. */
  rows: IslandRow[];
  /** Placement ids of the checkout block (counter and its showcases), in block order. */
  cashWrap: string[];
};

export type LayoutResult = {
  /** Ranked options, best first. Empty when the room has problems. */
  options: LayoutOption[];
  /** Why the room cannot be laid out (see `validateRoom`); empty for a sound room. */
  problems: RoomProblem[];
};

export type WallOrder = 'back-first' | 'front-first';
export type GridStart = 'far' | 'near';
export type IslandOrder = 'big-first' | 'small-first';
