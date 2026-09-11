/**
 * Sprint 10.2 — Wildberries durable upsert (idempotent) for historical backfill.
 * Persists into existing project tables with upsert conflict keys.
 * Prices are held in-process until a dedicated prices table exists.
 */

import type {
  MarketplaceFinanceLineDto,
  MarketplaceOrderDto,
  MarketplacePriceDto,
  MarketplaceProductDto,
  MarketplaceSaleDto,
  MarketplaceStockDto,
} from "@/lib/warehouse/adapters/marketplace-adapter";
import type {
  WarehouseEntityUpsertPort,
  WarehouseEntityUpsertResult,
} from "@/lib/warehouse/backfill/entity-upsert";
import type { WarehouseScope } from "@/lib/warehouse/types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapApiOrderToDb,
  mapApiProductToDb,
  mapApiProductVariants,
  mapApiSaleToDb,
  mapFinanceRowsFromReport,
} from "@/lib/wildberries/mappers";
import { persistSalesEvents } from "@/lib/wildberries/sales-event-persistence";
import type { SalesEventRow } from "@/lib/wildberries/sales-event-identity";
import type {
  WbApiFinanceRow,
  WbApiOrder,
  WbApiProductCard,
  WbApiSale,
} from "@/lib/wildberries/types";
import type { WbFinance, WbOrder, WbStock } from "@/types/database";

function empty(): WarehouseEntityUpsertResult {
  return { upserted: 0, inserted: 0, updated: 0, skipped: 0 };
}

type IdRow = { id: string };

export class WildberriesWarehouseEntityUpsert implements WarehouseEntityUpsertPort {
  private readonly priceKeys = new Map<string, MarketplacePriceDto>();
  private readonly productIdByNm = new Map<number, string>();
  private readonly brandCache = new Map<string, string>();
  private readonly categoryCache = new Map<string, string>();

  constructor(private readonly marketplaceAccountId: string) {}

