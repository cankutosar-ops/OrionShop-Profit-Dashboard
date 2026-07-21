import {
  buildShipmentEntry,
  defaultSupplyDateFrom,
  defaultSupplyDateTill,
  INBOUND_SUPPLY_STATUS_IDS,
  resolveSupplyIdentity,
  sortShipmentsNewestFirst,
  type InventoryShipmentEntry,
  type InventoryShipmentHistoryResult,
} from "@/lib/inventory-shipment-history";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createServerClient } from "@/lib/supabase/server";
import { WbApiClient } from "@/lib/wildberries/api-client";
import type { WbApiSupplyListItem } from "@/lib/wildberries/types";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";

const CACHE_TTL_MS = 30 * 60 * 1000;
/** Cap supplies scanned per account to keep History responsive under rate limits. */
const MAX_SUPPLIES_SCAN = 80;

type AccountShipmentIndex = {
  builtAt: number;
  byNmId: Map<number, InventoryShipmentEntry[]>;
  suppliesScanned: number;
};

const accountIndexCache = new Map<string, AccountShipmentIndex>();
const accountBuildInFlight = new Map<string, Promise<AccountShipmentIndex>>();

async function resolveProductNmId(
  productId: string,
  marketplaceAccountId: string
): Promise<number | null> {
  const client = createServerClient();
  const { data, error } = await client
    .from("products")
    .select("id, nm_id, marketplace_account_id")
    .eq("id", productId)
    .eq("marketplace_account_id", marketplaceAccountId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load product: ${error.message}`);
  if (!data?.nm_id) return null;
  return Number(data.nm_id);
}

async function listInboundSupplies(wb: WbApiClient): Promise<WbApiSupplyListItem[]> {
  const from = defaultSupplyDateFrom();
  const till = defaultSupplyDateTill();
  const statusIDs = [...INBOUND_SUPPLY_STATUS_IDS];

  let rows = await wb.listSupplies(
    {
      statusIDs,
      dates: [{ from, till, type: "factDate" }],
    },
    { limit: MAX_SUPPLIES_SCAN, offset: 0 }
  );

  if (!rows.length) {
    rows = await wb.listSupplies(
      {
        statusIDs,
        dates: [{ from, till, type: "createDate" }],
      },
      { limit: MAX_SUPPLIES_SCAN, offset: 0 }
    );
  }

  return rows.slice(0, MAX_SUPPLIES_SCAN);
}

async function buildAccountShipmentIndex(
  marketplaceAccountId: string,
  apiKey: string
): Promise<AccountShipmentIndex> {
  const wb = new WbApiClient(apiKey);
  const supplies = await listInboundSupplies(wb);
  const byNmId = new Map<number, InventoryShipmentEntry[]>();

  for (const listItem of supplies) {
    const identity = resolveSupplyIdentity(listItem);
    if (!identity) continue;

    let goods;
    try {
      goods = await wb.fetchSupplyGoods(identity.id, {
        isPreorderID: identity.isPreorderID,
      });
    } catch {
      continue;
    }

    const goodsByNm = new Map<number, typeof goods>();
    for (const good of goods) {
      const nmId = Number(good.nmID);
      if (!Number.isFinite(nmId) || nmId <= 0) continue;
      const list = goodsByNm.get(nmId) ?? [];
      list.push(good);
      goodsByNm.set(nmId, list);
    }

    if (goodsByNm.size === 0) continue;

    let details;
    try {
      details = await wb.fetchSupplyDetails(identity.id, identity.isPreorderID);
    } catch {
      continue;
    }

    for (const [nmId, goodsForProduct] of goodsByNm) {
      const entry = buildShipmentEntry({
        listItem,
        details,
        goodsForProduct,
        nmId,
      });
      if (!entry) continue;
      const list = byNmId.get(nmId) ?? [];
      list.push(entry);
      byNmId.set(nmId, list);
    }
  }

  for (const [nmId, entries] of byNmId) {
    byNmId.set(nmId, sortShipmentsNewestFirst(entries));
  }

  return {
    builtAt: Date.now(),
    byNmId,
    suppliesScanned: supplies.length,
  };
}

async function getAccountShipmentIndex(
  marketplaceAccountId: string,
  apiKey: string
): Promise<{ index: AccountShipmentIndex; cached: boolean }> {
  const cached = accountIndexCache.get(marketplaceAccountId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return { index: cached, cached: true };
  }

  const inflight = accountBuildInFlight.get(marketplaceAccountId);
  if (inflight) {
    const index = await inflight;
    return { index, cached: false };
  }

  const buildPromise = buildAccountShipmentIndex(marketplaceAccountId, apiKey)
    .then((index) => {
      accountIndexCache.set(marketplaceAccountId, index);
      return index;
    })
    .finally(() => {
      accountBuildInFlight.delete(marketplaceAccountId);
    });

  accountBuildInFlight.set(marketplaceAccountId, buildPromise);
  const index = await buildPromise;
  return { index, cached: false };
}

/**
 * Inbound warehouse shipment history for one product (by nmId).
 * Live WB Supplies API — no DB persistence, isolated from inventory calcs.
 */
export async function getShipmentHistoryForProduct(params: {
  marketplaceAccountId: string;
  productId: string;
}): Promise<InventoryShipmentHistoryResult | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const nmId = await resolveProductNmId(params.productId, params.marketplaceAccountId);
  if (nmId == null) {
    return {
      productId: params.productId,
      nmId: 0,
      shipments: [],
      suppliesScanned: 0,
      cached: false,
      source: "wb_supplies_api",
    };
  }

  const account = await getMarketplaceAccountForSync(params.marketplaceAccountId);
  const { index, cached } = await getAccountShipmentIndex(
    params.marketplaceAccountId,
    account.apiKey
  );

  return {
    productId: params.productId,
    nmId,
    shipments: index.byNmId.get(nmId) ?? [],
    suppliesScanned: index.suppliesScanned,
    cached,
    source: "wb_supplies_api",
  };
}
