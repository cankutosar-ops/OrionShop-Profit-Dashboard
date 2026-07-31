/**
 * Sprint 10.1 — In-memory adapter registry (no adapters registered yet).
 */

import type {
  MarketplaceAdapter,
  MarketplaceAdapterRegistry,
} from "@/lib/warehouse/adapters/marketplace-adapter";
import type { WarehouseMarketplaceType } from "@/lib/warehouse/types";

export class InMemoryMarketplaceAdapterRegistry implements MarketplaceAdapterRegistry {
  private readonly byMarketplace = new Map<WarehouseMarketplaceType, MarketplaceAdapter>();

  get(marketplace: WarehouseMarketplaceType): MarketplaceAdapter | null {
    return this.byMarketplace.get(marketplace) ?? null;
  }

  list(): readonly MarketplaceAdapter[] {
    return [...this.byMarketplace.values()];
  }

  register(adapter: MarketplaceAdapter): void {
    this.byMarketplace.set(adapter.capabilities.marketplace, adapter);
  }
}

export const marketplaceAdapterRegistry = new InMemoryMarketplaceAdapterRegistry();
