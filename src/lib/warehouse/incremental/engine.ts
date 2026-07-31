/**
 * Sprint 10.3 — Incremental Sync Engine.
 *
 * Historical First → Incremental Forever.
 * Allowed only when historical backfill is complete and account is incremental-eligible.
 * Entity failures pause later entities; completed entity checkpoints are preserved.
 */

import type { MarketplaceAdapter } from "@/lib/warehouse/adapters/marketplace-adapter";
import type { WarehouseCheckpointService } from "@/lib/warehouse/checkpoints/checkpoint-service";
import type { WarehouseSyncSessionService } from "@/lib/warehouse/sessions/session-service";
import type { WarehouseRawMetadataRepository } from "@/lib/warehouse/repositories/contracts";
import type {
  WarehouseCheckpointKey,
  WarehouseScope,
  WarehouseTriggerSource,
} from "@/lib/warehouse/types";
import type { WarehouseSyncSessionRecord } from "@/lib/warehouse/sessions/types";
import {
  evaluateIncrementalEligibility,
  type IncrementalEligibility,
} from "@/lib/warehouse/backfill/eligibility";
import { HISTORICAL_BACKFILL_MODE } from "@/lib/warehouse/backfill/constants";
import type { WarehouseEntityUpsertPort } from "@/lib/warehouse/backfill/entity-upsert";
import {
  INCREMENTAL_SYNC_ENTITY_ORDER,
  INCREMENTAL_SYNC_MODE,
  INCREMENTAL_SYNC_SESSION_KIND,
  type IncrementalSyncEntity,
} from "@/lib/warehouse/incremental/constants";
import {
  createConsoleIncrementalLogger,
  type IncrementalLogger,
} from "@/lib/warehouse/incremental/logger";
import { determineIncrementalWindow } from "@/lib/warehouse/incremental/windows";
import {
  WAREHOUSE_ALLOWS_INCREMENTAL_SYNC,
} from "@/lib/warehouse/utils/foundation-guards";

const WINDOWED_ENTITIES = new Set<IncrementalSyncEntity>(["orders", "sales", "finance"]);

export type IncrementalSyncTrigger = "manual" | "scheduled" | "api" | "recover";

export type IncrementalSyncRequest = {
  scope: WarehouseScope;
  trigger?: IncrementalSyncTrigger;
  lookbackHours?: number;
  /** Optional entity subset — default all incremental entities. */
  entities?: IncrementalSyncEntity[];
};

export type IncrementalEntityResult = {
  entity: IncrementalSyncEntity;
  status: "success" | "failed" | "paused" | "skipped";
  recordsRead: number;
  inserted: number;
  updated: number;
  skipped: number;
  errorMessage: string | null;
};

export type IncrementalSyncResult = {
  sessionId: string | null;
  status: "success" | "partial" | "failed" | "blocked";
  eligibility: IncrementalEligibility;
  entityResults: IncrementalEntityResult[];
  statistics: Record<string, unknown>;
  errorMessage: string | null;
  resumed: boolean;
  entityOrder: readonly IncrementalSyncEntity[];
};

export type IncrementalSyncEngineDeps = {
  adapter: MarketplaceAdapter;
  upsert: WarehouseEntityUpsertPort;
  checkpoints: WarehouseCheckpointService;
  sessions: WarehouseSyncSessionService;
  rawMetadata?: WarehouseRawMetadataRepository;
  logger?: IncrementalLogger;
};

function mapTrigger(trigger: IncrementalSyncTrigger): WarehouseTriggerSource {
  switch (trigger) {
    case "scheduled":
      return "scheduled";
    case "recover":
      return "recover";
    case "api":
    case "manual":
    default:
      return "manual";
  }
}

function checkpointKey(
  scope: WarehouseScope,
  entity: IncrementalSyncEntity
): WarehouseCheckpointKey {
  return {
    marketplaceType: scope.marketplaceType,
    companyId: scope.companyId,
    marketplaceAccountId: scope.marketplaceAccountId,
    entity,
    mode: INCREMENTAL_SYNC_MODE,
  };
}

