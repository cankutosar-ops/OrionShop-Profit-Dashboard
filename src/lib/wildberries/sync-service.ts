import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminClient } from "@/lib/supabase/admin";
import { WbApiClient, type WbSyncEntity, type WbSyncOptions, type WbSyncResult } from "./api-client";
import { syncLog } from "./sync-log";
import {
  isWithinDateRange,
  mapApiOrderToDb,
  mapApiProductToDb,
  mapApiProductVariants,
  mapApiSaleToDb,
  mapFinanceRowsFromReport,
  toDateString,
} from "./mappers";
import type { WbApiOrder, WbApiSale } from "./types";
import type { TableRowPick, WbFinance } from "@/types/database";

type ProductLookup = Map<number, string>;
type ProductIdRow = TableRowPick<"products", "id">;
type BrandIdRow = TableRowPick<"brands", "id">;
type CategoryIdRow = TableRowPick<"categories", "id">;
type WbOrderIdRow = TableRowPick<"wb_orders", "id">;
type WbSaleIdRow = TableRowPick<"wb_sales", "id">;
type ProductLookupRow = TableRowPick<"products", "id" | "nm_id">;

export class WbSyncService {
  private client: WbApiClient;

  constructor(client?: WbApiClient) {
    this.client = client ?? new WbApiClient();
  }

