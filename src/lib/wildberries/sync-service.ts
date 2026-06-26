import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminClient } from "@/lib/supabase/admin";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import { WbApiClient, type WbSyncEntity, type WbSyncOptions, type WbSyncResult } from "./api-client";
import { syncLog } from "./sync-log";
import {
  isWithinDateRange,
  mapApiOrderToDb,
  mapApiProductToDb,
  mapApiProductVariants,
  mapApiSaleToDb,
  mapApiStockRowToDb,
  mapFinanceRowsFromReport,
  toDateString,
} from "./mappers";
import type { WbApiOrder, WbApiSale } from "./types";
import type { TableRowPick, WbFinance, WbOrder, WbStock } from "@/types/database";

type ProductLookup = Map<number, string>;
type ProductIdRow = TableRowPick<"products", "id">;
type BrandIdRow = TableRowPick<"brands", "id">;
type CategoryIdRow = TableRowPick<"categories", "id">;
type WbSaleIdRow = TableRowPick<"wb_sales", "id">;
type ProductLookupRow = TableRowPick<"products", "id" | "nm_id">;

const ORDER_BATCH_SIZE = 200;
const FINANCE_BATCH_SIZE = 500;

type SyncPersistenceMetrics = {
  entity: string;
  rowsPersisted: number;
  dbRequests: number;
  persistenceMs: number;
  rowsPerSec: number;
  /** Theoretical row-by-row request count (select + write per row). */
  estimatedBeforeDbRequests: number;
};

function printPersistenceMetrics(metrics: SyncPersistenceMetrics) {
  console.log(`[SYNC METRICS] ${metrics.entity}`, {
    dbRequests: metrics.dbRequests,
    estimatedBeforeDbRequests: metrics.estimatedBeforeDbRequests,
    dbRequestReduction: `${(
      (1 - metrics.dbRequests / Math.max(metrics.estimatedBeforeDbRequests, 1)) *
      100
    ).toFixed(1)}%`,
    rowsPersisted: metrics.rowsPersisted,
    persistenceMs: metrics.persistenceMs,
    rowsPerSec: metrics.rowsPerSec.toFixed(1),
  });
}