  async upsertProducts(
    _scope: WarehouseScope,
    items: MarketplaceProductDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = empty();
    const supabase = createAdminClient();

    for (const item of items) {
      const card = item.raw as WbApiProductCard | undefined;
      if (!card?.nmID) {
        result.skipped += 1;
        continue;
      }
      const mapped = mapApiProductToDb(card);
      const brandId = await this.ensureBrand(mapped.brand_name);
      const categoryId = await this.ensureCategory(mapped.category_name);

      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("marketplace_account_id", this.marketplaceAccountId)
        .eq("supplier_article", mapped.supplier_article)
        .maybeSingle<IdRow>();

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
      if (productId) {
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) throw error;
        result.updated += 1;
      } else {
        const { data: inserted, error } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single<IdRow>();
        if (error) throw error;
        productId = inserted.id;
        result.inserted += 1;
      }

      this.productIdByNm.set(card.nmID, productId);
      const variants = mapApiProductVariants(card, productId).map((v) => ({
        ...v,
        marketplace_account_id: this.marketplaceAccountId,
      }));
      if (variants.length) {
        await supabase.from("product_variants").upsert(variants as never, {
          onConflict: "product_id,tech_size,barcode",
        });
      }
      result.upserted += 1;
    }
    return result;
  }

  private async ensureBrand(name: string): Promise<string> {
    const cached = this.brandCache.get(name);
    if (cached) return cached;
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("brands")
      .select("id")
      .eq("name", name)
      .maybeSingle<IdRow>();
    if (existing?.id) {
      this.brandCache.set(name, existing.id);
      return existing.id;
    }
    const { data, error } = await supabase
      .from("brands")
      .insert({ name })
      .select("id")
      .single<IdRow>();
    if (error) throw error;
    this.brandCache.set(name, data.id);
    return data.id;
  }

  private async ensureCategory(name: string): Promise<string> {
    const cached = this.categoryCache.get(name);
    if (cached) return cached;
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("name", name)
      .maybeSingle<IdRow>();
    if (existing?.id) {
      this.categoryCache.set(name, existing.id);
      return existing.id;
    }
    const { data, error } = await supabase
      .from("categories")
      .insert({ name, parent_id: null })
      .select("id")
      .single<IdRow>();
    if (error) throw error;
    this.categoryCache.set(name, data.id);
    return data.id;
  }

  private async resolveProductId(nmId: number, supplierArticle?: string): Promise<string | null> {
    const cached = this.productIdByNm.get(nmId);
    if (cached) return cached;
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("marketplace_account_id", this.marketplaceAccountId)
      .eq("nm_id", nmId)
      .maybeSingle<IdRow>();
    if (data?.id) {
      this.productIdByNm.set(nmId, data.id);
      return data.id;
    }
    if (supplierArticle) {
      const { data: byArticle } = await supabase
        .from("products")
        .select("id")
        .eq("marketplace_account_id", this.marketplaceAccountId)
        .eq("supplier_article", supplierArticle)
        .maybeSingle<IdRow>();
      if (byArticle?.id) {
        this.productIdByNm.set(nmId, byArticle.id);
        return byArticle.id;
      }
    }
    return null;
  }

  async upsertOrders(
    _scope: WarehouseScope,
    items: MarketplaceOrderDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = empty();
    const supabase = createAdminClient();
    const batch: Array<Omit<WbOrder, "id">> = [];

    for (const item of items) {
      const order = item.raw as WbApiOrder | undefined;
      if (!order) {
        result.skipped += 1;
        continue;
      }
      const productId =
        (await this.resolveProductId(order.nmId, order.supplierArticle)) ??
        (await this.ensureStubProduct(order.nmId, order.supplierArticle));
      batch.push({
        ...mapApiOrderToDb(order, productId),
        marketplace_account_id: this.marketplaceAccountId,
      });
    }

    if (batch.length) {
      const { error } = await supabase.from("wb_orders").upsert(batch as never, {
        onConflict: "marketplace_account_id,srid",
      });
      if (error) throw error;
      result.upserted = batch.length;
      result.updated = batch.length;
    }
    return result;
  }

  async upsertSales(
    _scope: WarehouseScope,
    items: MarketplaceSaleDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = empty();
    const supabase = createAdminClient();
    const batch: SalesEventRow[] = [];

    for (const item of items) {
      const sale = item.raw as WbApiSale | undefined;
      if (!sale) {
        result.skipped += 1;
        continue;
      }
      const productId =
        (await this.resolveProductId(sale.nmId, sale.supplierArticle)) ??
        (await this.ensureStubProduct(sale.nmId, sale.supplierArticle));
      const mapped = mapApiSaleToDb(sale, productId);
      batch.push({
        ...mapped,
        marketplace_account_id: this.marketplaceAccountId,
        sale_id: String(mapped.sale_id),
        event_type: mapped.event_type === "RETURN" ? "RETURN" : "SALE",
      });
    }

    if (batch.length) {
      const persisted = await persistSalesEvents(supabase, batch);
      if (persisted.errors.length) {
        throw new Error(persisted.errors.join("; "));
      }
      result.upserted = persisted.upserted;
      result.updated = persisted.upserted;
    }
    return result;
  }

  async upsertFinance(
    _scope: WarehouseScope,
    items: MarketplaceFinanceLineDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = empty();
    const supabase = createAdminClient();
    const batch: Array<Omit<WbFinance, "id">> = [];

    for (const item of items) {
      const row = item.raw as WbApiFinanceRow | undefined;
      if (!row) {
        result.skipped += 1;
        continue;
      }
      const productId = row.nm_id
        ? await this.resolveProductId(row.nm_id, row.sa_name ?? undefined)
        : null;
      const lines = mapFinanceRowsFromReport(row, productId);
      for (const line of lines) {
        batch.push({
          ...line,
          marketplace_account_id: this.marketplaceAccountId,
        });
      }
    }

    if (batch.length) {
      const { error } = await supabase.from("wb_finance").upsert(batch as never, {
        onConflict: "marketplace_account_id,source_key",
      });
      if (error) throw error;
      result.upserted = batch.length;
      result.updated = batch.length;
    }
    return result;
  }

  async upsertStocks(
    _scope: WarehouseScope,
    items: MarketplaceStockDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = empty();
    const supabase = createAdminClient();
    const batch: Array<Omit<WbStock, "id">> = [];
    const syncedAt = new Date().toISOString();

    for (const item of items) {
      const nmId = Number(item.externalProductId);
      if (!Number.isFinite(nmId)) {
        result.skipped += 1;
        continue;
      }
      const productId =
        (await this.resolveProductId(nmId)) ?? (await this.ensureStubProduct(nmId));
      batch.push({
        marketplace_account_id: this.marketplaceAccountId,
        product_id: productId,
        tech_size: "",
        barcode: null,
        warehouse: item.warehouseCode ?? "_",
        quantity: item.quantity ?? 0,
        quantity_full: item.quantity ?? 0,
        in_way_to_client: 0,
        in_way_from_client: 0,
        last_synced_at: syncedAt,
      });
    }

    if (batch.length) {
      const { error } = await supabase.from("wb_stock").upsert(batch as never, {
        onConflict: "product_id,tech_size,barcode,warehouse",
      });
      if (error) throw error;
      result.upserted = batch.length;
      result.updated = batch.length;
    }
    return result;
  }

  async upsertPrices(
    scope: WarehouseScope,
    items: MarketplacePriceDto[]
  ): Promise<WarehouseEntityUpsertResult> {
    const result = empty();
    const prefix = `${scope.marketplaceType}|${scope.companyId}|${scope.marketplaceAccountId}`;
    for (const item of items) {
      const key = `${prefix}|${item.externalProductId}`;
      if (this.priceKeys.has(key)) result.updated += 1;
      else result.inserted += 1;
      this.priceKeys.set(key, item);
      result.upserted += 1;
    }
    return result;
  }

  private async ensureStubProduct(nmId: number, supplierArticle?: string): Promise<string> {
    const supabase = createAdminClient();
    const article = supplierArticle ?? `nm-${nmId}`;
    const brandId = await this.ensureBrand("Unknown");
    const categoryId = await this.ensureCategory("Uncategorized");
    const { data: inserted, error } = await supabase
      .from("products")
      .insert({
        marketplace_account_id: this.marketplaceAccountId,
        supplier_article: article,
        nm_id: nmId,
        name: article,
        brand_id: brandId,
        category_id: categoryId,
        barcode: null,
      })
      .select("id")
      .single<IdRow>();
    if (error) {
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("marketplace_account_id", this.marketplaceAccountId)
        .eq("supplier_article", article)
        .maybeSingle<IdRow>();
      if (existing?.id) {
        this.productIdByNm.set(nmId, existing.id);
        return existing.id;
      }
      throw error;
    }
    this.productIdByNm.set(nmId, inserted.id);
    return inserted.id;
  }
}
