/**
 * Sprint 10.3 — Incremental Sync orchestration (trigger entrypoints).
 *
 * Triggers: manual, api, scheduled (future-ready — no cron in this sprint).
 * Gated by historical backfill completion / incremental eligibility.
 */

import {
  HistoricalBackfillEngine,
  InMemoryWarehouseEntityUpsert,
  MockMarketplaceAdapter,
  evaluateIncrementalEligibility,
} from "@/lib/warehouse/backfill";
import {
  IncrementalSyncEngine,
  INCREMENTAL_SYNC_ENTITY_ORDER,
  INCREMENTAL_SYNC_MODE,
  type IncrementalSyncResult,
  type IncrementalSyncTrigger,
} from "@/lib/warehouse/incremental";
import { WarehouseCheckpointService } from "@/lib/warehouse/checkpoints/checkpoint-service";
import { WarehouseSyncSessionService } from "@/lib/warehouse/sessions/session-service";
import {
  InMemoryWarehouseCheckpointRepository,
  InMemoryWarehouseRawMetadataRepository,
  InMemoryWarehouseSyncSessionRepository,
  createWarehouseRepositories,
} from "@/lib/warehouse";
import type { WarehouseScope, WarehouseMarketplaceType } from "@/lib/warehouse/types";
import {
  createWildberriesMarketplaceAdapter,
  syncWildberriesKpiSnapshots,
  WildberriesWarehouseEntityUpsert,
} from "@/lib/marketplace-adapters";
import { marketplaceAdapterRegistry } from "@/lib/warehouse/adapters/registry";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";

export type RunIncrementalSyncInput = {
  marketplaceAccountId: string;
  companyId?: string;
  marketplaceType?: WarehouseMarketplaceType;
  trigger?: IncrementalSyncTrigger;
  lookbackHours?: number;
  /** In-memory repos + mock adapter (verify / dry-run). */
  simulate?: boolean;
  /**
   * When simulate=true, optionally seed historical-complete checkpoints first
   * so eligibility passes (default true).
   */
  seedHistoricalComplete?: boolean;
};

export type IncrementalSyncStatus = {
  marketplaceAccountId: string;
  eligibility: ReturnType<typeof evaluateIncrementalEligibility>;
  incrementalCheckpoints: Array<{
    entity: string;
    mode: string;
    status: string;
    cursor: string | null;
    progress: Record<string, unknown>;
    lastSuccessfulSyncAt: string | null;
    retryCount: number;
    errorMessage: string | null;
  }>;
};

async function resolveAccount(marketplaceAccountId: string): Promise<{
  companyId: string;
  marketplaceType: WarehouseMarketplaceType;
  apiKey: string;
}> {
  const account = await getMarketplaceAccountForSync(marketplaceAccountId);
  const marketplace = String(
    (account as { marketplace?: string }).marketplace ?? "wildberries"
  ).toLowerCase();
  const marketplaceType = (
    ["wildberries", "ozon", "lamoda", "shopify"].includes(marketplace)
      ? marketplace
      : "wildberries"
  ) as WarehouseMarketplaceType;

  return {
    companyId: String(account.company_id),
    marketplaceType,
    apiKey: account.apiKey,
  };
}

/**
 * Only supported continuous sync path after historical backfill completes.
 */
