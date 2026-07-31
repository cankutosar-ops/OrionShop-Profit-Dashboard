/**
 * Inventory shipment history — warehouse DB only (Sprint 10.6).
 * Live supplies API removed from business read path.
 * Returns empty until a dedicated warehouse supply snapshot is populated by sync.
 */

import type { InventoryShipmentHistoryResult } from "@/lib/inventory-shipment-history";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createServerClient } from "@/lib/supabase/server";

async function resolveProductNmId(
  productId: string,
  marketplaceAccountId: string
): Promise<number | null> {
  const client = await createServerClient();
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

export async function getShipmentHistoryForProduct(params: {
  productId: string;
  marketplaceAccountId: string;
}): Promise<InventoryShipmentHistoryResult> {
  if (!getSupabaseEnv().isConfigured) {
    return {
      productId: params.productId,
      nmId: null,
      shipments: [],
      unavailableReason: "Database not configured",
    };
  }

  const nmId = await resolveProductNmId(params.productId, params.marketplaceAccountId);
  return {
    productId: params.productId,
    nmId,
    shipments: [],
    unavailableReason:
      "Shipment history is not yet available from warehouse snapshots. Supplies sync is deferred.",
  };
}
