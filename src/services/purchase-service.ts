import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import type { ParsedPurchaseImportRow } from "@/lib/purchase-excel";
import { fetchProductOptions, recordProductCostHistory } from "@/services/cost-service";
import type {
  Purchase,
  PurchaseCurrency,
  PurchaseImportResult,
  PurchaseLine,
  PurchaseListItem,
  PurchaseListLinePreview,
  PurchaseWithLines,
} from "@/types/database";

export type PurchaseHeaderInput = {
  marketplace_account_id: string;
  purchase_date: string;
  supplier: string;
  currency: PurchaseCurrency;
  exchange_rate: number | null;
  invoice_number?: string | null;
  notes?: string | null;
};

async function getReadClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createServerClient());
}

function mapPurchase(row: Purchase): Purchase {
  return {
    ...row,
    id: String(row.id),
    marketplace_account_id: String(row.marketplace_account_id),
    exchange_rate:
      row.exchange_rate === null || row.exchange_rate === undefined
        ? null
        : Number(row.exchange_rate),
    invoice_number:
      row.invoice_number == null || String(row.invoice_number).trim() === ""
        ? null
        : String(row.invoice_number).trim(),
  };
}

function mapPurchaseLine(row: PurchaseLine & { product?: { name: string } | null }): PurchaseLine {
  return {
    id: String(row.id),
    purchase_id: String(row.purchase_id),
    product_id: String(row.product_id),
    supplier_article: row.supplier_article,
    quantity: Number(row.quantity),
    unit_cost: Number(row.unit_cost),
    created_at: row.created_at,
    product_name: row.product?.name,
  };
}

function lineTotal(quantity: number, unitCost: number): number {
  return quantity * unitCost;
}

export async function fetchPurchases(
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<PurchaseListItem[]> {
  const supabase = await getReadClient(client);

  const { data: purchases, error } = await supabase
    .from("purchases")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch purchases: ${error.message}`);

  const purchaseRows = (purchases ?? []) as Purchase[];
  const purchaseIds = purchaseRows.map((row) => String(row.id));
  if (purchaseIds.length === 0) return [];

  const { data: lines, error: linesError } = await supabase
    .from("purchase_lines")
    .select("id, purchase_id, supplier_article, quantity, unit_cost, product:products(name)")
    .in("purchase_id", purchaseIds);

  if (linesError) throw new Error(`Failed to fetch purchase lines: ${linesError.message}`);

  const lineRows = (lines ?? []) as Array<
    Pick<PurchaseLine, "id" | "purchase_id" | "supplier_article" | "quantity" | "unit_cost"> & {
      product: { name?: string } | null;
    }
  >;
  const linesByPurchase = new Map<string, PurchaseListLinePreview[]>();
  const articlesByPurchase = new Map<string, string[]>();
  const totalByPurchase = new Map<string, number>();

  for (const line of lineRows) {
    const purchaseId = String(line.purchase_id);
    const quantity = Number(line.quantity);
    const unitCost = Number(line.unit_cost);
    const preview: PurchaseListLinePreview = {
      id: String(line.id),
      supplier_article: String(line.supplier_article ?? ""),
      product_name: (line.product as { name?: string } | null)?.name ?? null,
      quantity,
      unit_cost: unitCost,
    };
    const existing = linesByPurchase.get(purchaseId) ?? [];
    existing.push(preview);
    linesByPurchase.set(purchaseId, existing);

    totalByPurchase.set(
      purchaseId,
      (totalByPurchase.get(purchaseId) ?? 0) + lineTotal(quantity, unitCost)
    );

    const article = preview.supplier_article.trim();
    if (article) {
      const arts = articlesByPurchase.get(purchaseId) ?? [];
      if (!arts.includes(article)) {
        articlesByPurchase.set(purchaseId, [...arts, article]);
      }
    }
  }

  return purchaseRows.map((row) => {
    const id = String(row.id);
    const mappedLines = linesByPurchase.get(id) ?? [];
    return {
      ...mapPurchase(row as Purchase),
      line_count: mappedLines.length,
      supplierArticles: articlesByPurchase.get(id) ?? [],
      total_cost: totalByPurchase.get(id) ?? 0,
      lines: mappedLines,
    };
  });
}

export async function fetchPurchaseById(
  purchaseId: string,
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<PurchaseWithLines | null> {
  const supabase = await getReadClient(client);

  const { data: purchase, error } = await supabase
    .from("purchases")
    .select("*")
    .eq("id", purchaseId)
    .eq("marketplace_account_id", marketplaceAccountId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch purchase: ${error.message}`);
  if (!purchase) return null;

  const { data: lines, error: linesError } = await supabase
    .from("purchase_lines")
    .select("*, product:products(name)")
    .eq("purchase_id", purchaseId)
    .order("supplier_article");

  if (linesError) throw new Error(`Failed to fetch purchase lines: ${linesError.message}`);

  const mappedLines = (lines ?? []).map((row) =>
    mapPurchaseLine(row as PurchaseLine & { product?: { name: string } })
  );
  const total_cost = mappedLines.reduce(
    (sum, line) => sum + lineTotal(line.quantity, line.unit_cost),
    0
  );

  return {
    ...mapPurchase(purchase as Purchase),
    lines: mappedLines,
    line_count: mappedLines.length,
    total_cost,
  };
}