async function batchUpsertOrders(
  supabase: AdminClient,
  rows: Array<Omit<WbOrder, "id">>,
  batchSize: number,
  onBatch: (batchRowCount: number) => void
): Promise<{ dbRequests: number; errors: string[] }> {
  let dbRequests = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    dbRequests += 1;
    const { error } = await supabase.from("wb_orders").upsert(batch, { onConflict: "marketplace_account_id,srid" });
    if (error) {
      errors.push(`wb_orders batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    } else {
      onBatch(batch.length);
    }
  }

  return { dbRequests, errors };
}

async function batchUpsertFinance(
  supabase: AdminClient,
  marketplaceAccountId: string,
  rows: Array<Omit<WbFinance, "id">>,
  batchSize: number,
  onBatch: (batchRowCount: number) => void
): Promise<{ dbRequests: number; errors: string[] }> {
  let dbRequests = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const sourceKeys = batch.map((row) => row.source_key).filter(Boolean) as string[];

    dbRequests += 1;
    const { data: existing, error: selectError } = await supabase
      .from("wb_finance")
      .select("id, source_key")
      .eq("marketplace_account_id", marketplaceAccountId)
      .in("source_key", sourceKeys);

    if (selectError) {
      errors.push(`wb_finance batch ${batchNum} select: ${selectError.message}`);
      continue;
    }

    const idBySourceKey = new Map(
      (existing ?? []).map((row) => [row.source_key as string, row.id as string])
    );
    const toInsert: Array<Omit<WbFinance, "id">> = [];
    const toUpdate: Array<WbFinance> = [];

    for (const row of batch) {
      const id = row.source_key ? idBySourceKey.get(row.source_key) : undefined;
      if (id) {
        toUpdate.push({ ...row, id });
      } else {
        toInsert.push(row);
      }
    }

    if (toInsert.length) {
      dbRequests += 1;
      const { error } = await supabase.from("wb_finance").insert(toInsert);
      if (error) {
        errors.push(`wb_finance batch ${batchNum} insert: ${error.message}`);
        continue;
      }
      onBatch(toInsert.length);
    }

    if (toUpdate.length) {
      dbRequests += 1;
      const { error } = await supabase.from("wb_finance").upsert(toUpdate, { onConflict: "id" });
      if (error) {
        errors.push(`wb_finance batch ${batchNum} update: ${error.message}`);
        continue;
      }
      onBatch(toUpdate.length);
    }
  }

  return { dbRequests, errors };
}

export class WbSyncService {
  private client: WbApiClient;
  private marketplaceAccountId: string;

  constructor(client: WbApiClient, marketplaceAccountId: string) {
    this.client = client;
    this.marketplaceAccountId = marketplaceAccountId;
  }

  async syncAll(options: WbSyncOptions): Promise<WbSyncResult[]> {
    if (!options.marketplaceAccountId) {
      throw new Error("marketplaceAccountId is required for sync");
    }
    this.marketplaceAccountId = options.marketplaceAccountId;
    const entities = options.entities ?? ["products", "orders", "sales", "finance", "stock"];
    const results: WbSyncResult[] = [];

    syncLog("sync-all", "START", { entities, dateFrom: options.dateFrom, dateTo: options.dateTo });

    if (entities.includes("products")) {
      syncLog("sync-all", "BEFORE syncProducts()");
      results.push(await this.syncProducts());
      syncLog("sync-all", "AFTER syncProducts()");
    }
    if (entities.includes("orders")) {
      syncLog("sync-all", "BEFORE syncOrders()");
      results.push(await this.syncOrders(options.dateFrom, options.dateTo));
      syncLog("sync-all", "AFTER syncOrders()");
    }
    if (entities.includes("sales")) {
      syncLog("sync-all", "BEFORE syncSales()");
      results.push(await this.syncSales(options.dateFrom, options.dateTo));
      syncLog("sync-all", "AFTER syncSales()");
    }
    if (entities.includes("finance")) {
      syncLog("sync-all", "BEFORE syncFinance()");
      results.push(await this.syncFinance(options.dateFrom, options.dateTo));
      syncLog("sync-all", "AFTER syncFinance()");
    }
    if (entities.includes("stock")) {
      syncLog("sync-all", "BEFORE syncStock()");
      results.push(await this.syncStock());
      syncLog("sync-all", "AFTER syncStock()");
    }

    syncLog("sync-all", "END", { phaseCount: results.length });
    return results;
  }

  async syncProducts(): Promise<WbSyncResult> {
    const result = this.emptyResult("products");
    const supabase = createAdminClient();

    syncLog("products", "START");

    try {
      syncLog("products", "Wildberries API START: fetchAllProductCards");
      const cards = await this.client.fetchAllProductCards();
      syncLog("products", "Wildberries API END: fetchAllProductCards", { cardCount: cards.length });
      result.recordsProcessed = cards.length;

      const brandCache = new Map<string, string>();
      const categoryCache = new Map<string, string>();

      syncLog("products", "Supabase upsert loop START", { cardCount: cards.length });

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (i === 0 || (i + 1) % 25 === 0 || i === cards.length - 1) {
          syncLog("products", "Supabase upsert progress", {
            index: i + 1,
            total: cards.length,
            vendorCode: card.vendorCode,
          });
        }

        try {
          const mapped = mapApiProductToDb(card);

          let brandId = brandCache.get(mapped.brand_name);
          if (!brandId) {
            syncLog("products", "Supabase insert START: brands", { name: mapped.brand_name });
            brandId = await this.ensureBrand(supabase, mapped.brand_name);
            syncLog("products", "Supabase insert END: brands", { name: mapped.brand_name, brandId });
            brandCache.set(mapped.brand_name, brandId);
          }

          let categoryId = categoryCache.get(mapped.category_name);
          if (!categoryId) {
            syncLog("products", "Supabase insert START: categories", { name: mapped.category_name });
            categoryId = await this.ensureCategory(supabase, mapped.category_name);
            syncLog("products", "Supabase insert END: categories", {
              name: mapped.category_name,
              categoryId,
            });
            categoryCache.set(mapped.category_name, categoryId);
          }

          syncLog("products", "Supabase select START: products", {
            supplier_article: mapped.supplier_article,
          });
          const { data: existing } = await supabase
            .from("products")
            .select("id")
            .eq("marketplace_account_id", this.marketplaceAccountId)
            .eq("supplier_article", mapped.supplier_article)
            .maybeSingle<ProductIdRow>();
          syncLog("products", "Supabase select END: products", {
            supplier_article: mapped.supplier_article,
            found: Boolean(existing),
          });

          const payload = {
            marketplace_account_id: this.marketplaceAccountId,
            supplier_article: mapped.supplier_article,
            nm_id: mapped.nm_id,
            name: mapped.name,
            brand_id: brandId,
            category_id: categoryId,
            barcode: mapped.barcode,
          };

          let productId = existing?.id;

          if (existing) {
            syncLog("products", "Supabase update START: products", {
              id: existing.id,
              supplier_article: mapped.supplier_article,
            });
            const { error } = await supabase.from("products").update(payload).eq("id", existing.id);
            syncLog("products", "Supabase update END: products", {
              id: existing.id,
              ok: !error,
            });
            if (error) throw error;
            result.recordsUpdated += 1;
          } else {
            syncLog("products", "Supabase insert START: products", {
              supplier_article: mapped.supplier_article,
            });
            const { data: inserted, error } = await supabase
              .from("products")
              .insert(payload)
              .select("id")
              .single<ProductIdRow>();
            syncLog("products", "Supabase insert END: products", {
              supplier_article: mapped.supplier_article,
              ok: !error,
            });
            if (error) throw error;
            productId = inserted?.id;
            result.recordsInserted += 1;
          }

          if (productId) {
            const variants = mapApiProductVariants(card, productId).map((variant) => ({
              ...variant,
              marketplace_account_id: this.marketplaceAccountId,
            }));
            if (variants.length) {
              const { error: variantError } = await supabase.from("product_variants").upsert(
                variants,
                { onConflict: "product_id,tech_size,barcode" }
              );
              if (variantError && !variantError.message.includes("product_variants")) {
                throw variantError;
              }
            }
          }
        } catch (err) {
          result.errors.push(
            `Product ${card.vendorCode}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }

      syncLog("products", "Supabase upsert loop END", {
        inserted: result.recordsInserted,
        updated: result.recordsUpdated,
        errors: result.errors.length,
      });
    } catch (err) {
      syncLog("products", "FAILED", {
        message: err instanceof Error ? err.message : "Product sync failed",
      });
      result.errors.push(err instanceof Error ? err.message : "Product sync failed");
    }

    syncLog("products", "END", {
      processed: result.recordsProcessed,
      inserted: result.recordsInserted,
      updated: result.recordsUpdated,
      errors: result.errors.length,
    });
    return result;
  }

  async syncOrders(dateFrom: string, dateTo: string): Promise<WbSyncResult> {
    const result = this.emptyResult("orders");
    const supabase = createAdminClient();

    console.log("[SYNC] orders start");
    syncLog("orders", "START", { dateFrom, dateTo });

    try {
      syncLog("orders", "Wildberries API START: fetchOrders");
      const orders = await this.client.fetchOrders(`${dateFrom}T00:00:00`);
      console.log("[SYNC] orders fetched");
      syncLog("orders", "Wildberries API END: fetchOrders", { rawCount: orders.length });

      const filtered = orders.filter((o) => isWithinDateRange(toDateString(o.date), dateFrom, dateTo));
      result.recordsProcessed = filtered.length;
      syncLog("orders", "Orders filtered", { filteredCount: filtered.length });

      syncLog("orders", "Supabase select START: buildProductLookup");
      const lookup = await this.buildProductLookup(supabase);
      console.log("[SYNC] orders lookup built");
      syncLog("orders", "Supabase select END: buildProductLookup", { productCount: lookup.size });

      console.log("[SYNC] orders upsert start");
      syncLog("orders", "Supabase batch upsert START", { orderCount: filtered.length });

      const persistenceStarted = Date.now();
      let resolveDbRequests = 0;
      const payloads: Array<Omit<WbOrder, "id">> = [];

      for (const order of filtered) {
        try {
          const productId = await this.resolveProductId(supabase, lookup, order, {
            onDbRequest: () => {
              resolveDbRequests += 1;
            },
          });
          payloads.push({ ...mapApiOrderToDb(order, productId), marketplace_account_id: this.marketplaceAccountId });
        } catch (err) {
          result.errors.push(
            `Order ${order.srid ?? order.nmId}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }

      const { dbRequests: upsertDbRequests, errors: batchErrors } = await batchUpsertOrders(
        supabase,
        payloads,
        ORDER_BATCH_SIZE,
        (count) => {
          result.recordsUpdated += count;
        }
      );
      result.errors.push(...batchErrors);

      const persistenceMs = Date.now() - persistenceStarted;
      const dbRequests = 1 + resolveDbRequests + upsertDbRequests;
      printPersistenceMetrics({
        entity: "orders",
        rowsPersisted: payloads.length,
        dbRequests,
        persistenceMs,
        rowsPerSec: payloads.length / Math.max(persistenceMs / 1000, 0.001),
        estimatedBeforeDbRequests: payloads.length * 2,
      });

      console.log("[SYNC] orders upsert end");
      syncLog("orders", "Supabase batch upsert END", {
        inserted: result.recordsInserted,
        updated: result.recordsUpdated,
        errors: result.errors.length,
        dbRequests,
        persistenceMs,
      });
    } catch (err) {
      syncLog("orders", "FAILED", {
        message: err instanceof Error ? err.message : "Orders sync failed",
      });
      result.errors.push(err instanceof Error ? err.message : "Orders sync failed");
    }

    syncLog("orders", "END", {
      processed: result.recordsProcessed,
      inserted: result.recordsInserted,
      updated: result.recordsUpdated,
      errors: result.errors.length,
    });
    return result;
  }

  async syncSales(dateFrom: string, dateTo: string): Promise<WbSyncResult> {
    const result = this.emptyResult("sales");
    const supabase = createAdminClient();

    console.log("[SYNC] sales start");
    syncLog("sales", "START", { dateFrom, dateTo });

    try {
      syncLog("sales", "Wildberries API START: fetchSales");
      const sales = await this.client.fetchSales(`${dateFrom}T00:00:00`);
      console.log("[SYNC] sales fetched");
      syncLog("sales", "Wildberries API END: fetchSales", { rawCount: sales.length });

      const filtered = sales.filter((s) => isWithinDateRange(toDateString(s.date), dateFrom, dateTo));
      result.recordsProcessed = filtered.length;
      syncLog("sales", "Sales filtered", { filteredCount: filtered.length });

      syncLog("sales", "Supabase select START: buildProductLookup");
      const lookup = await this.buildProductLookup(supabase);
      console.log("[SYNC] sales lookup built");
      syncLog("sales", "Supabase select END: buildProductLookup", { productCount: lookup.size });

      console.log("[SYNC] sales upsert start");
      syncLog("sales", "Supabase upsert loop START", { saleCount: filtered.length });

      for (let i = 0; i < filtered.length; i++) {
        const sale = filtered[i];
        if (i === 0 || (i + 1) % 50 === 0 || i === filtered.length - 1) {
          syncLog("sales", "Supabase upsert progress", {
            index: i + 1,
            total: filtered.length,
            saleID: sale.saleID,
          });
        }
        try {
          await this.upsertSale(supabase, sale, lookup, result);
        } catch (err) {
          result.errors.push(
            `Sale ${sale.saleID}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }

      console.log("[SYNC] sales upsert end");
      syncLog("sales", "Supabase upsert loop END", {
        inserted: result.recordsInserted,
        updated: result.recordsUpdated,
        errors: result.errors.length,
      });
    } catch (err) {
      syncLog("sales", "FAILED", {
        message: err instanceof Error ? err.message : "Sales sync failed",
      });
      result.errors.push(err instanceof Error ? err.message : "Sales sync failed");
    }

    syncLog("sales", "END", {
      processed: result.recordsProcessed,
      inserted: result.recordsInserted,
      updated: result.recordsUpdated,
      errors: result.errors.length,
    });
    return result;
  }

  async syncFinance(dateFrom: string, dateTo: string): Promise<WbSyncResult> {
    const result = this.emptyResult("finance");
    const supabase = createAdminClient();

    console.log("[SYNC] finance start");
    syncLog("finance", "START", { dateFrom, dateTo });

    try {
      syncLog("finance", "Wildberries API START: fetchFinanceReport");
      const rows = await this.client.fetchFinanceReport(dateFrom, dateTo);
      console.log("[SYNC] finance fetched");
      syncLog("finance", "Wildberries API END: fetchFinanceReport", { rowCount: rows.length });
      result.recordsProcessed = rows.length;

      syncLog("finance", "Supabase select START: buildProductLookup");
      const lookup = await this.buildProductLookup(supabase);
      console.log("[SYNC] finance lookup built");
      syncLog("finance", "Supabase select END: buildProductLookup", { productCount: lookup.size });

      console.log("[SYNC] finance upsert start");
      syncLog("finance", "Supabase batch upsert START", { rowCount: rows.length });

      const persistenceStarted = Date.now();
      const financeLines: Array<Omit<WbFinance, "id">> = [];

      for (const row of rows) {
        try {
          const productId = row.nm_id ? lookup.get(row.nm_id) ?? null : null;
          financeLines.push(
            ...mapFinanceRowsFromReport(row, productId).map((line) => ({
              ...line,
              marketplace_account_id: this.marketplaceAccountId,
            }))
          );
        } catch (err) {
          result.errors.push(
            `Finance rrd:${row.rrd_id}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }

      const { dbRequests: upsertDbRequests, errors: batchErrors } = await batchUpsertFinance(
        supabase,
        this.marketplaceAccountId,
        financeLines,
        FINANCE_BATCH_SIZE,
        (count) => {
          result.recordsUpdated += count;
        }
      );
      result.errors.push(...batchErrors);

      const persistenceMs = Date.now() - persistenceStarted;
      const dbRequests = 1 + upsertDbRequests;
      printPersistenceMetrics({
        entity: "finance",
        rowsPersisted: financeLines.length,
        dbRequests,
        persistenceMs,
        rowsPerSec: financeLines.length / Math.max(persistenceMs / 1000, 0.001),
        estimatedBeforeDbRequests: financeLines.length * 2,
      });

      console.log("[SYNC] finance upsert end");
      syncLog("finance", "Supabase batch upsert END", {
        inserted: result.recordsInserted,
        updated: result.recordsUpdated,
        errors: result.errors.length,
        dbRequests,
        persistenceMs,
      });
    } catch (err) {
      syncLog("finance", "FAILED", {
        message: err instanceof Error ? err.message : "Finance sync failed",
      });
      result.errors.push(err instanceof Error ? err.message : "Finance sync failed");
    }

    syncLog("finance", "END", {
      processed: result.recordsProcessed,
      inserted: result.recordsInserted,
      updated: result.recordsUpdated,
      errors: result.errors.length,
    });
    return result;
  }

  async syncStock(): Promise<WbSyncResult> {
    const result = this.emptyResult("stock");
    const supabase = createAdminClient();

    syncLog("stock", "START");

    try {
      syncLog("stock", "Wildberries API START: fetchStocks");
      const rows = await this.client.fetchStocks();
      syncLog("stock", "Wildberries API END: fetchStocks", { rowCount: rows.length });
      result.recordsProcessed = rows.length;

      const lookup = await this.buildProductLookup(supabase);
      const syncedAt = new Date().toISOString();
      const batch: Array<Omit<WbStock, "id">> = [];
      const BATCH_SIZE = 500;

      syncLog("stock", "Supabase upsert loop START", { rowCount: rows.length });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.nmId) continue;

        const productId = lookup.get(row.nmId);
        if (!productId) {
          result.errors.push(`Stock nmId ${row.nmId}: product not found`);
          continue;
        }

        batch.push({ ...mapApiStockRowToDb(row, productId, syncedAt), marketplace_account_id: this.marketplaceAccountId });

        if (batch.length >= BATCH_SIZE || i === rows.length - 1) {
          if (batch.length) {
            const { error } = await supabase.from("wb_stock").upsert(batch, {
              onConflict: "product_id,tech_size,barcode,warehouse",
            });
            if (error) {
              result.errors.push(`Stock batch: ${error.message}`);
            } else {
              result.recordsInserted += batch.length;
            }
            batch.length = 0;
          }
        }
      }

      syncLog("stock", "Supabase upsert loop END", {
        inserted: result.recordsInserted,
        errors: result.errors.length,
      });
    } catch (err) {
      syncLog("stock", "FAILED", {
        message: err instanceof Error ? err.message : "Stock sync failed",
      });
      result.errors.push(err instanceof Error ? err.message : "Stock sync failed");
    }

    syncLog("stock", "END", {
      processed: result.recordsProcessed,
      inserted: result.recordsInserted,
      updated: result.recordsUpdated,
      errors: result.errors.length,
    });
    return result;
  }

  private async upsertSale(
    supabase: AdminClient,
    sale: WbApiSale,
    lookup: ProductLookup,
    result: WbSyncResult
  ) {
    syncLog("sales", "Supabase upsert START: wb_sales", { srid: sale.srid ?? sale.saleID });
    syncLog("sales", "Supabase resolveProductId START", { nmId: sale.nmId });
    const productId = await this.resolveProductId(supabase, lookup, sale);
    syncLog("sales", "Supabase resolveProductId END", { nmId: sale.nmId, productId });
    const payload = { ...mapApiSaleToDb(sale, productId), marketplace_account_id: this.marketplaceAccountId };
    syncLog("sales", "Supabase select START: wb_sales", { srid: payload.srid });
    const { data: existing } = await supabase
      .from("wb_sales")
      .select("id")
      .eq("marketplace_account_id", this.marketplaceAccountId)
      .eq("srid", payload.srid)
      .maybeSingle<WbSaleIdRow>();
    syncLog("sales", "Supabase select END: wb_sales", { srid: payload.srid, found: Boolean(existing) });

    if (existing) {
      syncLog("sales", "Supabase update START: wb_sales", { id: existing.id, srid: payload.srid });
      const { error } = await supabase.from("wb_sales").update(payload).eq("id", existing.id);
      syncLog("sales", "Supabase update END: wb_sales", { id: existing.id, ok: !error });
      if (error) throw error;
      result.recordsUpdated += 1;
    } else {
      syncLog("sales", "Supabase insert START: wb_sales", { srid: payload.srid });
      const { error } = await supabase.from("wb_sales").insert(payload);
      syncLog("sales", "Supabase insert END: wb_sales", { srid: payload.srid, ok: !error });
      if (error) throw error;
      result.recordsInserted += 1;
    }
    syncLog("sales", "Supabase upsert END: wb_sales", { srid: sale.srid ?? sale.saleID });
  }

  private async resolveProductId(
    supabase: AdminClient,
    lookup: ProductLookup,
    item: { nmId: number; supplierArticle?: string; subject?: string; category?: string; brand?: string },
    hooks?: { onDbRequest?: () => void }
  ): Promise<string> {
    const cached = lookup.get(item.nmId);
    if (cached) return cached;

    const supplierArticle = item.supplierArticle ?? `nm-${item.nmId}`;
    const brandId = await this.ensureBrand(supabase, item.brand ?? "Unknown", hooks);
    const categoryId = await this.ensureCategory(
      supabase,
      item.category ?? item.subject ?? "Uncategorized",
      hooks
    );

    hooks?.onDbRequest?.();
    const { data: byNm } = await supabase
      .from("products")
      .select("id")
      .eq("marketplace_account_id", this.marketplaceAccountId)
      .eq("nm_id", item.nmId)
      .maybeSingle<ProductIdRow>();

    if (byNm) {
      lookup.set(item.nmId, byNm.id);
      return byNm.id;
    }

    syncLog("resolveProductId", "Supabase insert START: products", { nmId: item.nmId, supplierArticle });
    hooks?.onDbRequest?.();
    const { data: inserted, error } = await supabase
      .from("products")
      .insert({
        marketplace_account_id: this.marketplaceAccountId,
        supplier_article: supplierArticle,
        nm_id: item.nmId,
        name: supplierArticle,
        brand_id: brandId,
        category_id: categoryId,
        barcode: null,
      })
      .select("id")
      .single<ProductIdRow>();
    syncLog("resolveProductId", "Supabase insert END: products", { nmId: item.nmId, ok: !error });

    if (error) {
      hooks?.onDbRequest?.();
      const { data: byArticle } = await supabase
        .from("products")
        .select("id")
        .eq("marketplace_account_id", this.marketplaceAccountId)
        .eq("supplier_article", supplierArticle)
        .maybeSingle<ProductIdRow>();
      if (byArticle) {
        lookup.set(item.nmId, byArticle.id);
        return byArticle.id;
      }
      throw error;
    }

    lookup.set(item.nmId, inserted.id);
    return inserted.id;
  }

  private async buildProductLookup(supabase: AdminClient): Promise<ProductLookup> {
    const { data, error } = await supabase
      .from("products")
      .select("id, nm_id")
      .eq("marketplace_account_id", this.marketplaceAccountId);
    if (error) throw error;

    const rows = (data ?? []) as ProductLookupRow[];
    const lookup = new Map<number, string>();
    for (const product of rows) {
      lookup.set(product.nm_id, product.id);
    }
    return lookup;
  }

  private async ensureBrand(
    supabase: AdminClient,
    name: string,
    hooks?: { onDbRequest?: () => void }
  ): Promise<string> {
    hooks?.onDbRequest?.();
    const { data: existing } = await supabase
      .from("brands")
      .select("id")
      .eq("name", name)
      .maybeSingle<BrandIdRow>();

    if (existing) return existing.id;

    syncLog("ensureBrand", "Supabase insert START: brands", { name });
    hooks?.onDbRequest?.();
    const { data, error } = await supabase
      .from("brands")
      .insert({ name })
      .select("id")
      .single<BrandIdRow>();
    syncLog("ensureBrand", "Supabase insert END: brands", { name, ok: !error });
    if (error) throw error;
    return data.id;
  }

  private async ensureCategory(
    supabase: AdminClient,
    name: string,
    hooks?: { onDbRequest?: () => void }
  ): Promise<string> {
    hooks?.onDbRequest?.();
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("name", name)
      .maybeSingle<CategoryIdRow>();

    if (existing) return existing.id;

    syncLog("ensureCategory", "Supabase insert START: categories", { name });
    hooks?.onDbRequest?.();
    const { data, error } = await supabase
      .from("categories")
      .insert({ name, parent_id: null })
      .select("id")
      .single<CategoryIdRow>();
    syncLog("ensureCategory", "Supabase insert END: categories", { name, ok: !error });
    if (error) throw error;
    return data.id;
  }

  private emptyResult(entity: WbSyncEntity): WbSyncResult {
    return {
      entity,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: [],
      syncedAt: new Date().toISOString(),
    };
  }
}

export async function createWbSyncService(marketplaceAccountId: string): Promise<WbSyncService> {
  const account = await getMarketplaceAccountForSync(marketplaceAccountId);
  if (account.marketplace !== "wildberries") {
    throw new Error(`Sync not implemented for marketplace: ${account.marketplace}`);
  }
  return new WbSyncService(new WbApiClient(account.apiKey), marketplaceAccountId);
}
