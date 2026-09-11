import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminClient } from "@/lib/supabase/admin";
import { getSyncExecutionContext } from "@/lib/commercial-continuity/sync-execution-context";
import { isFinanceHistoricalRecoveryActive } from "@/lib/finance-recovery/coordination";
import { FINANCE_RESERVED_ACCOUNT_IDS } from "@/lib/finance-recovery/reservation";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import {
  WbApiClient,
  WbApiError,
  type WbFinanceReportPage,
  type WbSyncEntity,
  type WbSyncOptions,
  type WbSyncResult,
} from "./api-client";
import type { WbFinanceV1Period } from "./finance-v1";
import { assertAccount2ReportsRecoveryAccount } from "@/lib/finance-recovery/reports-ingestion";
import { syncLog } from "./sync-log";
import { yieldEventLoop } from "./sync-runtime";
import { getActiveSyncTimer } from "./sync-timer";
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
import {
  persistSalesEvents,
  salesSchemaHasSaleIdColumn,
} from "./sales-event-persistence";
import { dedupeSalesEvents, type SalesEventRow } from "./sales-event-identity";
import type { TableRowPick, WbFinance, WbOrder, WbSale, WbStock } from "@/types/database";

type ProductLookup = Map<number, string>;
type ProductIdRow = TableRowPick<"products", "id">;
type BrandIdRow = TableRowPick<"brands", "id">;
type CategoryIdRow = TableRowPick<"categories", "id">;
type ProductLookupRow = TableRowPick<"products", "id" | "nm_id">;

const ORDER_BATCH_SIZE = 200;
const FINANCE_BATCH_SIZE = 500;
const SALES_BATCH_SIZE = 200;
const YIELD_EVERY_ROWS = 50;

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

const FINANCE_EXTENDED_FIELDS = [
  "finance_category",
  "wb_source_suffix",
  "supplier_oper_name",
  "finance_nature",
] as const;

const FINANCE_REPORT_IDENTITY_FIELDS = [
  "realizationreport_id",
  "rrd_id",
  "rr_dt",
] as const;

async function financeSchemaHasExtendedColumns(supabase: AdminClient): Promise<boolean> {
  const { error } = await supabase.from("wb_finance").select("finance_category").limit(1);
  return !error;
}

async function financeSchemaHasReportIdentity(supabase: AdminClient): Promise<boolean> {
  const { error } = await supabase.from("wb_finance").select("realizationreport_id").limit(1);
  return !error;
}

function toFinanceUpsertRow(
  row: Omit<WbFinance, "id">,
  includeExtendedColumns: boolean,
  includeReportIdentity: boolean
): Omit<WbFinance, "id"> {
  const next = { ...row };
  if (!includeExtendedColumns) {
    for (const field of FINANCE_EXTENDED_FIELDS) {
      delete next[field];
    }
  }
  if (!includeReportIdentity) {
    for (const field of FINANCE_REPORT_IDENTITY_FIELDS) {
      delete next[field];
    }
  }
  return next;
}

async function batchUpsertFinance(
  supabase: AdminClient,
  rows: Array<Omit<WbFinance, "id">>,
  batchSize: number,
  onBatch: (batchRowCount: number) => void,
  includeExtendedColumns: boolean,
  includeReportIdentity: boolean
): Promise<{ dbRequests: number; errors: string[] }> {
  let dbRequests = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows
      .slice(i, i + batchSize)
      .map((row) => toFinanceUpsertRow(row, includeExtendedColumns, includeReportIdentity));
    const batchNum = Math.floor(i / batchSize) + 1;

    const accountIds = new Set(batch.map((row) => String(row.marketplace_account_id)));
    if (accountIds.size !== 1 || accountIds.has("")) {
      errors.push(`wb_finance batch ${batchNum}: mixed or missing marketplace account id`);
      continue;
    }
    if (batch.some((row) => !row.source_key)) {
      errors.push(`wb_finance batch ${batchNum}: source_key is required for atomic persistence`);
      continue;
    }

    dbRequests += 1;
    const { error } = await supabase.from("wb_finance").upsert(batch, {
      onConflict: "marketplace_account_id,source_key",
    });
    if (error) {
      errors.push(`wb_finance batch ${batchNum}: atomic upsert failed: ${error.message}`);
    } else {
      onBatch(batch.length);
    }

    if (i > 0 && i % (batchSize * 4) === 0) {
      await yieldEventLoop();
    }
  }

  return { dbRequests, errors };
}

