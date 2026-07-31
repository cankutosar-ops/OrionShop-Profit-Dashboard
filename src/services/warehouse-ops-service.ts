/**
 * Sprint 10.4 — Warehouse Ops service (scheduler tick, queue, monitoring, admin readiness).
 */

import {
  HistoricalBackfillEngine,
  InMemoryWarehouseEntityUpsert,
  MockMarketplaceAdapter,
} from "@/lib/warehouse/backfill";
import {
  IncrementalSyncEngine,
  type IncrementalSyncEntity,
} from "@/lib/warehouse/incremental";
import {
  WarehouseAdminReadinessService,
  WarehouseOpsOrchestrator,
  type WarehouseAdminStatusBundle,
  type WarehouseMonitoringSnapshot,
} from "@/lib/warehouse/ops";
import { WarehouseCheckpointService } from "@/lib/warehouse/checkpoints/checkpoint-service";
import { WarehouseSyncSessionService } from "@/lib/warehouse/sessions/session-service";
import {
  InMemoryWarehouseCheckpointRepository,
  InMemoryWarehouseRawMetadataRepository,
  InMemoryWarehouseSyncSessionRepository,
} from "@/lib/warehouse";
import type { WarehouseScope, WarehouseMarketplaceType } from "@/lib/warehouse/types";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import {
  createWildberriesMarketplaceAdapter,
  syncWildberriesKpiSnapshots,
  WildberriesWarehouseEntityUpsert,
} from "@/lib/marketplace-adapters";
import { createWarehouseRepositories } from "@/lib/warehouse/repositories";
import { marketplaceAdapterRegistry } from "@/lib/warehouse/adapters/registry";

/** Process-local ops orchestrator for simulate / single-node tick. */
const simulateOrchestrators = new Map<string, WarehouseOpsOrchestrator>();

function getSimulateOrchestrator(accountId: string): WarehouseOpsOrchestrator {
  let ops = simulateOrchestrators.get(accountId);
  if (!ops) {
    const checkpointRepo = new InMemoryWarehouseCheckpointRepository();
    const sessionRepo = new InMemoryWarehouseSyncSessionRepository();
    const rawRepo = new InMemoryWarehouseRawMetadataRepository();
    const checkpoints = new WarehouseCheckpointService(checkpointRepo);
    const sessions = new WarehouseSyncSessionService(sessionRepo);
    const upsert = new InMemoryWarehouseEntityUpsert();

    ops = new WarehouseOpsOrchestrator({
      runner: async ({ scope, entities, trigger }) => {
        // Ensure historical eligibility for simulate path
        const eligibilityCheckpoints = await checkpointRepo.listByAccount(
          scope.marketplaceAccountId
        );
        const hasHistorical = eligibilityCheckpoints.some(
          (c) => c.mode === "historical_backfill" && c.status === "complete"
        );
        if (!hasHistorical) {
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
          trigger,
          entities,
        });
      },
    });
    simulateOrchestrators.set(accountId, ops);
  }
  return ops;
}

async function resolveScope(
  marketplaceAccountId: string,
  overrides?: { companyId?: string; marketplaceType?: WarehouseMarketplaceType }
): Promise<WarehouseScope> {
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
    marketplaceType: overrides?.marketplaceType ?? marketplaceType,
    companyId: overrides?.companyId ?? String(account.company_id),
    marketplaceAccountId: String(marketplaceAccountId),
  };
}

function createLiveOrchestrator(scope: WarehouseScope, apiKey: string): WarehouseOpsOrchestrator {
  const repos = createWarehouseRepositories();
  const adapter = createWildberriesMarketplaceAdapter(apiKey);
  marketplaceAdapterRegistry.register(adapter);
  const upsert = new WildberriesWarehouseEntityUpsert(scope.marketplaceAccountId);

  return new WarehouseOpsOrchestrator({
    runner: async ({ scope: runScope, entities, trigger }) => {
      const engine = new IncrementalSyncEngine({
        adapter,
        upsert,
        checkpoints: new WarehouseCheckpointService(repos.checkpoints),
        sessions: new WarehouseSyncSessionService(repos.sessions),
        rawMetadata: repos.rawMetadata,
      });
      return engine.run({
        scope: runScope,
        trigger,
        entities,
      });
    },
  });
}

export type WarehouseOpsTickInput = {
  marketplaceAccountId: string;
  companyId?: string;
  marketplaceType?: WarehouseMarketplaceType;
  simulate?: boolean;
  processQueue?: boolean;
  /** Make all schedules due immediately (tests / force). */
  forceDue?: boolean;
};

export async function runWarehouseOpsTick(input: WarehouseOpsTickInput) {
  if (input.simulate) {
    const scope: WarehouseScope = {
      marketplaceType: input.marketplaceType ?? "wildberries",
      companyId: input.companyId ?? "1",
      marketplaceAccountId: String(input.marketplaceAccountId),
    };
    const ops = getSimulateOrchestrator(scope.marketplaceAccountId);
    if (input.forceDue) {
      ops.scheduler.markAllDue(scope, new Date(0).toISOString());
    }
    return ops.runCycle(scope, { processQueue: input.processQueue !== false });
  }

  const scope = await resolveScope(input.marketplaceAccountId, input);
  const account = await getMarketplaceAccountForSync(input.marketplaceAccountId);
  const ops = createLiveOrchestrator(scope, account.apiKey);
  if (input.forceDue) {
    ops.scheduler.markAllDue(scope, new Date(0).toISOString());
  }
  const cycle = await ops.runCycle(scope, { processQueue: input.processQueue !== false });
  await syncWildberriesKpiSnapshots({
    scope,
    apiKey: account.apiKey,
  });
  return cycle;
}

