import { copyScopeQueryParams } from "@/lib/filter-params";

/**
 * Deep-link query keys for Product Intelligence → destination pages
 * (Sprint 6.46.5 / 6.46.6). Scope keys come from FILTER_PARAMS via copyScopeQueryParams.
 */
export const PRODUCT_INTEL_NAV_PARAMS = {
  /** products.supplier_article — primary filter for search UIs */
  sku: "sku",
  /** products.id — selection / row expand */
  product: "product",
  /** products.nm_id — optional; destinations may ignore */
  nmId: "nm_id",
  /** Display label for product context banner (presentation only) */
  productName: "product_name",
} as const;

export type ProductIntelligenceNavTarget = {
  sku: string;
  productId: string;
  nmId?: number | null;
  productName?: string;
};

export type ProductIntelligenceNavHref = {
  label: string;
  href: string;
};

function appendProductKeys(
  params: URLSearchParams,
  target: ProductIntelligenceNavTarget
): void {
  const sku = target.sku.trim();
  if (sku) params.set(PRODUCT_INTEL_NAV_PARAMS.sku, sku);
  if (target.productId) params.set(PRODUCT_INTEL_NAV_PARAMS.product, target.productId);
  const name = target.productName?.trim();
  if (name) params.set(PRODUCT_INTEL_NAV_PARAMS.productName, name);
  if (target.nmId != null && Number.isFinite(target.nmId) && target.nmId > 0) {
    params.set(PRODUCT_INTEL_NAV_PARAMS.nmId, String(target.nmId));
  }
}

/** Build a destination href preserving current scope + product deep-link keys. */
export function buildProductIntelligenceHref(
  path: string,
  source: Pick<URLSearchParams, "get">,
  target: ProductIntelligenceNavTarget
): string {
  const params = new URLSearchParams();
  copyScopeQueryParams(params, source);
  appendProductKeys(params, target);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Quick Action destinations from the Product Intelligence drawer. */
export function buildProductIntelligenceQuickActions(
  source: Pick<URLSearchParams, "get">,
  target: ProductIntelligenceNavTarget
): ProductIntelligenceNavHref[] {
  return [
    {
      label: "Open Product Analytics",
      href: buildProductIntelligenceHref("/analytics/products", source, target),
    },
    {
      label: "Open Smart Pricing",
      href: buildProductIntelligenceHref("/analytics/pricing", source, target),
    },
    {
      label: "Open Purchases",
      href: buildProductIntelligenceHref("/purchases", source, target),
    },
    {
      label: "Open Product Cost",
      href: buildProductIntelligenceHref("/costs", source, target),
    },
  ];
}
