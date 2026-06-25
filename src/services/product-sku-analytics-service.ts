import {
  buildSkuDisplayRows,
  collectCatalogVariantGroups,
} from "@/lib/product-sku-analytics";
import {
  buildBarcodeToTechSizeMap,
  dedupeVariantsBySize,
  enrichRowsWithTechSize,
  hasRowSizeData,
  toProductVariantsFromApi,
} from "@/lib/product-variant-resolve";
import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { WbApiClient } from "@/lib/wildberries/api-client";
import { isWithinDateRange, mapApiProductVariants, toDateString } from "@/lib/wildberries/mappers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchProductsWithRelations } from "@/services/dashboard-service";
import { syncStockForProduct } from "@/services/stock-service";
import type {
  Database,
  DateRange,
  ProductSkuAnalyticsResponse,
  ProductVariant,
  ProductWithRelations,
  WbOrder,
  WbSale,
} from "@/types/database";

async function fetchOrdersForProduct(
  productId: string,
  range: DateRange
): Promise<WbOrder[]> {
  const client = createServerClient();
  const { data, error } = await client
    .from("wb_orders")
    .select("*")
    .eq("product_id", productId)
    .gte("order_date", range.from)
    .lte("order_date", range.to);

  if (error) throw new Error(`Failed to fetch product orders: ${error.message}`);
  return (data ?? []) as WbOrder[];
}

async function fetchSalesForProduct(
  productId: string,
  range: DateRange
): Promise<WbSale[]> {
  const client = createServerClient();
  const { data, error } = await client
    .from("wb_sales")
    .select("*")
    .eq("product_id", productId)
    .gte("sale_date", range.from)
    .lte("sale_date", range.to);

  if (error) throw new Error(`Failed to fetch product sales: ${error.message}`);
  return (data ?? []) as WbSale[];
}

async function fetchVariants(productId: string): Promise<ProductVariant[]> {
  const client = createServerClient();
  const { data, error } = await client
    .from("product_variants")
    .select("*")
    .eq("product_id", productId);

  if (error) {
    if (error.message.includes("product_variants")) return [];
    throw new Error(`Failed to fetch variants: ${error.message}`);
  }
  return dedupeVariantsBySize((data ?? []) as ProductVariant[]);
}

async function ensureProductVariants(
  product: ProductWithRelations,
  existing: ProductVariant[],
  client: SupabaseClient<Database>
): Promise<ProductVariant[]> {
  if (existing.some((variant) => variant.tech_size?.trim())) {
    return existing;
  }

  try {
    const api = new WbApiClient();
    const card = await api.fetchProductCardByVendorCode(product.supplier_article);
    if (!card?.sizes?.length) return existing;

    const fromApi = dedupeVariantsBySize(toProductVariantsFromApi(card, String(product.id)));
    const upserts = mapApiProductVariants(card, String(product.id));
    if (upserts.length) {
      const { error } = await client.from("product_variants").upsert(upserts, {
        onConflict: "product_id,tech_size,barcode",
      });
      if (error && !error.message.includes("product_variants")) {
        throw error;
      }
    }

    if (fromApi.length) return fromApi;
  } catch {
    // WB catalog unavailable — fall back to DB rows only.
  }

  return existing;
}

function buildOrderSizeLookupFromWbApi(
  rows: Awaited<ReturnType<WbApiClient["fetchOrders"]>>,
  nmId: number,
  range: DateRange
): Map<string, { tech_size: string | null; barcode: string | null }> {
  const map = new Map<string, { tech_size: string | null; barcode: string | null }>();

  for (const row of rows) {
    if (row.nmId !== nmId) continue;
    if (!isWithinDateRange(toDateString(row.date), range.from, range.to)) continue;

    const srid = row.srid ?? row.gNumber ?? `${row.nmId}-${row.date}`;
    map.set(srid, {
      tech_size: row.techSize ?? null,
      barcode: row.barcode ?? null,
    });
  }

  return map;
}

function buildSaleSizeLookupFromWbApi(
  rows: Awaited<ReturnType<WbApiClient["fetchSales"]>>,
  nmId: number,
  range: DateRange
): Map<string, { tech_size: string | null; barcode: string | null }> {
  const map = new Map<string, { tech_size: string | null; barcode: string | null }>();

  for (const row of rows) {
    if (row.nmId !== nmId) continue;
    if (!isWithinDateRange(toDateString(row.date), range.from, range.to)) continue;

    const srid = row.srid ?? row.saleID;
    map.set(srid, {
      tech_size: row.techSize ?? null,
      barcode: row.barcode ?? null,
    });
  }

  return map;
}

