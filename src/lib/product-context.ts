import { copyScopeQueryParams } from "@/lib/filter-params";
import { PRODUCT_INTEL_NAV_PARAMS } from "@/lib/product-intelligence-nav";

/** Routes that participate in persistent product context (Sprint 6.46.6). */
export const PRODUCT_CONTEXT_PATHS = [
  "/analytics/products",
  "/analytics/pricing",
  "/purchases",
  "/costs",
] as const;

export type ProductContext = {
  sku: string;
  productId: string;
  productName: string;
  nmId: number | null;
};

export function isProductContextPath(pathname: string): boolean {
  return PRODUCT_CONTEXT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/** Read active product context from URL search params. */
export function readProductContext(
  source: Pick<URLSearchParams, "get">
): ProductContext | null {
  const sku = source.get(PRODUCT_INTEL_NAV_PARAMS.sku)?.trim() ?? "";
  const productId = source.get(PRODUCT_INTEL_NAV_PARAMS.product)?.trim() ?? "";
  if (!sku && !productId) return null;

  const productName = source.get(PRODUCT_INTEL_NAV_PARAMS.productName)?.trim() ?? "";
  const nmIdRaw = source.get(PRODUCT_INTEL_NAV_PARAMS.nmId);
  const nmIdParsed = nmIdRaw ? Number(nmIdRaw) : NaN;
  const nmId =
    Number.isFinite(nmIdParsed) && nmIdParsed > 0 ? Math.trunc(nmIdParsed) : null;

  return { sku, productId, productName, nmId };
}

export function hasProductContext(source: Pick<URLSearchParams, "get">): boolean {
  return readProductContext(source) !== null;
}

/** Copy product context keys into a target query string. */
export function copyProductContextParams(
  target: URLSearchParams,
  source: Pick<URLSearchParams, "get">
): void {
  const ctx = readProductContext(source);
  if (!ctx) return;
  if (ctx.sku) target.set(PRODUCT_INTEL_NAV_PARAMS.sku, ctx.sku);
  if (ctx.productId) target.set(PRODUCT_INTEL_NAV_PARAMS.product, ctx.productId);
  if (ctx.productName) target.set(PRODUCT_INTEL_NAV_PARAMS.productName, ctx.productName);
  if (ctx.nmId != null) target.set(PRODUCT_INTEL_NAV_PARAMS.nmId, String(ctx.nmId));
}

/** Remove all product context keys from a query string. */
export function stripProductContextParams(params: URLSearchParams): void {
  for (const key of Object.values(PRODUCT_INTEL_NAV_PARAMS)) {
    params.delete(key);
  }
}

/**
 * Build sidebar / cross-module href preserving scope and (when destination supports it) product context.
 */
export function buildNavHrefWithContext(
  base: string,
  source: Pick<URLSearchParams, "get">
): string {
  const params = new URLSearchParams();
  copyScopeQueryParams(params, source);
  if (isProductContextPath(base)) {
    copyProductContextParams(params, source);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** Inventory Intelligence entry point with scope only (pick a different product). */
export function buildChangeProductHref(source: Pick<URLSearchParams, "get">): string {
  const params = new URLSearchParams();
  copyScopeQueryParams(params, source);
  const query = params.toString();
  return query ? `/inventory/intelligence?${query}` : "/inventory/intelligence";
}

export function formatProductContextLabel(ctx: ProductContext): string {
  if (ctx.sku && ctx.productName) return `${ctx.sku} • ${ctx.productName}`;
  if (ctx.sku) return ctx.sku;
  if (ctx.productName) return ctx.productName;
  return "Selected product";
}
