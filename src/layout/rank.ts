/**
 * The order of the options (owner ruling, decisions/0003 point 5): the key is the fixtures placed
 * plus one for a complete checkout block, highest first; on a tie a complete block first, then the
 * higher score, then the strategy id. A total order, so sorting never depends on the input order.
 */
import type { Product } from '../core/index';
import type { LayoutOption, LayoutRequest } from './types';

export type RankFacts = { placed: number; completeBlock: boolean; score: number; strategyId: string };

const isGlassShowcase = (p: Product | undefined): boolean => p?.category === 'showcase' && p.placement === 'freestanding';

/** What the ranking looks at in an option. A complete block: the counter and every requested glass showcase in it. */
export function rankFacts(option: Pick<LayoutOption, 'document' | 'cashWrap' | 'score' | 'strategy'>, request: LayoutRequest): RankFacts {
  const productOf = (placementId: string): Product | undefined => {
    const placement = option.document.placements.find((p) => p.id === placementId);
    return option.document.products.find((p) => p.id === placement?.productId);
  };
  const counterWanted = request.items.some((i) => i.product.placement === 'counter' && i.quantity > 0);
  const showcasesWanted = request.items.filter((i) => isGlassShowcase(i.product)).reduce((n, i) => n + Math.max(0, i.quantity), 0);
  const inBlock = option.cashWrap.map(productOf);
  const completeBlock = counterWanted && inBlock.some((p) => p?.placement === 'counter') && inBlock.filter(isGlassShowcase).length === showcasesWanted;
  return { placed: option.document.placements.length, completeBlock, score: option.score, strategyId: option.strategy.id };
}

const key = (f: RankFacts): number => f.placed + (f.completeBlock ? 1 : 0);

export function compareOptions(a: RankFacts, b: RankFacts): number {
  return (
    key(b) - key(a) ||
    Number(b.completeBlock) - Number(a.completeBlock) ||
    b.score - a.score ||
    (a.strategyId < b.strategyId ? -1 : a.strategyId > b.strategyId ? 1 : 0)
  );
}
