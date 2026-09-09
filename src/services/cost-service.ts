import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { pickLatestCostHistoryByProductId } from "@/lib/cost-history-resolution";
import type { CostTemplateRow, ParsedCostImportRow } from "@/lib/cost-excel";
import { fetchSalesInRange } from "@/services/persisted-query-service";
import { getCurrentStockByProductId } from "@/services/inventory-report-service";
import type {
  CostManagementRow,
  CostRecord,
  ProductCostHistory,
  ProductOption,
  ScopedDateRange,
} from "@/types/database";

type CostRowWithProduct = ProductCostHistory & {
  product: { supplier_article: string; name: string } | null;
};

function dayBefore(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function dayAfter(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Ensures new cost rows supersede prior rows in Product Analytics (strictly later effective_from). */
async function resolveNextEffectiveFrom(
  supabase: SupabaseClient,
  productId: string
): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("product_cost_history")
    .select("effective_from")
    .eq("product_id", productId)
    .order("effective_from", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to resolve effective date: ${error.message}`);
  }

  const latest = data?.[0]?.effective_from;
  if (!latest || latest < today) return today;
  return dayAfter(latest);
}

function buildAverageSalePriceByProductId(
  sales: Awaited<ReturnType<typeof fetchSalesInRange>>
): Map<string, number> {
  const revenueByProduct = new Map<string, number>();
  const unitsByProduct = new Map<string, number>();

  for (const sale of sales) {
    if (sale.is_return || !sale.product_id) continue;
    const productId = String(sale.product_id);
    revenueByProduct.set(productId, (revenueByProduct.get(productId) ?? 0) + sale.revenue);
    unitsByProduct.set(productId, (unitsByProduct.get(productId) ?? 0) + sale.quantity);
  }

  const prices = new Map<string, number>();
  for (const [productId, revenue] of revenueByProduct) {
    const units = unitsByProduct.get(productId) ?? 0;
    if (units > 0) prices.set(productId, revenue / units);
  }

  return prices;
}

export async function fetchCostManagementRow(
  productId: string,
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<CostManagementRow | null> {
  const rows = await fetchCostManagementRows(scope, client);
  return rows.find((row) => row.productId === productId) ?? null;
}

export async function fetchCostManagementRows(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<CostManagementRow[]> {
  const supabase = await getReadClient(client);
  const marketplaceAccountId = scope.marketplaceAccountId;

  const [products, costs, stockByProductId, sales] = await Promise.all([
    fetchProductOptions(marketplaceAccountId, supabase),
    fetchCostRecords(marketplaceAccountId, supabase),
    getCurrentStockByProductId(marketplaceAccountId),
    fetchSalesInRange(scope, supabase),
  ]);

  const costByProductId = new Map(costs.map((row) => [row.product_id, row.cost]));
  const salePriceByProductId = buildAverageSalePriceByProductId(sales);

  return products.map((product) => ({
    productId: product.id,
    supplierArticle: product.supplier_article,
    productName: product.name,
    currentStock: stockByProductId.get(product.id) ?? 0,
    currentSalePrice: salePriceByProductId.get(product.id) ?? null,
    currentPurchasePrice: costByProductId.get(product.id) ?? null,
  }));
}

export async function updateProductPurchaseCost(
  productId: string,
  cost: number,
  scope: ScopedDateRange
): Promise<CostManagementRow> {
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error("cost must be a non-negative number");
  }

  const supabase = createAdminClient();
  const marketplaceAccountId = scope.marketplaceAccountId;
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, supplier_article, marketplace_account_id")
    .eq("id", productId)
    .maybeSingle();

  if (productError) throw new Error(`Failed to resolve product: ${productError.message}`);
  if (!product) throw new Error("Product not found");
  if (String(product.marketplace_account_id) !== String(marketplaceAccountId)) {
    throw new Error("Product does not belong to the selected marketplace account");
  }

  const currentCosts = await fetchCostRecords(marketplaceAccountId, supabase);
  const current = currentCosts.find((row) => row.product_id === productId);
  if (current && current.cost === cost) {
    const row = await fetchCostManagementRow(productId, scope, supabase);
    if (!row) throw new Error("Failed to load product row");
    return row;
  }

  const effectiveFrom = await resolveNextEffectiveFrom(supabase, productId);
  await insertCostHistoryRow(supabase, productId, { cost, effective_from: effectiveFrom });

  const row = await fetchCostManagementRow(productId, scope, supabase);
  if (!row) throw new Error("Failed to load updated product row");
  return row;
}

function mapActiveCostRecord(row: CostRowWithProduct): CostRecord {
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    cost: Number(row.cost),
    effective_from: row.effective_from,
    last_updated: row.created_at,
    supplier_article: row.product?.supplier_article ?? "—",
    product_name: row.product?.name ?? "Unknown",
  };
}

function pickLatestPerProduct(rows: CostRowWithProduct[]): CostRowWithProduct[] {
  return Array.from(pickLatestCostHistoryByProductId(rows).values());
}

async function getReadClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createServerClient());
}

export async function fetchCostRecords(
  marketplaceAccountId?: string,
  client?: SupabaseClient
): Promise<CostRecord[]> {
  const supabase = await getReadClient(client);

  let query = supabase
    .from("product_cost_history")
    .select("*, product:products!inner(supplier_article, name, marketplace_account_id)")
    .order("effective_from", { ascending: false });

  if (marketplaceAccountId) {
    query = query.eq("product.marketplace_account_id", marketplaceAccountId);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to fetch costs: ${error.message}`);

  const latestRows = pickLatestPerProduct((data ?? []) as CostRowWithProduct[]);

  return latestRows
    .map(mapActiveCostRecord)
    .sort((a, b) => a.supplier_article.localeCompare(b.supplier_article));
}

export async function fetchProductOptions(
  marketplaceAccountId?: string,
  client?: SupabaseClient
): Promise<ProductOption[]> {
  const supabase = await getReadClient(client);

  let query = supabase
    .from("products")
    .select("id, supplier_article, name")
    .order("supplier_article");

  if (marketplaceAccountId) {
    query = query.eq("marketplace_account_id", marketplaceAccountId);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    supplier_article: row.supplier_article,
    name: row.name,
  }));
}

