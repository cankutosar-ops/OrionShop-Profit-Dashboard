import type { MarketplaceType } from "@/types/database";

/** Default marketplace commission when no category override is configured. */
export const DEFAULT_COMMISSION_PERCENT_BY_MARKETPLACE: Record<MarketplaceType, number> = {
  wildberries: 20,
  ozon: 15,
  lamoda: 25,
};

/**
 * Optional category-level commission overrides (category id → percent).
 * Extend when category commission is stored in the database.
 */
const CATEGORY_COMMISSION_PERCENT: Record<string, number> = {};

export function resolveCommissionPercent(params: {
  marketplace: MarketplaceType;
  categoryId?: string | null;
}): number {
  const categoryId = params.categoryId ? String(params.categoryId) : null;
  if (categoryId && categoryId in CATEGORY_COMMISSION_PERCENT) {
    return CATEGORY_COMMISSION_PERCENT[categoryId];
  }

  return DEFAULT_COMMISSION_PERCENT_BY_MARKETPLACE[params.marketplace] ?? 20;
}