export type WbFinancePageSyncResult = WbSyncResult & {
  page: Omit<WbFinanceReportPage, "rows"> | null;
};

export async function assertFinanceRecoverySchemaReady(
  supabase: AdminClient = createAdminClient()
): Promise<void> {
  const { data, error } = await supabase.rpc(
    "orion_finance_recovery_schema_ready" as never
  );
  if (error) {
    throw new Error(
      `Finance recovery schema readiness check unavailable: ${error.message}`
    );
  }
  if (data !== true) {
    throw new Error(
      "Finance recovery schema is not ready: composite account/source key uniqueness and lock columns are required"
    );
  }
}

/** One row per WB saleID. A later return saleID must not replace the sale. */
function dedupeSalesPayloads(rows: SalesEventRow[]): SalesEventRow[] {
  return dedupeSalesEvents(rows).rows;
}

const SALES_REVENUE_FIELDS = ["price_with_disc", "for_pay"] as const;
const SALES_WAREHOUSE_FIELD = "warehouse" as const;

async function salesSchemaHasRevenueColumns(supabase: AdminClient): Promise<boolean> {
  const { error } = await supabase.from("wb_sales").select("price_with_disc").limit(1);
  return !error;
}

async function salesSchemaHasWarehouseColumn(supabase: AdminClient): Promise<boolean> {
  const { error } = await supabase.from("wb_sales").select("warehouse").limit(1);
  return !error;
}

function toSalesUpsertRow(
  row: SalesEventRow,
  includeRevenueColumns: boolean,
  includeWarehouseColumn: boolean
): SalesEventRow {
  const next = { ...row };
  if (!includeRevenueColumns) {
    for (const field of SALES_REVENUE_FIELDS) {
      delete next[field];
    }
  }
  if (!includeWarehouseColumn) {
    delete next[SALES_WAREHOUSE_FIELD];
  }
  return next;
}

async function batchUpsertSales(
  supabase: AdminClient,
  rows: SalesEventRow[],
  batchSize: number,
  onBatch: (batchRowCount: number) => void,
  includeRevenueColumns: boolean,
  includeWarehouseColumn: boolean
): Promise<{ dbRequests: number; errors: string[] }> {
  const shaped = rows.map((row) =>
    toSalesUpsertRow(row, includeRevenueColumns, includeWarehouseColumn)
  );
  const { upserted, errors } = await persistSalesEvents(supabase, shaped, { batchSize });
  if (upserted > 0) onBatch(upserted);
  const dbRequests = Math.max(1, Math.ceil(rows.length / Math.max(batchSize, 1)));
  return { dbRequests, errors };
}

export class WbSyncService {
  private client: WbApiClient;
  private marketplaceAccountId: string;

  constructor(client: WbApiClient, marketplaceAccountId: string) {
    this.client = client;
    this.marketplaceAccountId = marketplaceAccountId;
  }