export async function runIncrementalSync(
  input: RunIncrementalSyncInput
): Promise<IncrementalSyncResult> {
  const trigger = input.trigger ?? "manual";
  if (input.simulate) {
    return runSimulatedIncrementalSync(input);
  }

  const account = await resolveAccount(input.marketplaceAccountId);
  const scope: WarehouseScope = {
    marketplaceType: input.marketplaceType ?? account.marketplaceType,
    companyId: input.companyId ?? account.companyId,
    marketplaceAccountId: String(input.marketplaceAccountId),
  };

  if (scope.marketplaceType !== "wildberries") {
    throw new Error(
      `Incremental sync adapter not registered for marketplace=${scope.marketplaceType}`
    );
  }

  const repos = createWarehouseRepositories();
  const adapter = createWildberriesMarketplaceAdapter(account.apiKey);
  marketplaceAdapterRegistry.register(adapter);

  const engine = new IncrementalSyncEngine({
    adapter,
    upsert: new WildberriesWarehouseEntityUpsert(scope.marketplaceAccountId),
    checkpoints: new WarehouseCheckpointService(repos.checkpoints),
    sessions: new WarehouseSyncSessionService(repos.sessions),
    rawMetadata: repos.rawMetadata,
  });

  const result = await engine.run({
    scope,
    trigger,
    lookbackHours: input.lookbackHours,
  });

  if (result.status === "success" || result.status === "partial") {
    await syncWildberriesKpiSnapshots({
      scope,
      apiKey: account.apiKey,
    });
  }

  return result;
}

export async function runSimulatedIncrementalSync(
  input: RunIncrementalSyncInput
): Promise<IncrementalSyncResult> {
  const scope: WarehouseScope = {
    marketplaceType: input.marketplaceType ?? "wildberries",
    companyId: input.companyId ?? "1",
    marketplaceAccountId: String(input.marketplaceAccountId),
  };

  const checkpointRepo = new InMemoryWarehouseCheckpointRepository();
  const sessionRepo = new InMemoryWarehouseSyncSessionRepository();
  const rawRepo = new InMemoryWarehouseRawMetadataRepository();
  const checkpoints = new WarehouseCheckpointService(checkpointRepo);
  const sessions = new WarehouseSyncSessionService(sessionRepo);
  const upsert = new InMemoryWarehouseEntityUpsert();

  if (input.seedHistoricalComplete !== false) {
    const backfill = new HistoricalBackfillEngine({
      adapter: new MockMarketplaceAdapter(),
      upsert,
      checkpoints,
      sessions,
      rawMetadata: rawRepo,
    });
    await backfill.run({
      scope,
      historyFrom: "2026-01-01",
      historyTo: "2026-01-07",
      trigger: "lifecycle",
      windowDays: 7,
    });
  }

  const engine = new IncrementalSyncEngine({
    adapter: new MockMarketplaceAdapter(),
    upsert,
    checkpoints,
    sessions,
    rawMetadata: rawRepo,
  });

  return engine.run({
    scope,
    trigger: input.trigger ?? "manual",
    lookbackHours: input.lookbackHours ?? 24,
  });
}

export async function getIncrementalSyncStatus(
  marketplaceAccountId: string
): Promise<IncrementalSyncStatus> {
  const repos = createWarehouseRepositories();
  const checkpoints = await repos.checkpoints.listByAccount(marketplaceAccountId);
  const eligibility = evaluateIncrementalEligibility(checkpoints, marketplaceAccountId);

  return {
    marketplaceAccountId,
    eligibility,
    incrementalCheckpoints: checkpoints
      .filter(
        (cp) =>
          cp.mode === INCREMENTAL_SYNC_MODE &&
          (INCREMENTAL_SYNC_ENTITY_ORDER as readonly string[]).includes(cp.entity)
      )
      .map((cp) => ({
        entity: cp.entity,
        mode: cp.mode,
        status: cp.status,
        cursor: cp.cursor,
        progress: cp.progress,
        lastSuccessfulSyncAt: cp.lastSuccessfulSyncAt,
        retryCount: cp.retryCount,
        errorMessage: cp.errorMessage,
      })),
  };
}

/** Future-ready scheduled trigger entry (no cron in Sprint 10.3). */
export async function runScheduledIncrementalSync(
  marketplaceAccountId: string,
  options?: Omit<RunIncrementalSyncInput, "marketplaceAccountId" | "trigger">
): Promise<IncrementalSyncResult> {
  return runIncrementalSync({
    ...options,
    marketplaceAccountId,
    trigger: "scheduled",
  });
}

export { INCREMENTAL_SYNC_MODE, INCREMENTAL_SYNC_ENTITY_ORDER };