export async function getWarehouseOpsMonitoring(
  marketplaceAccountId: string,
  options?: { simulate?: boolean; companyId?: string; marketplaceType?: WarehouseMarketplaceType }
): Promise<WarehouseMonitoringSnapshot> {
  if (options?.simulate) {
    const ops = getSimulateOrchestrator(marketplaceAccountId);
    const scope: WarehouseScope = {
      marketplaceType: options.marketplaceType ?? "wildberries",
      companyId: options.companyId ?? "1",
      marketplaceAccountId: String(marketplaceAccountId),
    };
    ops.store.ensureDefaultSchedules(scope);
    return ops.getMonitoring(marketplaceAccountId);
  }

  // Live monitoring from a fresh orchestrator store is empty unless we persist —
  // expose admin bundle from simulate-capable status via checkpoints/sessions for eligibility,
  // and return empty-queue monitoring with unknown health when no process-local state.
  const scope = await resolveScope(marketplaceAccountId, options);
  const ops = new WarehouseOpsOrchestrator();
  ops.store.ensureDefaultSchedules(scope);
  return ops.getMonitoring(marketplaceAccountId);
}

export async function getWarehouseAdminBundle(
  marketplaceAccountId: string,
  options?: { simulate?: boolean; companyId?: string; marketplaceType?: WarehouseMarketplaceType }
): Promise<WarehouseAdminStatusBundle> {
  const scope: WarehouseScope = options?.simulate
    ? {
        marketplaceType: options.marketplaceType ?? "wildberries",
        companyId: options.companyId ?? "1",
        marketplaceAccountId: String(marketplaceAccountId),
      }
    : await resolveScope(marketplaceAccountId, options);

  const ops = options?.simulate
    ? getSimulateOrchestrator(marketplaceAccountId)
    : new WarehouseOpsOrchestrator();
  const admin = new WarehouseAdminReadinessService(ops);
  return admin.getFullBundle(scope);
}

export async function enqueueManualWarehouseSync(input: {
  marketplaceAccountId: string;
  entities?: IncrementalSyncEntity[];
  simulate?: boolean;
  companyId?: string;
  marketplaceType?: WarehouseMarketplaceType;
  processNow?: boolean;
}) {
  if (input.simulate) {
    const scope: WarehouseScope = {
      marketplaceType: input.marketplaceType ?? "wildberries",
      companyId: input.companyId ?? "1",
      marketplaceAccountId: String(input.marketplaceAccountId),
    };
    const ops = getSimulateOrchestrator(scope.marketplaceAccountId);
    const enqueued = ops.enqueueManual(scope, input.entities);
    const process =
      input.processNow === false
        ? null
        : await ops.processNext(scope);
    return { enqueued, process, monitoring: ops.getMonitoring(scope.marketplaceAccountId) };
  }

  const scope = await resolveScope(input.marketplaceAccountId, input);
  const account = await getMarketplaceAccountForSync(input.marketplaceAccountId);
  const ops = createLiveOrchestrator(scope, account.apiKey);
  const enqueued = ops.enqueueManual(scope, input.entities);
  const process =
    input.processNow === false ? null : await ops.processNext(scope);
  return { enqueued, process, monitoring: ops.getMonitoring(scope.marketplaceAccountId) };
}

export async function cancelWarehouseQueueJobs(input: {
  marketplaceAccountId: string;
  jobId?: string;
  simulate?: boolean;
}) {
  const ops = input.simulate
    ? getSimulateOrchestrator(input.marketplaceAccountId)
    : new WarehouseOpsOrchestrator();
  const cancelled = ops.queue.cancelWaiting(input.marketplaceAccountId, input.jobId);
  return { cancelled };
}

export async function setWarehouseScheduleInterval(input: {
  marketplaceAccountId: string;
  entity: IncrementalSyncEntity;
  intervalMs: number;
  simulate?: boolean;
  companyId?: string;
  marketplaceType?: WarehouseMarketplaceType;
}) {
  const scope: WarehouseScope = {
    marketplaceType: input.marketplaceType ?? "wildberries",
    companyId: input.companyId ?? "1",
    marketplaceAccountId: String(input.marketplaceAccountId),
  };
  const ops = input.simulate
    ? getSimulateOrchestrator(input.marketplaceAccountId)
    : new WarehouseOpsOrchestrator();
  ops.store.ensureDefaultSchedules(scope);
  const schedule = ops.store.updateScheduleInterval(
    input.marketplaceAccountId,
    input.entity,
    input.intervalMs
  );
  return { schedule };
}

/** Test helper — reset simulate orchestrator state. */
export function resetSimulatedWarehouseOps(marketplaceAccountId?: string): void {
  if (marketplaceAccountId) simulateOrchestrators.delete(String(marketplaceAccountId));
  else simulateOrchestrators.clear();
}
