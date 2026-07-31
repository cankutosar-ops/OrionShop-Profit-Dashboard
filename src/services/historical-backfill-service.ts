/**
 * Sprint 10.2 — Historical Backfill orchestration (trigger entrypoints).
 *
 * Triggers:
 * - lifecycle (new marketplace account connected)
 * - rebuild_history (manual rebuild — future UI)
 *
 * Incremental sync is NOT started here — only eligibility is enabled.
 */

import {
  HistoricalBackfillEngine,
  HISTORICAL_BACKFILL_ENTITY_ORDER,
  InMemoryWarehouseEntityUpsert,
  MockMarketplaceAdapter,
  evaluateIncrementalEligibility,
  type HistoricalBackfillResult,
  type HistoricalBackfillTrigger,
} from "@/lib/warehouse/backfill";
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
export type RunHistoricalBackfillInput = {
  marketplaceAccountId: string;
  companyId?: string;
  marketplaceType?: WarehouseMarketplaceType;
  historyFrom?: string;
  historyTo?: string;
  forceRestart?: boolean;
  trigger?: HistoricalBackfillTrigger;
  /** Use in-memory repos + mock adapter (verify / dry-run). */
  simulate?: boolean;
  windowDays?: number;
};

export type HistoricalBackfillStatus = {
  marketplaceAccountId: string;
  eligibility: ReturnType<typeof evaluateIncrementalEligibility>;
  checkpoints: Array<{
    entity: string;
    mode: string;
    status: string;
    cursor: string | null;
    progress: Record<string, unknown>;
    lastSuccessfulSyncAt: string | null;
    retryCount: number;
  }>;
};

function defaultHistoryFrom(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultHistoryTo(): string {
  return new Date().toISOString().slice(0, 10);
}

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
 * Only supported entry for initializing a newly connected marketplace account's
 * historical warehouse data (plus rebuild_history).
 */
export async function runHistoricalBackfill(
  input: RunHistoricalBackfillInput
): Promise<HistoricalBackfillResult> {
  const trigger = input.trigger ?? "manual";
  if (trigger !== "lifecycle" && trigger !== "rebuild_history" && trigger !== "manual" && trigger !== "recover" && trigger !== "replay") {
    throw new Error(`Unsupported backfill trigger: ${String(trigger)}`);
  }

  if (input.simulate) {
    return runSimulatedBackfill(input);
  }

  const account = await resolveAccount(input.marketplaceAccountId);
  const scope: WarehouseScope = {
    marketplaceType: input.marketplaceType ?? account.marketplaceType,
    companyId: input.companyId ?? account.companyId,
    marketplaceAccountId: String(input.marketplaceAccountId),
  };

  if (scope.marketplaceType !== "wildberries") {
    throw new Error(
      `Historical backfill adapter not registered for marketplace=${scope.marketplaceType}`
    );
  }

  const repos = createWarehouseRepositories();
  const adapter = createWildberriesMarketplaceAdapter(account.apiKey);
  marketplaceAdapterRegistry.register(adapter);

  const engine = new HistoricalBackfillEngine({
    adapter,
    upsert: new WildberriesWarehouseEntityUpsert(scope.marketplaceAccountId),
    checkpoints: new WarehouseCheckpointService(repos.checkpoints),
    sessions: new WarehouseSyncSessionService(repos.sessions),
    rawMetadata: repos.rawMetadata,
  });

  const historyFrom = input.historyFrom ?? defaultHistoryFrom();
  const historyTo = input.historyTo ?? defaultHistoryTo();

  const result = await engine.run({
    scope,
    historyFrom,
    historyTo,
    forceRestart: input.forceRestart,
    trigger,
    windowDays: input.windowDays,
  });

  if (result.status === "success") {
    await syncWildberriesKpiSnapshots({
      scope,
      apiKey: account.apiKey,
      historyFrom,
      historyTo,
    });
  }

  return result;
}

/** In-memory path for verification — no marketplace HTTP, no Supabase warehouse tables required. */
export async function runSimulatedBackfill(
  input: RunHistoricalBackfillInput
): Promise<HistoricalBackfillResult> {
  const scope: WarehouseScope = {
    marketplaceType: input.marketplaceType ?? "wildberries",
    companyId: input.companyId ?? "1",
    marketplaceAccountId: String(input.marketplaceAccountId),
  };

  const checkpointRepo = new InMemoryWarehouseCheckpointRepository();
  const sessionRepo = new InMemoryWarehouseSyncSessionRepository();
  const rawRepo = new InMemoryWarehouseRawMetadataRepository();

  const engine = new HistoricalBackfillEngine({
    adapter: new MockMarketplaceAdapter(),
    upsert: new InMemoryWarehouseEntityUpsert(),
    checkpoints: new WarehouseCheckpointService(checkpointRepo),
    sessions: new WarehouseSyncSessionService(sessionRepo),
    rawMetadata: rawRepo,
  });

  return engine.run({
    scope,
    historyFrom: input.historyFrom ?? "2026-01-01",
    historyTo: input.historyTo ?? "2026-01-31",
    forceRestart: input.forceRestart,
    trigger: input.trigger ?? "lifecycle",
    windowDays: input.windowDays ?? 30,
  });
}

export async function getHistoricalBackfillStatus(
  marketplaceAccountId: string
): Promise<HistoricalBackfillStatus> {
  const repos = createWarehouseRepositories();
  const checkpoints = await repos.checkpoints.listByAccount(marketplaceAccountId);
  const eligibility = evaluateIncrementalEligibility(checkpoints, marketplaceAccountId);

  return {
    marketplaceAccountId,
    eligibility,
    checkpoints: checkpoints
      .filter((cp) =>
        (HISTORICAL_BACKFILL_ENTITY_ORDER as readonly string[]).includes(cp.entity)
      )
      .map((cp) => ({
        entity: cp.entity,
        mode: cp.mode,
        status: cp.status,
        cursor: cp.cursor,
        progress: cp.progress,
        lastSuccessfulSyncAt: cp.lastSuccessfulSyncAt,
        retryCount: cp.retryCount,
      })),
  };
}

/**
 * Future-ready hook for account connection / rebuild history.
 * Call with trigger=lifecycle when a new marketplace account is connected.
 */
export async function triggerHistoricalBackfillOnAccountConnect(
  marketplaceAccountId: string,
  options?: Omit<RunHistoricalBackfillInput, "marketplaceAccountId" | "trigger">
): Promise<HistoricalBackfillResult> {
  return runHistoricalBackfill({
    ...options,
    marketplaceAccountId,
    trigger: "lifecycle",
  });
}

export async function triggerRebuildHistory(
  marketplaceAccountId: string,
  options?: Omit<RunHistoricalBackfillInput, "marketplaceAccountId" | "trigger" | "forceRestart">
): Promise<HistoricalBackfillResult> {
  return runHistoricalBackfill({
    ...options,
    marketplaceAccountId,
    trigger: "rebuild_history",
    forceRestart: true,
  });
}