function historicalKey(
  scope: WarehouseScope,
  entity: IncrementalSyncEntity
): WarehouseCheckpointKey {
  return {
    marketplaceType: scope.marketplaceType,
    companyId: scope.companyId,
    marketplaceAccountId: scope.marketplaceAccountId,
    entity,
    mode: HISTORICAL_BACKFILL_MODE,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export class IncrementalSyncEngine {
  private readonly log: IncrementalLogger;

  constructor(private readonly deps: IncrementalSyncEngineDeps) {
    this.log = deps.logger ?? createConsoleIncrementalLogger();
  }

  async run(request: IncrementalSyncRequest): Promise<IncrementalSyncResult> {
    if (!WAREHOUSE_ALLOWS_INCREMENTAL_SYNC) {
      throw new Error("Incremental sync is disabled by warehouse guards");
    }

    if (this.deps.adapter.capabilities.marketplace !== request.scope.marketplaceType) {
      throw new Error(
        `Adapter marketplace mismatch: adapter=${this.deps.adapter.capabilities.marketplace} scope=${request.scope.marketplaceType}`
      );
    }

    const allCheckpoints = await this.deps.checkpoints.listByAccount(
      request.scope.marketplaceAccountId
    );
    const eligibility = evaluateIncrementalEligibility(
      allCheckpoints,
      request.scope.marketplaceAccountId
    );

    if (!eligibility.eligible || !eligibility.historicalBackfillComplete) {
      this.log("session_blocked", {
        marketplaceAccountId: request.scope.marketplaceAccountId,
        reason: eligibility.reason,
      });
      return {
        sessionId: null,
        status: "blocked",
        eligibility,
        entityResults: [],
        statistics: {},
        errorMessage: eligibility.reason,
        resumed: false,
        entityOrder: INCREMENTAL_SYNC_ENTITY_ORDER,
      };
    }

    const trigger = request.trigger ?? "manual";
    const entityOrder = request.entities?.length
      ? INCREMENTAL_SYNC_ENTITY_ORDER.filter((e) => request.entities!.includes(e))
      : [...INCREMENTAL_SYNC_ENTITY_ORDER];

    await this.initializeIncrementalCheckpoints(request.scope, entityOrder);

    const incrementalCheckpoints = (
      await this.deps.checkpoints.listByAccount(request.scope.marketplaceAccountId)
    ).filter((cp) => cp.mode === INCREMENTAL_SYNC_MODE);

    const resumed = incrementalCheckpoints.some(
      (cp) => cp.status === "failed" || cp.status === "paused" || cp.status === "running"
    );
    if (resumed) {
      this.log("resume", {
        marketplaceAccountId: request.scope.marketplaceAccountId,
        failedOrPaused: incrementalCheckpoints
          .filter((cp) => cp.status === "failed" || cp.status === "paused")
          .map((cp) => cp.entity),
      });
    }

    const session = await this.createSession(request, trigger, entityOrder[0] ?? "products");
    await this.deps.sessions.markRunning(session.id);
    this.log("session_start", {
      sessionId: session.id,
      trigger,
      entityOrder,
      resumed,
    });

    const entityResults: IncrementalEntityResult[] = [];
    const statistics: Record<string, unknown> = {
      recordsRead: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      byEntity: {} as Record<string, unknown>,
    };

    let haltRemaining = false;
    let haltError: string | null = null;

    try {
      for (const entity of entityOrder) {
        if (haltRemaining) {
          await this.markPaused(request.scope, entity);
          entityResults.push({
            entity,
            status: "paused",
            recordsRead: 0,
            inserted: 0,
            updated: 0,
            skipped: 0,
            errorMessage: null,
          });
          this.log("entity_paused", { entity, reason: haltError });
          continue;
        }

        this.log("entity_start", { entity, sessionId: session.id });
        await this.deps.sessions.update(session.id, {
          status: "running",
          meta: {
            kind: INCREMENTAL_SYNC_SESSION_KIND,
            currentEntity: entity,
            trigger,
            entityOrder,
            incrementalEligible: true,
          },
        });

        try {
          const result = await this.syncEntity(request, entity, session.id);
          entityResults.push({
            entity,
            status: "success",
            ...result,
            errorMessage: null,
          });
          (statistics.byEntity as Record<string, unknown>)[entity] = result;
          statistics.recordsRead = Number(statistics.recordsRead) + result.recordsRead;
          statistics.rowsInserted = Number(statistics.rowsInserted) + result.inserted;
          statistics.rowsUpdated = Number(statistics.rowsUpdated) + result.updated;
          statistics.rowsSkipped = Number(statistics.rowsSkipped) + result.skipped;

          this.log("entity_finish", { entity, ...result });
          this.log("inserted_rows", { entity, inserted: result.inserted });
          this.log("updated_rows", { entity, updated: result.updated });
          this.log("skipped_rows", { entity, skipped: result.skipped });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Incremental entity sync failed";
          haltRemaining = true;
          haltError = message;

          const existing = await this.deps.checkpoints.get(checkpointKey(request.scope, entity));
          await this.deps.checkpoints.save({
            key: checkpointKey(request.scope, entity),
            status: "failed",
            cursor: existing?.cursor ?? null,
            progress: {
              ...(existing?.progress ?? {}),
              lastError: message,
            },
            retryCount: (existing?.retryCount ?? 0) + 1,
            lastAttemptedSyncAt: nowIso(),
            errorCode: "INCREMENTAL_ENTITY_FAILED",
            errorMessage: message,
          });

          entityResults.push({
            entity,
            status: "failed",
            recordsRead: 0,
            inserted: 0,
            updated: 0,
            skipped: 0,
            errorMessage: message,
          });
          this.log("errors", { entity, message });
          this.log("entity_finish", { entity, status: "failed", message });
        }
      }

      const succeeded = entityResults.filter((r) => r.status === "success").length;
      const failed = entityResults.filter((r) => r.status === "failed").length;
      const sessionStatus =
        failed === 0 ? "success" : succeeded > 0 ? "partial" : "failed";

      await this.deps.sessions.finish(session.id, {
        status: sessionStatus,
        statistics: {
          recordsRead: Number(statistics.recordsRead),
          rowsInserted: Number(statistics.rowsInserted),
          rowsUpdated: Number(statistics.rowsUpdated),
          rowsSkipped: Number(statistics.rowsSkipped),
          byEntity: statistics.byEntity,
          entityResults,
        },
        meta: {
          kind: INCREMENTAL_SYNC_SESSION_KIND,
          currentEntity: entityResults.find((r) => r.status === "failed")?.entity ?? null,
          trigger,
          entityOrder,
          incrementalEligible: true,
          entityResults,
        },
        errorCode: failed ? "INCREMENTAL_PARTIAL_OR_FAILED" : null,
        errorMessage: haltError,
      });

      this.log("completion", {
        sessionId: session.id,
        status: sessionStatus,
        statistics,
      });

      return {
        sessionId: session.id,
        status: sessionStatus,
        eligibility,
        entityResults,
        statistics,
        errorMessage: haltError,
        resumed,
        entityOrder: INCREMENTAL_SYNC_ENTITY_ORDER,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Incremental sync failed";
      await this.deps.sessions.finish(session.id, {
        status: "failed",
        statistics: {
          recordsRead: Number(statistics.recordsRead),
          rowsInserted: Number(statistics.rowsInserted),
          rowsUpdated: Number(statistics.rowsUpdated),
          rowsSkipped: Number(statistics.rowsSkipped),
          byEntity: statistics.byEntity,
          entityResults,
        },
        meta: {
          kind: INCREMENTAL_SYNC_SESSION_KIND,
          trigger,
          entityOrder,
          incrementalEligible: true,
          entityResults,
        },
        errorCode: "INCREMENTAL_SYNC_FAILED",
        errorMessage: message,
      });
      this.log("session_failed", { sessionId: session.id, message });

      return {
        sessionId: session.id,
        status: "failed",
        eligibility,
        entityResults,
        statistics,
        errorMessage: message,
        resumed,
        entityOrder: INCREMENTAL_SYNC_ENTITY_ORDER,
      };
    }
  }

  private async initializeIncrementalCheckpoints(
    scope: WarehouseScope,
    entities: readonly IncrementalSyncEntity[]
  ): Promise<void> {
    for (const entity of entities) {
      const key = checkpointKey(scope, entity);
      const existing = await this.deps.checkpoints.get(key);
      if (existing) continue;

      const historical = await this.deps.checkpoints.get(historicalKey(scope, entity));
      const created = await this.deps.checkpoints.save({
        key,
        status: "idle",
        cursor: historical?.cursor ?? null,
        lastSuccessfulSyncAt: historical?.lastSuccessfulSyncAt ?? null,
        retryCount: 0,
        progress: { seededFrom: "historical_backfill" },
      });
      this.log("checkpoint_init", {
        entity,
        status: created.status,
        lastSuccessfulSyncAt: created.lastSuccessfulSyncAt,
      });
    }
  }

  private async createSession(
    request: IncrementalSyncRequest,
    trigger: IncrementalSyncTrigger,
    currentEntity: IncrementalSyncEntity
  ): Promise<WarehouseSyncSessionRecord> {
    return this.deps.sessions.create({
      marketplaceType: request.scope.marketplaceType,
      companyId: request.scope.companyId,
      marketplaceAccountId: request.scope.marketplaceAccountId,
      entity: currentEntity,
      mode: INCREMENTAL_SYNC_MODE,
      triggerSource: mapTrigger(trigger),
      meta: {
        kind: INCREMENTAL_SYNC_SESSION_KIND,
        currentEntity,
        trigger,
        entityOrder: [...INCREMENTAL_SYNC_ENTITY_ORDER],
        incrementalEligible: true,
      },
    });
  }

  private async markPaused(scope: WarehouseScope, entity: IncrementalSyncEntity): Promise<void> {
    const existing = await this.deps.checkpoints.get(checkpointKey(scope, entity));
    await this.deps.checkpoints.save({
      key: checkpointKey(scope, entity),
      status: "paused",
      cursor: existing?.cursor ?? null,
      lastSuccessfulSyncAt: existing?.lastSuccessfulSyncAt ?? null,
      lastAttemptedSyncAt: nowIso(),
      progress: {
        ...(existing?.progress ?? {}),
        pausedReason: "prior_entity_failed",
      },
      errorCode: null,
      errorMessage: null,
    });
  }

  private async syncEntity(
    request: IncrementalSyncRequest,
    entity: IncrementalSyncEntity,
    sessionId: string
  ): Promise<{
    recordsRead: number;
    inserted: number;
    updated: number;
    skipped: number;
  }> {
    const key = checkpointKey(request.scope, entity);
    const existing = await this.deps.checkpoints.get(key);
    const historical = await this.deps.checkpoints.get(historicalKey(request.scope, entity));

    const window = determineIncrementalWindow(existing, {
      lookbackHours: request.lookbackHours,
      seedFrom: historical?.lastSuccessfulSyncAt ?? null,
    });

    await this.deps.checkpoints.save({
      key,
      status: "running",
      cursor: existing?.cursor ?? window.cursor,
      windowStart: window.from,
      windowEnd: window.to,
      lastAttemptedSyncAt: nowIso(),
      errorCode: null,
      errorMessage: null,
      progress: { percent: 0, window },
    });

    let recordsRead = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let pages = 0;
    let pageCursor: string | null = null;

    if (WINDOWED_ENTITIES.has(entity)) {
      while (true) {
        const page = await this.fetchWindowed(
          request.scope,
          entity as "orders" | "sales" | "finance",
          { from: window.from, to: window.to },
          pageCursor
        );
        pages += 1;
        recordsRead += page.items.length;
        const upserted = await this.upsertWindowed(
          request.scope,
          entity as "orders" | "sales" | "finance",
          page.items
        );
        inserted += upserted.inserted;
        updated += upserted.updated;
        skipped += upserted.skipped;
        pageCursor = page.nextCursor;

        await this.recordRawIntake(sessionId, request.scope, entity, {
          recordsRead: page.items.length,
          windowFrom: window.from,
          windowTo: window.to,
          cursorAfter: pageCursor,
        });

        if (page.done) break;
        if (pages > 10_000) throw new Error(`${entity}: incremental pagination safety limit`);
      }
    } else {
      while (true) {
        const page = await this.fetchSnapshot(
          request.scope,
          entity as "products" | "stocks" | "prices",
          pageCursor
        );
        pages += 1;
        recordsRead += page.items.length;
        const upserted = await this.upsertSnapshot(
          request.scope,
          entity as "products" | "stocks" | "prices",
          page.items
        );
        inserted += upserted.inserted;
        updated += upserted.updated;
        skipped += upserted.skipped;
        pageCursor = page.nextCursor;

        await this.recordRawIntake(sessionId, request.scope, entity, {
          recordsRead: page.items.length,
          cursorAfter: pageCursor,
        });

        if (page.done) break;
        if (pages > 10_000) throw new Error(`${entity}: incremental pagination safety limit`);
      }
    }

    const successAt = nowIso();
    await this.deps.checkpoints.save({
      key,
      status: "complete",
      cursor: successAt,
      windowStart: window.from,
      windowEnd: window.to,
      lastSuccessfulSyncAt: successAt,
      lastAttemptedSyncAt: successAt,
      progress: {
        percent: 100,
        pages,
        recordsRead,
        inserted,
        updated,
        skipped,
        window,
      },
      errorCode: null,
      errorMessage: null,
    });

    return { recordsRead, inserted, updated, skipped };
  }

  private async fetchSnapshot(
    scope: WarehouseScope,
    entity: "products" | "stocks" | "prices",
    cursor: string | null
  ) {
    switch (entity) {
      case "products":
        return this.deps.adapter.fetchProducts(scope, cursor);
      case "stocks":
        return this.deps.adapter.fetchStocks(scope, cursor);
      case "prices":
        return this.deps.adapter.fetchPrices(scope, cursor);
    }
  }

  private async upsertSnapshot(
    scope: WarehouseScope,
    entity: "products" | "stocks" | "prices",
    items: unknown[]
  ) {
    switch (entity) {
      case "products":
        return this.deps.upsert.upsertProducts(scope, items as never);
      case "stocks":
        return this.deps.upsert.upsertStocks(scope, items as never);
      case "prices":
        return this.deps.upsert.upsertPrices(scope, items as never);
    }
  }

  private async fetchWindowed(
    scope: WarehouseScope,
    entity: "orders" | "sales" | "finance",
    window: { from: string; to: string },
    cursor: string | null
  ) {
    switch (entity) {
      case "orders":
        return this.deps.adapter.fetchOrders(scope, window, cursor);
      case "sales":
        return this.deps.adapter.fetchSales(scope, window, cursor);
      case "finance":
        return this.deps.adapter.fetchFinance(scope, window, cursor);
    }
  }

  private async upsertWindowed(
    scope: WarehouseScope,
    entity: "orders" | "sales" | "finance",
    items: unknown[]
  ) {
    switch (entity) {
      case "orders":
        return this.deps.upsert.upsertOrders(scope, items as never);
      case "sales":
        return this.deps.upsert.upsertSales(scope, items as never);
      case "finance":
        return this.deps.upsert.upsertFinance(scope, items as never);
    }
  }

  private async recordRawIntake(
    sessionId: string,
    scope: WarehouseScope,
    entity: IncrementalSyncEntity,
    extra: {
      recordsRead: number;
      cursorAfter?: string | null;
      windowFrom?: string;
      windowTo?: string;
    }
  ): Promise<void> {
    if (!this.deps.rawMetadata) return;
    await this.deps.rawMetadata.insert({
      sessionId,
      marketplaceType: scope.marketplaceType,
      companyId: scope.companyId,
      marketplaceAccountId: scope.marketplaceAccountId,
      entity,
      endpointFamily: entity,
      recordsRead: extra.recordsRead,
      cursorAfter: extra.cursorAfter ?? null,
      windowFrom: extra.windowFrom ?? null,
      windowTo: extra.windowTo ?? null,
      meta: { source: "incremental_sync_engine" },
    });
  }
}