  async syncAll(options: WbSyncOptions): Promise<WbSyncResult[]> {
    const entities = options.entities ?? ["products", "orders", "sales", "finance"];
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
            .eq("supplier_article", mapped.supplier_article)
            .maybeSingle<ProductIdRow>();
          syncLog("products", "Supabase select END: products", {
            supplier_article: mapped.supplier_article,
            found: Boolean(existing),
          });

          const payload = {
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
            const variants = mapApiProductVariants(card, productId);
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
      syncLog("orders", "Supabase upsert loop START", { orderCount: filtered.length });

      for (let i = 0; i < filtered.length; i++) {
        const order = filtered[i];
        if (i === 0 || (i + 1) % 50 === 0 || i === filtered.length - 1) {
          syncLog("orders", "Supabase upsert progress", {
            index: i + 1,
            total: filtered.length,
            srid: order.srid ?? order.nmId,
          });
        }
        try {
          await this.upsertOrder(supabase, order, lookup, result);
        } catch (err) {
          result.errors.push(
            `Order ${order.srid ?? order.nmId}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }

      console.log("[SYNC] orders upsert end");
      syncLog("orders", "Supabase upsert loop END", {
        inserted: result.recordsInserted,
        updated: result.recordsUpdated,
        errors: result.errors.length,
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
      syncLog("finance", "Supabase upsert loop START", { rowCount: rows.length });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (i === 0 || (i + 1) % 100 === 0 || i === rows.length - 1) {
          syncLog("finance", "Supabase upsert progress", {
            index: i + 1,
            total: rows.length,
            rrd_id: row.rrd_id,
          });
        }
        try {
          const productId = row.nm_id ? lookup.get(row.nm_id) ?? null : null;
          const financeLines = mapFinanceRowsFromReport(row, productId);

          for (const line of financeLines) {
            await this.upsertFinanceLine(supabase, line, result);
          }
        } catch (err) {
          result.errors.push(
            `Finance rrd:${row.rrd_id}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }

      console.log("[SYNC] finance upsert end");
      syncLog("finance", "Supabase upsert loop END", {
        inserted: result.recordsInserted,
        updated: result.recordsUpdated,
        errors: result.errors.length,
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

  private async upsertOrder(
    supabase: AdminClient,
    order: WbApiOrder,
    lookup: ProductLookup,
    result: WbSyncResult
  ) {
    syncLog("orders", "Supabase upsert START: wb_orders", { srid: order.srid ?? order.nmId });
    syncLog("orders", "Supabase resolveProductId START", { nmId: order.nmId });
    const productId = await this.resolveProductId(supabase, lookup, order);
    syncLog("orders", "Supabase resolveProductId END", { nmId: order.nmId, productId });
    const payload = mapApiOrderToDb(order, productId);
    syncLog("orders", "Supabase select START: wb_orders", { srid: payload.srid });
    const { data: existing } = await supabase
      .from("wb_orders")
      .select("id")
      .eq("srid", payload.srid)
      .maybeSingle<WbOrderIdRow>();
    syncLog("orders", "Supabase select END: wb_orders", { srid: payload.srid, found: Boolean(existing) });

    if (existing) {
      syncLog("orders", "Supabase update START: wb_orders", { id: existing.id, srid: payload.srid });
      const { error } = await supabase.from("wb_orders").update(payload).eq("id", existing.id);
      syncLog("orders", "Supabase update END: wb_orders", { id: existing.id, ok: !error });
      if (error) throw error;
      result.recordsUpdated += 1;
    } else {
      syncLog("orders", "Supabase insert START: wb_orders", { srid: payload.srid });
      const { error } = await supabase.from("wb_orders").insert(payload);
      syncLog("orders", "Supabase insert END: wb_orders", { srid: payload.srid, ok: !error });
      if (error) throw error;
      result.recordsInserted += 1;
    }
    syncLog("orders", "Supabase upsert END: wb_orders", { srid: order.srid ?? order.nmId });
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
    const payload = mapApiSaleToDb(sale, productId);
    syncLog("sales", "Supabase select START: wb_sales", { srid: payload.srid });
    const { data: existing } = await supabase
      .from("wb_sales")
      .select("id")
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

  private async upsertFinanceLine(
    supabase: AdminClient,
    line: Omit<WbFinance, "id">,
    result: WbSyncResult
  ) {
    if (!line.source_key) {
      throw new Error("Finance line missing source_key");
    }

    syncLog("finance", "Supabase upsert START: wb_finance", {
      source_key: line.source_key,
      operation_type: line.operation_type,
    });

    const { data: existing } = await supabase
      .from("wb_finance")
      .select("id")
      .eq("source_key", line.source_key)
      .maybeSingle<{ id: string }>();

    if (existing) {
      const { error } = await supabase.from("wb_finance").update(line).eq("id", existing.id);
      syncLog("finance", "Supabase update END: wb_finance", {
        source_key: line.source_key,
        ok: !error,
      });
      if (error) throw error;
      result.recordsUpdated += 1;
    } else {
      const { error } = await supabase.from("wb_finance").insert(line);
      syncLog("finance", "Supabase insert END: wb_finance", {
        source_key: line.source_key,
        ok: !error,
      });
      if (error) throw error;
      result.recordsInserted += 1;
    }

    syncLog("finance", "Supabase upsert END: wb_finance", { source_key: line.source_key });
  }

  private async resolveProductId(
    supabase: AdminClient,
    lookup: ProductLookup,
    item: { nmId: number; supplierArticle?: string; subject?: string; category?: string; brand?: string }
  ): Promise<string> {
    const cached = lookup.get(item.nmId);
    if (cached) return cached;

    const supplierArticle = item.supplierArticle ?? `nm-${item.nmId}`;
    const brandId = await this.ensureBrand(supabase, item.brand ?? "Unknown");
    const categoryId = await this.ensureCategory(supabase, item.category ?? item.subject ?? "Uncategorized");

    const { data: byNm } = await supabase
      .from("products")
      .select("id")
      .eq("nm_id", item.nmId)
      .maybeSingle<ProductIdRow>();

    if (byNm) {
      lookup.set(item.nmId, byNm.id);
      return byNm.id;
    }

    syncLog("resolveProductId", "Supabase insert START: products", { nmId: item.nmId, supplierArticle });
    const { data: inserted, error } = await supabase
      .from("products")
      .insert({
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
      const { data: byArticle } = await supabase
        .from("products")
        .select("id")
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
    const { data, error } = await supabase.from("products").select("id, nm_id");
    if (error) throw error;

    const rows = (data ?? []) as ProductLookupRow[];
    const lookup = new Map<number, string>();
    for (const product of rows) {
      lookup.set(product.nm_id, product.id);
    }
    return lookup;
  }

  private async ensureBrand(supabase: AdminClient, name: string): Promise<string> {
    const { data: existing } = await supabase
      .from("brands")
      .select("id")
      .eq("name", name)
      .maybeSingle<BrandIdRow>();

    if (existing) return existing.id;

    syncLog("ensureBrand", "Supabase insert START: brands", { name });
    const { data, error } = await supabase
      .from("brands")
      .insert({ name })
      .select("id")
      .single<BrandIdRow>();
    syncLog("ensureBrand", "Supabase insert END: brands", { name, ok: !error });
    if (error) throw error;
    return data.id;
  }

  private async ensureCategory(supabase: AdminClient, name: string): Promise<string> {
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("name", name)
      .maybeSingle<CategoryIdRow>();

    if (existing) return existing.id;

    syncLog("ensureCategory", "Supabase insert START: categories", { name });
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

export const wbSyncService = new WbSyncService();