async function resolveProductIdBySupplierArticle(
  supplierArticle: string,
  client: SupabaseClient,
  marketplaceAccountId?: string
): Promise<string> {
  let query = client
    .from("products")
    .select("id")
    .eq("supplier_article", supplierArticle.trim());
  if (marketplaceAccountId) {
    query = query.eq("marketplace_account_id", marketplaceAccountId);
  }
  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(`Failed to resolve product: ${error.message}`);
  if (!data) throw new Error(`Product not found for supplier article "${supplierArticle}"`);

  return String(data.id);
}

async function resolveProductIdFromHistoryId(
  historyId: string,
  client: SupabaseClient,
  marketplaceAccountId?: string
): Promise<string> {
  const { data, error } = await client
    .from("product_cost_history")
    .select("product_id, product:products!inner(marketplace_account_id)")
    .eq("id", historyId)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve cost record: ${error.message}`);
  if (!data) throw new Error("Cost record not found");

  const costRow = data as {
    product_id: string | number;
    product: { marketplace_account_id?: string | number } | null;
  };

  if (marketplaceAccountId) {
    const accountId = costRow.product?.marketplace_account_id;
    if (String(accountId) !== String(marketplaceAccountId)) {
      throw new Error("Cost record does not belong to the selected marketplace account");
    }
  }

  return String(costRow.product_id);
}

/** Close open history rows superseded by a newer effective_from. */
async function closeSupersededCostPeriods(
  supabase: SupabaseClient,
  productId: string,
  newEffectiveFrom: string
): Promise<void> {
  const { data: openRows, error: fetchError } = await supabase
    .from("product_cost_history")
    .select("id, effective_from")
    .eq("product_id", productId)
    .is("effective_to", null)
    .lt("effective_from", newEffectiveFrom);

  if (fetchError) {
    throw new Error(`Failed to close previous cost periods: ${fetchError.message}`);
  }

  const effectiveTo = dayBefore(newEffectiveFrom);

  for (const row of openRows ?? []) {
    const { error } = await supabase
      .from("product_cost_history")
      .update({ effective_to: effectiveTo })
      .eq("id", row.id);

    if (error) {
      throw new Error(`Failed to close previous cost period: ${error.message}`);
    }
  }
}

async function insertCostHistoryRow(
  supabase: SupabaseClient,
  productId: string,
  input: { cost: number; effective_from: string }
): Promise<CostRecord> {
  await closeSupersededCostPeriods(supabase, productId, input.effective_from);

  const { data, error } = await supabase
    .from("product_cost_history")
    .insert({
      product_id: productId,
      cost: input.cost,
      effective_from: input.effective_from,
    })
    .select("*, product:products(supplier_article, name)")
    .single();

  if (error) throw new Error(`Failed to create cost: ${error.message}`);

  return mapActiveCostRecord(data as CostRowWithProduct);
}

/** Used by purchase import — appends product_cost_history without changing PA logic. */
export async function recordProductCostHistory(
  productId: string,
  input: { cost: number; effective_from: string },
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? createAdminClient();
  await insertCostHistoryRow(supabase, productId, input);
}

export type CostInput = {
  supplier_article: string;
  cost: number;
  effective_from: string;
};

export async function createCostRecord(
  input: CostInput,
  marketplaceAccountId: string
): Promise<CostRecord> {
  const supabase = createAdminClient();
  const productId = await resolveProductIdBySupplierArticle(
    input.supplier_article,
    supabase,
    marketplaceAccountId
  );
  return insertCostHistoryRow(supabase, productId, {
    cost: input.cost,
    effective_from: input.effective_from,
  });
}

/** Append a new history row; never overwrites existing cost values. */
export async function appendCostRecordChange(
  id: string,
  input: { cost: number; effective_from: string },
  marketplaceAccountId: string
): Promise<CostRecord> {
  const supabase = createAdminClient();
  const productId = await resolveProductIdFromHistoryId(id, supabase, marketplaceAccountId);
  return insertCostHistoryRow(supabase, productId, input);
}

export type BulkCostRow = CostInput & { row: number };

export type BulkImportResult = {
  /** Products that received a new cost history row. */
  inserted: number;
  skippedUnchanged: number;
  skippedBlank: number;
  errors: { row: number; message: string }[];
};

export async function buildCostTemplateRows(
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<CostTemplateRow[]> {
  const [products, costs] = await Promise.all([
    fetchProductOptions(marketplaceAccountId, client),
    fetchCostRecords(marketplaceAccountId, client),
  ]);

  const costByArticle = new Map(costs.map((row) => [row.supplier_article.trim(), row.cost]));

  return products.map((product) => ({
    supplier_article: product.supplier_article,
    unit_cost: costByArticle.get(product.supplier_article.trim()) ?? null,
  }));
}

export async function bulkImportCostRecords(
  rows: ParsedCostImportRow[],
  marketplaceAccountId: string
): Promise<BulkImportResult> {
  const supabase = createAdminClient();
  const [products, currentCosts] = await Promise.all([
    fetchProductOptions(marketplaceAccountId, supabase),
    fetchCostRecords(marketplaceAccountId, supabase),
  ]);

  const productByArticle = new Map(
    products.map((product) => [product.supplier_article.trim(), product.id])
  );
  const costByArticle = new Map(
    currentCosts.map((row) => [row.supplier_article.trim(), row.cost])
  );

  const result: BulkImportResult = {
    inserted: 0,
    skippedUnchanged: 0,
    skippedBlank: 0,
    errors: [],
  };

  for (const row of rows) {
    if (row.new_cost === null) {
      result.skippedBlank += 1;
      continue;
    }

    const supplierArticle = row.supplier_article.trim();
    const productId = productByArticle.get(supplierArticle);
    if (!productId) {
      result.errors.push({
        row: row.row,
        message: `Product not found for supplier article "${supplierArticle}"`,
      });
      continue;
    }

    const currentCost = costByArticle.get(supplierArticle);
    if (currentCost !== undefined && currentCost === row.new_cost) {
      result.skippedUnchanged += 1;
      continue;
    }

    try {
      await insertCostHistoryRow(supabase, productId, {
        cost: row.new_cost,
        effective_from: row.effective_from ?? new Date().toISOString().split("T")[0],
      });
      result.inserted += 1;
      costByArticle.set(supplierArticle, row.new_cost);
    } catch (err) {
      result.errors.push({
        row: row.row,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}

/** @deprecated Prefer bulkImportCostRecords with an explicit marketplace account. */
export async function bulkCreateCostRecords(
  rows: BulkCostRow[],
  marketplaceAccountId: string
): Promise<BulkImportResult> {
  const supabase = createAdminClient();
  const result: BulkImportResult = {
    inserted: 0,
    skippedUnchanged: 0,
    skippedBlank: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      const productId = await resolveProductIdBySupplierArticle(
        row.supplier_article,
        supabase,
        marketplaceAccountId
      );
      await insertCostHistoryRow(supabase, productId, {
        cost: row.cost,
        effective_from: row.effective_from,
      });
      result.inserted += 1;
    } catch (err) {
      result.errors.push({
        row: row.row,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}
