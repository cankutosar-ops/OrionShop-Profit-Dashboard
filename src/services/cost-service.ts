import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import type { CostRecord, ProductCostHistory, ProductOption } from "@/types/database";

type CostRowWithProduct = ProductCostHistory & {
  product: { supplier_article: string; name: string } | null;
};

function dayBefore(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
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
  const byProduct = new Map<string, CostRowWithProduct>();

  for (const row of rows) {
    const productId = String(row.product_id);
    const current = byProduct.get(productId);
    if (!current) {
      byProduct.set(productId, row);
      continue;
    }

    const byEffectiveFrom = row.effective_from.localeCompare(current.effective_from);
    if (byEffectiveFrom > 0) {
      byProduct.set(productId, row);
      continue;
    }
    if (byEffectiveFrom === 0 && row.created_at.localeCompare(current.created_at) > 0) {
      byProduct.set(productId, row);
    }
  }

  return Array.from(byProduct.values());
}

function getReadClient(client?: SupabaseClient): SupabaseClient {
  return client ?? createServerClient();
}

export async function fetchCostRecords(client?: SupabaseClient): Promise<CostRecord[]> {
  const supabase = getReadClient(client);

  const { data, error } = await supabase
    .from("product_cost_history")
    .select("*, product:products(supplier_article, name)")
    .order("effective_from", { ascending: false });

  if (error) throw new Error(`Failed to fetch costs: ${error.message}`);

  const latestRows = pickLatestPerProduct((data ?? []) as CostRowWithProduct[]);

  return latestRows
    .map(mapActiveCostRecord)
    .sort((a, b) => a.supplier_article.localeCompare(b.supplier_article));
}

export async function fetchProductOptions(client?: SupabaseClient): Promise<ProductOption[]> {
  const supabase = getReadClient(client);

  const { data, error } = await supabase
    .from("products")
    .select("id, supplier_article, name")
    .order("supplier_article");

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    supplier_article: row.supplier_article,
    name: row.name,
  }));
}

async function resolveProductIdBySupplierArticle(
  supplierArticle: string,
  client: SupabaseClient
): Promise<string> {
  const { data, error } = await client
    .from("products")
    .select("id")
    .eq("supplier_article", supplierArticle.trim())
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve product: ${error.message}`);
  if (!data) throw new Error(`Product not found for supplier article "${supplierArticle}"`);

  return String(data.id);
}

async function resolveProductIdFromHistoryId(
  historyId: string,
  client: SupabaseClient
): Promise<string> {
  const { data, error } = await client
    .from("product_cost_history")
    .select("product_id")
    .eq("id", historyId)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve cost record: ${error.message}`);
  if (!data) throw new Error("Cost record not found");

  return String(data.product_id);
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

export type CostInput = {
  supplier_article: string;
  cost: number;
  effective_from: string;
};

export async function createCostRecord(input: CostInput): Promise<CostRecord> {
  const supabase = createAdminClient();
  const productId = await resolveProductIdBySupplierArticle(input.supplier_article, supabase);
  return insertCostHistoryRow(supabase, productId, {
    cost: input.cost,
    effective_from: input.effective_from,
  });
}

/** Append a new history row; never overwrites existing cost values. */
export async function appendCostRecordChange(
  id: string,
  input: { cost: number; effective_from: string }
): Promise<CostRecord> {
  const supabase = createAdminClient();
  const productId = await resolveProductIdFromHistoryId(id, supabase);
  return insertCostHistoryRow(supabase, productId, input);
}

export type BulkCostRow = CostInput & { row: number };

export type BulkImportResult = {
  inserted: number;
  errors: { row: number; message: string }[];
};

export async function bulkCreateCostRecords(rows: BulkCostRow[]): Promise<BulkImportResult> {
  const supabase = createAdminClient();
  const result: BulkImportResult = { inserted: 0, errors: [] };

  for (const row of rows) {
    try {
      const productId = await resolveProductIdBySupplierArticle(row.supplier_article, supabase);
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