async function attachSizesFromWbApi(
  product: ProductWithRelations,
  range: DateRange,
  orders: WbOrder[],
  sales: WbSale[]
): Promise<{ orders: WbOrder[]; sales: WbSale[] }> {
  if (hasRowSizeData(orders) || hasRowSizeData(sales)) {
    return { orders, sales };
  }

  try {
    const api = new WbApiClient();
    const [apiOrders, apiSales] = await Promise.all([
      api.fetchOrders(range.from),
      api.fetchSales(range.from),
    ]);

    const orderSizes = buildOrderSizeLookupFromWbApi(apiOrders, product.nm_id, range);
    const saleSizes = buildSaleSizeLookupFromWbApi(apiSales, product.nm_id, range);

    return {
      orders: orders.map((order) => {
        const sized = orderSizes.get(order.srid);
        if (!sized) return order;
        return {
          ...order,
          tech_size: order.tech_size ?? sized.tech_size,
          barcode: order.barcode ?? sized.barcode,
        };
      }),
      sales: sales.map((sale) => {
        const sized = saleSizes.get(sale.srid);
        if (!sized) return sale;
        return {
          ...sale,
          tech_size: sale.tech_size ?? sized.tech_size,
          barcode: sale.barcode ?? sized.barcode,
        };
      }),
    };
  } catch {
    return { orders, sales };
  }
}

async function resolveSkuSizedRows(
  product: ProductWithRelations,
  range: DateRange,
  orders: WbOrder[],
  sales: WbSale[],
  variants: ProductVariant[]
): Promise<{ orders: WbOrder[]; sales: WbSale[]; variants: ProductVariant[] }> {
  let sizedOrders = orders;
  let sizedSales = sales;

  sizedOrders = enrichRowsWithTechSize(sizedOrders, buildBarcodeToTechSizeMap(variants));
  sizedSales = enrichRowsWithTechSize(sizedSales, buildBarcodeToTechSizeMap(variants));

  if (!hasRowSizeData(sizedOrders) && !hasRowSizeData(sizedSales)) {
    const fromApi = await attachSizesFromWbApi(product, range, orders, sales);
    sizedOrders = fromApi.orders;
    sizedSales = fromApi.sales;
    sizedOrders = enrichRowsWithTechSize(sizedOrders, buildBarcodeToTechSizeMap(variants));
    sizedSales = enrichRowsWithTechSize(sizedSales, buildBarcodeToTechSizeMap(variants));
  }

  return { orders: sizedOrders, sales: sizedSales, variants };
}

export async function getProductSkuAnalytics(
  productId: string,
  range: DateRange,
  _cohortMaxOrders: number
): Promise<ProductSkuAnalyticsResponse | null> {
  const startedAt = Date.now();
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = createServerClient();
  const products = await fetchProductsWithRelations(client);
  const normalizedProductId = String(productId);
  const product = products.find((p) => String(p.id) === normalizedProductId);
  if (!product) return null;

  const [dbOrders, dbSales, dbVariants] = await Promise.all([
    fetchOrdersForProduct(normalizedProductId, range),
    fetchSalesForProduct(normalizedProductId, range),
    fetchVariants(normalizedProductId),
  ]);

  const variants = await ensureProductVariants(product, dbVariants, client);

  let stockRows: Awaited<ReturnType<typeof syncStockForProduct>> = [];
  try {
    stockRows = await syncStockForProduct(normalizedProductId, product.nm_id, client);
  } catch {
    stockRows = [];
  }

  const { orders, sales } = await resolveSkuSizedRows(
    product,
    range,
    dbOrders,
    dbSales,
    variants
  );

  const groups = collectCatalogVariantGroups(variants);
  const skus = buildSkuDisplayRows(groups, orders, sales, stockRows);

  return {
    productId: normalizedProductId,
    supplierArticle: product.supplier_article,
    skus,
    loadTimeMs: Date.now() - startedAt,
  };
}

export async function getCohortMaxOrders(_range: DateRange): Promise<number> {
  const client = createServerClient();
  const { data, error } = await client.from("wb_orders").select("quantity, product_id");
  if (error) return 0;

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    const key = String(row.product_id);
    totals.set(key, (totals.get(key) ?? 0) + Number(row.quantity ?? 0));
  }
  return Math.max(0, ...Array.from(totals.values()));
}