export async function buildPurchaseTemplateRows(marketplaceAccountId: string) {
  const products = await fetchProductOptions(marketplaceAccountId);
  return products.map((product) => ({ supplier_article: product.supplier_article }));
}

async function productHasCostHistory(
  productId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { count, error } = await supabase
    .from("product_cost_history")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .limit(1);

  if (error) {
    console.error("[purchase-import] step=cost_history_probe", {
      product_id: productId,
      error: error.message,
    });
    return true; // fail closed — do not inflate "new products"
  }
  return (count ?? 0) > 0;
}

export async function importPurchaseFromExcel(
  header: PurchaseHeaderInput,
  parsed: {
    rows: ParsedPurchaseImportRow[];
    skipped: number;
    errors: { row: number; message: string }[];
  }
): Promise<PurchaseImportResult> {
  const supabase = createAdminClient();
  const products = await fetchProductOptions(header.marketplace_account_id, supabase);
  const productByArticle = new Map(
    products.map((product) => [product.supplier_article.trim(), product.id])
  );

  const purchasePayload = {
    marketplace_account_id: header.marketplace_account_id,
    purchase_date: header.purchase_date,
    supplier: header.supplier.trim(),
    currency: header.currency,
    exchange_rate: header.exchange_rate,
    invoice_number: header.invoice_number?.trim() || null,
    notes: header.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  let { data: purchaseRow, error: purchaseError } = await supabase
    .from("purchases")
    .insert(purchasePayload)
    .select("*")
    .single();

  // Graceful fallback when invoice_number migration is not yet applied.
  if (
    purchaseError &&
    /invoice_number/i.test(purchaseError.message) &&
    "invoice_number" in purchasePayload
  ) {
    // The column must be absent from the payload, not null: this retry exists
    // for a schema where invoice_number does not exist yet, so sending the key
    // at all would fail identically. The cast covers the deliberate omission.
    const { invoice_number: _ignored, ...withoutInvoice } = purchasePayload;
    ({ data: purchaseRow, error: purchaseError } = await supabase
      .from("purchases")
      .insert(withoutInvoice as typeof purchasePayload)
      .select("*")
      .single());
  }

  if (purchaseError) throw new Error(`Failed to create purchase: ${purchaseError.message}`);
  if (!purchaseRow) throw new Error("Failed to create purchase: no row returned");

  const purchaseId = String(purchaseRow.id);
  const result: PurchaseImportResult = {
    purchaseId,
    productsImported: 0,
    newProducts: 0,
    skipped: parsed.skipped,
    errors: [...parsed.errors],
  };

  for (const row of parsed.rows) {
    const supplierArticle = row.supplier_article.trim();
    const productId = productByArticle.get(supplierArticle);
    if (!productId) {
      result.skipped += 1;
      const message = `Product not found for supplier article "${supplierArticle}"`;
      console.error("[purchase-import] step=supplier_article_lookup", {
        row: row.row,
        supplier_article: supplierArticle,
        marketplace_account_id: header.marketplace_account_id,
        error: message,
      });
      result.errors.push({
        row: row.row,
        message,
      });
      continue;
    }

    try {
      const hadHistory = await productHasCostHistory(productId, supabase);

      const { error: lineError } = await supabase.from("purchase_lines").insert({
        purchase_id: purchaseId,
        product_id: productId,
        supplier_article: supplierArticle,
        quantity: row.quantity,
        unit_cost: row.unit_cost,
      });

      if (lineError) {
        console.error("[purchase-import] step=purchase_lines_insert", {
          row: row.row,
          supplier_article: supplierArticle,
          product_id: productId,
          error: lineError.message,
        });
        throw new Error(lineError.message);
      }

      await recordProductCostHistory(
        productId,
        { cost: row.unit_cost, effective_from: header.purchase_date },
        supabase
      );

      result.productsImported += 1;
      if (!hadHistory) result.newProducts += 1;
    } catch (err) {
      result.skipped += 1;
      const message = err instanceof Error ? err.message : "Failed to import row";
      const step = message.includes("cost") ? "product_cost_history_insert" : "purchase_lines_insert";
      console.error(`[purchase-import] step=${step}`, {
        row: row.row,
        supplier_article: supplierArticle,
        product_id: productId,
        error: message,
      });
      result.errors.push({
        row: row.row,
        message,
      });
    }
  }

  return result;
}