  /** Exposed for Finance Sync V2 report discovery. */
  getApiClient(): WbApiClient {
    return this.client;
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
    const timer = getActiveSyncTimer();

    syncLog("products", "START");

    try {
      timer?.startPhase("products_fetch");
      syncLog("products", "Wildberries API START: fetchAllProductCards");
      const cards = await this.client.fetchAllProductCards();
      timer?.endPhase("products_fetch");
      syncLog("products", "Wildberries API END: fetchAllProductCards", { cardCount: cards.length });
      result.recordsProcessed = cards.length;

      const brandCache = new Map<string, string>();
      const categoryCache = new Map<string, string>();

      timer?.startPhase("products_db");
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

        if ((i + 1) % 25 === 0) {
          await yieldEventLoop();
        }
      }

      timer?.endPhase("products_db");
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
    const timer = getActiveSyncTimer();

    console.log("[SYNC] orders start");
    syncLog("orders", "START", { dateFrom, dateTo });

    try {
      timer?.startPhase("orders_fetch");
      syncLog("orders", "Wildberries API START: fetchOrders");
      const orders = await this.client.fetchOrders(`${dateFrom}T00:00:00`);
      timer?.endPhase("orders_fetch");
      console.log("[SYNC] orders fetched");
      syncLog("orders", "Wildberries API END: fetchOrders", { rawCount: orders.length });

      const filtered = orders.filter(
        (o) =>
          isWithinDateRange(toDateString(o.date), dateFrom, dateTo) ||
          isWithinDateRange(toDateString(o.lastChangeDate), dateFrom, dateTo)
      );
      result.recordsProcessed = filtered.length;
      syncLog("orders", "Orders filtered", { filteredCount: filtered.length });

      timer?.startPhase("orders_db");
      syncLog("orders", "Supabase select START: buildProductLookup");
      const lookup = await this.buildProductLookup(supabase);
      console.log("[SYNC] orders lookup built");
      syncLog("orders", "Supabase select END: buildProductLookup", { productCount: lookup.size });

      console.log("[SYNC] orders upsert start");
      syncLog("orders", "Supabase batch upsert START", { orderCount: filtered.length });

      const persistenceStarted = Date.now();
      let resolveDbRequests = 0;
      const payloads: Array<Omit<WbOrder, "id">> = [];

      for (let i = 0; i < filtered.length; i++) {
        const order = filtered[i];
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

        if ((i + 1) % YIELD_EVERY_ROWS === 0) {
          await yieldEventLoop();
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
      timer?.endPhase("orders_db");
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
    const timer = getActiveSyncTimer();

    console.log("[SYNC] sales start");
    syncLog("sales", "START", { dateFrom, dateTo });

    try {
      timer?.startPhase("sales_fetch");
      syncLog("sales", "Wildberries API START: fetchSales");
      const sales = await this.client.fetchSales(`${dateFrom}T00:00:00`);
      timer?.endPhase("sales_fetch");
      console.log("[SYNC] sales fetched");
      syncLog("sales", "Wildberries API END: fetchSales", { rawCount: sales.length });

      const filtered = sales.filter((s) => isWithinDateRange(toDateString(s.date), dateFrom, dateTo));
      result.recordsProcessed = filtered.length;
      syncLog("sales", "Sales filtered", { filteredCount: filtered.length });

      timer?.startPhase("sales_db");
      syncLog("sales", "Supabase select START: buildProductLookup");
      const lookup = await this.buildProductLookup(supabase);
      console.log("[SYNC] sales lookup built");
      syncLog("sales", "Supabase select END: buildProductLookup", { productCount: lookup.size });

      const includeRevenueColumns = await salesSchemaHasRevenueColumns(supabase);
      if (!includeRevenueColumns) {
        syncLog("sales", "price_with_disc column missing — upserting legacy columns only", {});
        result.errors.push(
          "price_with_disc column missing on wb_sales — run npx tsx scripts/apply-wb-sales-revenue-migration.mjs"
        );
      }

      const includeWarehouseColumn = await salesSchemaHasWarehouseColumn(supabase);
      if (!includeWarehouseColumn) {
        syncLog("sales", "warehouse column missing — upserting without warehouse", {});
        result.errors.push(
          "warehouse column missing on wb_sales — run npx tsx scripts/apply-wb-sales-warehouse-migration.mjs"
        );
      }

      const includeSaleId = await salesSchemaHasSaleIdColumn(supabase);
      if (!includeSaleId) {
        const message =
          "sale_id column missing on wb_sales — refusing to upsert on (account, srid). Apply supabase/migrations/20260911100000_wb_sales_event_identity.sql";
        syncLog("sales", message, {});
        result.errors.push(message);
        return result;
      }

      console.log("[SYNC] sales upsert start");
      syncLog("sales", "Supabase batch upsert START", { saleCount: filtered.length });

      const persistenceStarted = Date.now();
      const payloads: SalesEventRow[] = [];

      for (let i = 0; i < filtered.length; i++) {
        const sale = filtered[i];
        if (i === 0 || (i + 1) % 100 === 0 || i === filtered.length - 1) {
          syncLog("sales", "Supabase upsert progress", {
            index: i + 1,
            total: filtered.length,
          });
        }
        try {
          const productId = await this.resolveProductId(supabase, lookup, sale);
          payloads.push({
            ...mapApiSaleToDb(sale, productId),
            marketplace_account_id: this.marketplaceAccountId,
            sale_id: String(sale.saleID),
            event_type: String(sale.saleID).startsWith("R") ? "RETURN" : "SALE",
          });
        } catch (err) {
          result.errors.push(
            `Sale ${sale.saleID}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }

        if ((i + 1) % YIELD_EVERY_ROWS === 0) {
          await yieldEventLoop();
        }
      }

      const dedupedPayloads = dedupeSalesPayloads(payloads);
      if (dedupedPayloads.length < payloads.length) {
        syncLog("sales", "Sales deduplicated by saleID", {
          before: payloads.length,
          after: dedupedPayloads.length,
          dropped: payloads.length - dedupedPayloads.length,
        });
      }

      const { dbRequests, errors: batchErrors } = await batchUpsertSales(
        supabase,
        dedupedPayloads,
        SALES_BATCH_SIZE,
        (count) => {
          result.recordsUpdated += count;
        },
        includeRevenueColumns,
        includeWarehouseColumn
      );
      result.errors.push(...batchErrors);

      const persistenceMs = Date.now() - persistenceStarted;
      timer?.endPhase("sales_db");
      printPersistenceMetrics({
        entity: "sales",
        rowsPersisted: dedupedPayloads.length,
        dbRequests: 1 + dbRequests,
        persistenceMs,
        rowsPerSec: dedupedPayloads.length / Math.max(persistenceMs / 1000, 0.001),
        estimatedBeforeDbRequests: dedupedPayloads.length * 2,
      });

      console.log("[SYNC] sales upsert end");
      syncLog("sales", "Supabase batch upsert END", {
        inserted: result.recordsInserted,
        updated: result.recordsUpdated,
        errors: result.errors.length,
        dbRequests,
        persistenceMs,
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

  async syncFinancePage(
    dateFrom: string,
    dateTo: string,
    currentRrdId: number
  ): Promise<WbFinancePageSyncResult> {
    const result: WbFinancePageSyncResult = {
      ...this.emptyResult("finance"),
      page: null,
    };

    // Account 2 must never use Statistics v5 reportDetailByPeriod.
    if (
      FINANCE_RESERVED_ACCOUNT_IDS.includes(
        this.marketplaceAccountId as (typeof FINANCE_RESERVED_ACCOUNT_IDS)[number]
      ) ||
      isFinanceHistoricalRecoveryActive(this.marketplaceAccountId)
    ) {
      result.errors.push(
        "Account 2 Finance must use syncFinanceV1Page — Statistics v5 reportDetailByPeriod is blocked"
      );
      syncLog("finance", "REFUSE statistics v5 page sync for reserved Account 2", {
        marketplaceAccountId: this.marketplaceAccountId,
      });
      return result;
    }

    const supabase = createAdminClient();

    try {
      if (!/^[1-9]\d*$/.test(this.marketplaceAccountId)) {
        throw new Error(
          `Finance recovery requires a numeric marketplace account id, received: ${this.marketplaceAccountId}`
        );
      }

      const fetched = await this.client.fetchFinanceReportPage(
        dateFrom,
        dateTo,
        currentRrdId
      );
      const { rows, ...page } = fetched;
      result.page = page;
      result.recordsProcessed = rows.length;

      if (rows.length === 0) return result;
      if (
        rows.some((row) => !Number.isSafeInteger(Number(row.rrd_id))) ||
        (page.hasMore &&
          (page.lastRrdId == null || page.lastRrdId <= page.currentRrdId))
      ) {
        throw new Error("Finance page cursor validation failed");
      }
      if (getSyncExecutionContext()?.abortSignal?.aborted) {
        throw new DOMException("Sync aborted", "AbortError");
      }

      const lookup = await this.buildProductLookup(supabase);
      const includeExtendedColumns = await financeSchemaHasExtendedColumns(supabase);
      const includeReportIdentity = await financeSchemaHasReportIdentity(supabase);
      if (!includeExtendedColumns || !includeReportIdentity) {
        throw new Error(
          "Finance page persistence requires the complete Finance Sync V2 schema"
        );
      }

      const financeLines: Array<Omit<WbFinance, "id">> = [];
      const reportIds = new Set<number>();
      let minOp: string | null = null;
      let maxOp: string | null = null;

      for (const row of rows) {
        if (row.realizationreport_id != null && Number.isFinite(row.realizationreport_id)) {
          reportIds.add(Number(row.realizationreport_id));
        }
        const productId = row.nm_id ? lookup.get(row.nm_id) ?? null : null;
        const mapped = mapFinanceRowsFromReport(row, productId).map((line) => ({
          ...line,
          marketplace_account_id: this.marketplaceAccountId,
        }));
        for (const line of mapped) {
          const op = line.operation_date?.slice(0, 10);
          if (op) {
            if (!minOp || op < minOp) minOp = op;
            if (!maxOp || op > maxOp) maxOp = op;
          }
        }
        financeLines.push(...mapped);
      }

      const { errors } = await batchUpsertFinance(
        supabase,
        financeLines,
        FINANCE_BATCH_SIZE,
        (count) => {
          result.recordsUpdated += count;
        },
        includeExtendedColumns,
        includeReportIdentity
      );
      result.errors.push(...errors);
      result.reportIds = [...reportIds].sort((a, b) => a - b);
      result.returnedFrom = minOp;
      result.returnedTo = maxOp;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : "Finance page sync failed");
    }

    return result;
  }

  /**
   * Account 2 Finance recovery page path — Finance V1 sales-reports/detailed.
   * UPSERT only; caller must advance cursor only after successful persistence.
   * Never falls back to Statistics v5.
   */
  async syncFinanceV1Page(
    dateFrom: string,
    dateTo: string,
    currentRrdId: number,
    period: WbFinanceV1Period = "weekly"
  ): Promise<WbFinancePageSyncResult> {
    const result: WbFinancePageSyncResult = {
      ...this.emptyResult("finance"),
      page: null,
    };
    const supabase = createAdminClient();

    try {
      if (!/^[1-9]\d*$/.test(this.marketplaceAccountId)) {
        throw new Error(
          `Finance recovery requires a numeric marketplace account id, received: ${this.marketplaceAccountId}`
        );
      }

      if (
        FINANCE_RESERVED_ACCOUNT_IDS.includes(
          this.marketplaceAccountId as (typeof FINANCE_RESERVED_ACCOUNT_IDS)[number]
        )
      ) {
        assertAccount2ReportsRecoveryAccount(this.marketplaceAccountId);
      }

      const fetched = await this.client.fetchFinanceV1ReportPage(
        dateFrom,
        dateTo,
        currentRrdId,
        period
      );
      const { rows, ...page } = fetched;
      result.page = page;
      result.recordsProcessed = rows.length;

      if (rows.length === 0) return result;
      if (
        rows.some((row) => !Number.isSafeInteger(Number(row.rrd_id))) ||
        (page.hasMore &&
          (page.lastRrdId == null || page.lastRrdId <= page.currentRrdId))
      ) {
        throw new Error("Finance V1 page cursor validation failed");
      }
      if (getSyncExecutionContext()?.abortSignal?.aborted) {
        throw new DOMException("Sync aborted", "AbortError");
      }

      const lookup = await this.buildProductLookup(supabase);
      const includeExtendedColumns = await financeSchemaHasExtendedColumns(supabase);
      const includeReportIdentity = await financeSchemaHasReportIdentity(supabase);
      if (!includeExtendedColumns || !includeReportIdentity) {
        throw new Error(
          "Finance page persistence requires the complete Finance Sync V2 schema"
        );
      }

      const financeLines: Array<Omit<WbFinance, "id">> = [];
      const reportIds = new Set<number>();
      let minOp: string | null = null;
      let maxOp: string | null = null;

      for (const row of rows) {
        if (row.realizationreport_id != null && Number.isFinite(row.realizationreport_id)) {
          reportIds.add(Number(row.realizationreport_id));
        }
        const productId = row.nm_id ? lookup.get(row.nm_id) ?? null : null;
        const mapped = mapFinanceRowsFromReport(row, productId).map((line) => ({
          ...line,
          marketplace_account_id: this.marketplaceAccountId,
        }));
        for (const line of mapped) {
          if (String(line.marketplace_account_id) !== String(this.marketplaceAccountId)) {
            throw new Error(
              "Finance V1 persistence refused: marketplace_account_id mismatch in mapped lines"
            );
          }
          const op = line.operation_date?.slice(0, 10);
          if (op) {
            if (!minOp || op < minOp) minOp = op;
            if (!maxOp || op > maxOp) maxOp = op;
          }
        }
        financeLines.push(...mapped);
      }

      const { errors } = await batchUpsertFinance(
        supabase,
        financeLines,
        FINANCE_BATCH_SIZE,
        (count) => {
          result.recordsUpdated += count;
        },
        includeExtendedColumns,
        includeReportIdentity
      );
      result.errors.push(...errors);
      result.reportIds = [...reportIds].sort((a, b) => a - b);
      result.returnedFrom = minOp;
      result.returnedTo = maxOp;
    } catch (err) {
      if (err instanceof WbApiError) {
        const tag =
          err.statusCode === 429 || err.code === "FINANCE_HTTP_429"
            ? "[http 429]"
            : err.code === "FINANCE_V1_MISSING_RATE_LIMIT_HEADERS"
              ? `[http ${err.statusCode ?? 200}][missing_rate_limit_headers]`
              : err.statusCode != null
                ? `[http ${err.statusCode}]`
                : "[wb_api_error]";
        result.errors.push(`${tag} ${err.message}`);
      } else {
        result.errors.push(
          err instanceof Error ? err.message : "Finance V1 page sync failed"
        );
      }
    }

    return result;
  }

  async syncFinance(dateFrom: string, dateTo: string): Promise<WbSyncResult> {
    const result = this.emptyResult("finance");

    if (
      FINANCE_RESERVED_ACCOUNT_IDS.includes(
        this.marketplaceAccountId as (typeof FINANCE_RESERVED_ACCOUNT_IDS)[number]
      )
    ) {
      result.errors.push(
        "Account 2 Finance must use Reports/V1 incremental — Statistics v5 reportDetailByPeriod is blocked"
      );
      syncLog("finance", "REFUSE statistics v5 full sync for Account 2", {
        marketplaceAccountId: this.marketplaceAccountId,
      });
      return result;
    }

    // The dedicated page-level recovery is the only Finance path allowed for
    // Account 2 while its durable campaign reservation is active.
    if (isFinanceHistoricalRecoveryActive(this.marketplaceAccountId)) {
      result.errors.push("skipped_finance_recovery_active");
      syncLog("finance", "SKIP historical recovery campaign active", {
        marketplaceAccountId: this.marketplaceAccountId,
      });
      return result;
    }

    const supabase = createAdminClient();
    const timer = getActiveSyncTimer();

    console.log("[SYNC] finance start");
    syncLog("finance", "START", { dateFrom, dateTo });

    try {
      timer?.startPhase("finance_fetch");
      syncLog("finance", "Wildberries API START: fetchFinanceReport");
      const rows = await this.client.fetchFinanceReport(dateFrom, dateTo);
      timer?.endPhase("finance_fetch");
      console.log("[SYNC] finance fetched");
      syncLog("finance", "Wildberries API END: fetchFinanceReport", { rowCount: rows.length });
      result.recordsProcessed = rows.length;

      if (getSyncExecutionContext()?.abortSignal?.aborted) {
        throw new DOMException("Sync aborted", "AbortError");
      }

      syncLog("finance", "Supabase select START: buildProductLookup");
      const lookup = await this.buildProductLookup(supabase);
      console.log("[SYNC] finance lookup built");
      syncLog("finance", "Supabase select END: buildProductLookup", { productCount: lookup.size });

      const includeExtendedColumns = await financeSchemaHasExtendedColumns(supabase);
      const includeReportIdentity = await financeSchemaHasReportIdentity(supabase);
      if (!includeExtendedColumns) {
        syncLog("finance", "finance_category column missing — upserting legacy columns only", {});
        result.errors.push(
          "finance_category column missing on wb_finance — run npm run apply:finance-category-migration"
        );
      }
      if (!includeReportIdentity) {
        syncLog("finance", "realizationreport_id column missing — run Finance Sync V2 migration", {});
        result.errors.push(
          "realizationreport_id column missing on wb_finance — run npx tsx scripts/apply-finance-sync-v2-migration.mjs"
        );
      }

      console.log("[SYNC] finance upsert start");
      syncLog("finance", "Supabase batch upsert START", { rowCount: rows.length });

      timer?.startPhase("finance_map");
      const financeLines: Array<Omit<WbFinance, "id">> = [];
      const reportIdSet = new Set<number>();
      let minOp: string | null = null;
      let maxOp: string | null = null;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          if (row.realizationreport_id != null && Number.isFinite(row.realizationreport_id)) {
            reportIdSet.add(Number(row.realizationreport_id));
          }
          const productId = row.nm_id ? lookup.get(row.nm_id) ?? null : null;
          const mapped = mapFinanceRowsFromReport(row, productId).map((line) => ({
            ...line,
            marketplace_account_id: this.marketplaceAccountId,
          }));
          for (const line of mapped) {
            const op = line.operation_date?.slice(0, 10);
            if (op) {
              if (!minOp || op < minOp) minOp = op;
              if (!maxOp || op > maxOp) maxOp = op;
            }
          }
          financeLines.push(...mapped);
        } catch (err) {
          result.errors.push(
            `Finance rrd:${row.rrd_id}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }

        if ((i + 1) % 200 === 0) {
          await yieldEventLoop();
        }
      }
      timer?.endPhase("finance_map");
      result.reportIds = [...reportIdSet].sort((a, b) => a - b);
      result.returnedFrom = minOp;
      result.returnedTo = maxOp;

      timer?.startPhase("finance_db");
      const persistenceStarted = Date.now();
      const { dbRequests: upsertDbRequests, errors: batchErrors } = await batchUpsertFinance(
        supabase,
        financeLines,
        FINANCE_BATCH_SIZE,
        (count) => {
          result.recordsUpdated += count;
        },
        includeExtendedColumns,
        includeReportIdentity
      );
      result.errors.push(...batchErrors);

      const persistenceMs = Date.now() - persistenceStarted;
      timer?.endPhase("finance_db");
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
    const timer = getActiveSyncTimer();

    syncLog("stock", "START");

    try {
      timer?.startPhase("stock_fetch");
      syncLog("stock", "Wildberries API START: fetchStocks");
      const rows = await this.client.fetchStocks();
      timer?.endPhase("stock_fetch");
      syncLog("stock", "Wildberries API END: fetchStocks", { rowCount: rows.length });
      result.recordsProcessed = rows.length;

      timer?.startPhase("stock_db");
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

        if ((i + 1) % 500 === 0) {
          await yieldEventLoop();
        }
      }

      timer?.endPhase("stock_db");
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
