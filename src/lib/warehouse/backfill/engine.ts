/**
 * Sprint 10.2 — Historical Backfill Engine.
 *
 * Historical First → Verification → Incremental Forever (eligibility only here).
 * No scheduler. No incremental sync. No parallel entity execution.
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
import type { WarehouseCheckpointRecord } from "@/lib/warehouse/checkpoints/types";
import {
  HISTORICAL_BACKFILL_ENTITY_ORDER,
  HISTORICAL_BACKFILL_MODE,
  HISTORICAL_BACKFILL_SESSION_KIND,
  DEFAULT_BACKFILL_WINDOW_DAYS,
  type HistoricalBackfillEntity,
} from "@/lib/warehouse/backfill/constants";
import {
  evaluateIncrementalEligibility,
  type IncrementalEligibility,
} from "@/lib/warehouse/backfill/eligibility";
import type { WarehouseEntityUpsertPort } from "@/lib/warehouse/backfill/entity-upsert";
import {
  createConsoleBackfillLogger,
  type BackfillLogger,
} from "@/lib/warehouse/backfill/logger";
import {
  buildInclusiveDateWindows,
  decodeBackfillCursor,
  encodeBackfillCursor,
} from "@/lib/warehouse/backfill/windows";
import { WAREHOUSE_ALLOWS_HISTORICAL_BACKFILL } from "@/lib/warehouse/utils/foundation-guards";

const WINDOWED_ENTITIES = new Set<HistoricalBackfillEntity>(["orders", "sales", "finance"]);

export type HistoricalBackfillTrigger =
  | "lifecycle"
  | "rebuild_history"
  | "manual"
  | "recover"
  | "replay";

export type HistoricalBackfillRequest = {
  scope: WarehouseScope;
  /** Inclusive history range (YYYY-MM-DD). */
  historyFrom: string;
  historyTo: string;
  /** When true, reset all historical checkpoints and restart from products. */
  forceRestart?: boolean;
  trigger?: HistoricalBackfillTrigger;
  windowDays?: number;
};

export type HistoricalBackfillResult = {
  sessionId: string;
  status: "success" | "failed";
  currentEntity: HistoricalBackfillEntity | null;
  progressPercent: number;
  statistics: Record<string, unknown>;
  eligibility: IncrementalEligibility;
  errorMessage: string | null;
  resumed: boolean;
  entityOrder: readonly HistoricalBackfillEntity[];
};

export type HistoricalBackfillEngineDeps = {
  adapter: MarketplaceAdapter;
  upsert: WarehouseEntityUpsertPort;
  checkpoints: WarehouseCheckpointService;
  sessions: WarehouseSyncSessionService;
  rawMetadata?: WarehouseRawMetadataRepository;
  logger?: BackfillLogger;
};

function mapTrigger(trigger: HistoricalBackfillTrigger): WarehouseTriggerSource {
  switch (trigger) {
    case "lifecycle":
      return "lifecycle";
    case "rebuild_history":
      return "manual";
    case "recover":
      return "recover";
    case "replay":
      return "replay";
    default:
      return "manual";
  }
}

function checkpointKey(
  scope: WarehouseScope,
  entity: HistoricalBackfillEntity
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

export class HistoricalBackfillEngine {
  private readonly log: BackfillLogger;

  constructor(private readonly deps: HistoricalBackfillEngineDeps) {
    this.log = deps.logger ?? createConsoleBackfillLogger();
  }

  async run(request: HistoricalBackfillRequest): Promise<HistoricalBackfillResult> {
    if (!WAREHOUSE_ALLOWS_HISTORICAL_BACKFILL) {
      throw new Error("Historical backfill is disabled by warehouse guards");
    }

    if (this.deps.adapter.capabilities.marketplace !== request.scope.marketplaceType) {
      throw new Error(
        `Adapter marketplace mismatch: adapter=${this.deps.adapter.capabilities.marketplace} scope=${request.scope.marketplaceType}`
      );
    }

    const trigger = request.trigger ?? "manual";
    const windowDays = request.windowDays ?? DEFAULT_BACKFILL_WINDOW_DAYS;
    const forceRestart = Boolean(request.forceRestart);

    if (forceRestart) {
      await this.resetCheckpoints(request.scope);
    }

    const checkpoints = await this.initializeCheckpoints(request.scope);
    const resumeFrom = this.resolveResumeEntity(checkpoints);
    const resumed = resumeFrom !== HISTORICAL_BACKFILL_ENTITY_ORDER[0] || this.hasPartialProgress(checkpoints);

    if (resumed && !forceRestart) {
      this.log("resume", {
        resumeFrom,
        marketplaceAccountId: request.scope.marketplaceAccountId,
      });
    }

    const session = await this.createSession(request, trigger, resumeFrom);
    await this.deps.sessions.markRunning(session.id);
    this.log("session_start", {
      sessionId: session.id,
      trigger,
      resumeFrom,
      forceRestart,
    });

    const statistics: Record<string, unknown> = {
      recordsRead: 0,
      rowsUpserted: 0,
      pages: 0,
      byEntity: {} as Record<string, unknown>,
    };

    let currentEntity: HistoricalBackfillEntity | null = resumeFrom;
    let progressPercent = this.overallProgress(checkpoints, resumeFrom);

    try {
      const startIdx = HISTORICAL_BACKFILL_ENTITY_ORDER.indexOf(resumeFrom);
      for (let i = startIdx; i < HISTORICAL_BACKFILL_ENTITY_ORDER.length; i++) {
        const entity = HISTORICAL_BACKFILL_ENTITY_ORDER[i];
        currentEntity = entity;
        progressPercent = this.overallProgress(checkpoints, entity);

        await this.updateSessionProgress(session.id, entity, progressPercent, statistics);

        const existing = await this.deps.checkpoints.get(checkpointKey(request.scope, entity));
        if (existing?.status === "complete") {
          this.log("entity_finish", {
            entity,
            skipped: true,
            reason: "already_complete",
          });
          continue;
        }

        this.log("entity_start", {
          entity,
          sessionId: session.id,
          cursor: existing?.cursor ?? null,
        });

        const entityStats = WINDOWED_ENTITIES.has(entity)
          ? await this.syncWindowedEntity(
              request,
              entity as "orders" | "sales" | "finance",
              windowDays,
              session.id
            )
          : await this.syncSnapshotEntity(
              request,
              entity as "products" | "stocks" | "prices",
              session.id
            );

        (statistics.byEntity as Record<string, unknown>)[entity] = entityStats;
        statistics.recordsRead =
          Number(statistics.recordsRead) + Number(entityStats.recordsRead ?? 0);
        statistics.rowsUpserted =
          Number(statistics.rowsUpserted) + Number(entityStats.rowsUpserted ?? 0);
        statistics.pages = Number(statistics.pages) + Number(entityStats.pages ?? 0);

        this.log("entity_finish", { entity, ...entityStats });
        progressPercent = Math.round(
          ((i + 1) / HISTORICAL_BACKFILL_ENTITY_ORDER.length) * 100
        );
        await this.updateSessionProgress(session.id, entity, progressPercent, statistics);
      }

      const eligibility = await this.validateAndEnableIncremental(request.scope);

      if (!eligibility.historicalBackfillComplete) {
        throw new Error(`Validation failed after entity sync: ${eligibility.reason}`);
      }

      await this.deps.sessions.finish(session.id, {
        status: "success",
        statistics: {
          recordsRead: Number(statistics.recordsRead),
          rowsInserted: Number(statistics.rowsUpserted),
          pages: Number(statistics.pages),
          byEntity: statistics.byEntity,
          incrementalEligible: true,
        },
        meta: {
          kind: HISTORICAL_BACKFILL_SESSION_KIND,
          currentEntity: HISTORICAL_BACKFILL_ENTITY_ORDER[HISTORICAL_BACKFILL_ENTITY_ORDER.length - 1],
          progressPercent: 100,
          historyFrom: request.historyFrom,
          historyTo: request.historyTo,
          trigger,
          incrementalEligible: true,
          entityOrder: [...HISTORICAL_BACKFILL_ENTITY_ORDER],
        },
        errorCode: null,
        errorMessage: null,
      });

      this.log("completion", {
        sessionId: session.id,
        eligibility,
        statistics,
      });

      return {
        sessionId: session.id,
        status: "success",
        currentEntity: HISTORICAL_BACKFILL_ENTITY_ORDER[HISTORICAL_BACKFILL_ENTITY_ORDER.length - 1],
        progressPercent: 100,
        statistics,
        eligibility,
        errorMessage: null,
        resumed,
        entityOrder: HISTORICAL_BACKFILL_ENTITY_ORDER,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Historical backfill failed";
      if (currentEntity) {
        const key = checkpointKey(request.scope, currentEntity);
        const existing = await this.deps.checkpoints.get(key);
        await this.deps.checkpoints.save({
          key,
          status: "failed",
          cursor: existing?.cursor ?? null,
          progress: {
            ...(existing?.progress ?? {}),
            percent: Number((existing?.progress as { percent?: number })?.percent ?? 0),
          },
          retryCount: (existing?.retryCount ?? 0) + 1,
          lastAttemptedSyncAt: nowIso(),
          errorCode: "ENTITY_SYNC_FAILED",
          errorMessage: message,
        });
        this.log("retry", {
          entity: currentEntity,
          retryCount: (existing?.retryCount ?? 0) + 1,
          message,
        });
      }

      await this.deps.sessions.finish(session.id, {
        status: "failed",
        statistics: {
          recordsRead: Number(statistics.recordsRead),
          rowsInserted: Number(statistics.rowsUpserted),
          pages: Number(statistics.pages),
          byEntity: statistics.byEntity,
          incrementalEligible: false,
        },
        meta: {
          kind: HISTORICAL_BACKFILL_SESSION_KIND,
          currentEntity,
          progressPercent,
          historyFrom: request.historyFrom,
          historyTo: request.historyTo,
          trigger,
          incrementalEligible: false,
          entityOrder: [...HISTORICAL_BACKFILL_ENTITY_ORDER],
        },
        errorCode: "HISTORICAL_BACKFILL_FAILED",
        errorMessage: message,
      });

      this.log("session_failed", { sessionId: session.id, currentEntity, message });

      const eligibility = await this.validateAndEnableIncremental(request.scope);

      return {
        sessionId: session.id,
        status: "failed",
        currentEntity,
        progressPercent,
        statistics,
        eligibility,
        errorMessage: message,
        resumed,
        entityOrder: HISTORICAL_BACKFILL_ENTITY_ORDER,
      };
    }
  }

  private async initializeCheckpoints(
    scope: WarehouseScope
  ): Promise<WarehouseCheckpointRecord[]> {
    const rows: WarehouseCheckpointRecord[] = [];
    for (const entity of HISTORICAL_BACKFILL_ENTITY_ORDER) {
      const key = checkpointKey(scope, entity);
      const existing = await this.deps.checkpoints.get(key);
      if (!existing) {
        const created = await this.deps.checkpoints.ensure(key);
        rows.push(created);
        this.log("checkpoint_init", { entity, status: created.status });
      } else {
        rows.push(existing);
      }
    }
    return rows;
  }

  private async resetCheckpoints(scope: WarehouseScope): Promise<void> {
    for (const entity of HISTORICAL_BACKFILL_ENTITY_ORDER) {
      await this.deps.checkpoints.save({
        key: checkpointKey(scope, entity),
        cursor: null,
        windowStart: null,
        windowEnd: null,
        status: "idle",
        progress: {},
        retryCount: 0,
        lastSuccessfulSyncAt: null,
        lastAttemptedSyncAt: null,
        errorCode: null,
        errorMessage: null,
      });
    }
  }

  private resolveResumeEntity(
    checkpoints: WarehouseCheckpointRecord[]
  ): HistoricalBackfillEntity {
    for (const entity of HISTORICAL_BACKFILL_ENTITY_ORDER) {
      const cp = checkpoints.find((c) => c.entity === entity);
      if (!cp || cp.status !== "complete") return entity;
    }
    return HISTORICAL_BACKFILL_ENTITY_ORDER[HISTORICAL_BACKFILL_ENTITY_ORDER.length - 1];
  }

  private hasPartialProgress(checkpoints: WarehouseCheckpointRecord[]): boolean {
    return checkpoints.some(
      (cp) =>
        cp.status === "running" ||
        cp.status === "failed" ||
        cp.status === "paused" ||
        (cp.status === "idle" && Boolean(cp.cursor)) ||
        cp.status === "complete"
    );
  }

  private overallProgress(
    checkpoints: WarehouseCheckpointRecord[],
    current: HistoricalBackfillEntity
  ): number {
    const idx = HISTORICAL_BACKFILL_ENTITY_ORDER.indexOf(current);
    const completed = checkpoints.filter((c) => c.status === "complete").length;
    const base = Math.max(completed, idx) / HISTORICAL_BACKFILL_ENTITY_ORDER.length;
    return Math.min(99, Math.round(base * 100));
  }

  private async createSession(
    request: HistoricalBackfillRequest,
    trigger: HistoricalBackfillTrigger,
    currentEntity: HistoricalBackfillEntity
  ): Promise<WarehouseSyncSessionRecord> {
    return this.deps.sessions.create({
      marketplaceType: request.scope.marketplaceType,
      companyId: request.scope.companyId,
      marketplaceAccountId: request.scope.marketplaceAccountId,
      entity: currentEntity,
      mode: HISTORICAL_BACKFILL_MODE,
      triggerSource: mapTrigger(trigger),
      meta: {
        kind: HISTORICAL_BACKFILL_SESSION_KIND,
        currentEntity,
        progressPercent: 0,
        historyFrom: request.historyFrom,
        historyTo: request.historyTo,
        trigger,
        rebuildHistory: trigger === "rebuild_history",
        entityOrder: [...HISTORICAL_BACKFILL_ENTITY_ORDER],
        incrementalEligible: false,
      },
    });
  }

  private async updateSessionProgress(
    sessionId: string,
    currentEntity: HistoricalBackfillEntity,
    progressPercent: number,
    statistics: Record<string, unknown>
  ): Promise<void> {
    await this.deps.sessions.update(sessionId, {
      status: "running",
      statistics: {
        recordsRead: Number(statistics.recordsRead),
        rowsInserted: Number(statistics.rowsUpserted),
        pages: Number(statistics.pages),
        byEntity: statistics.byEntity,
      },
      meta: {
        kind: HISTORICAL_BACKFILL_SESSION_KIND,
        currentEntity,
        progressPercent,
        incrementalEligible: false,
        entityOrder: [...HISTORICAL_BACKFILL_ENTITY_ORDER],
      },
    });
  }

  private async validateAndEnableIncremental(
    scope: WarehouseScope
  ): Promise<IncrementalEligibility> {
    const all = await this.deps.checkpoints.listByAccount(scope.marketplaceAccountId);
    return evaluateIncrementalEligibility(all, scope.marketplaceAccountId);
  }

  private async syncSnapshotEntity(
    request: HistoricalBackfillRequest,
    entity: "products" | "stocks" | "prices",
    sessionId: string
  ): Promise<Record<string, unknown>> {
    const key = checkpointKey(request.scope, entity);
    const existing = await this.deps.checkpoints.get(key);
    let cursor = existing?.cursor ?? null;
    let pages = 0;
    let recordsRead = 0;
    let rowsUpserted = 0;

    await this.deps.checkpoints.save({
      key,
      status: "running",
      cursor,
      lastAttemptedSyncAt: nowIso(),
      errorCode: null,
      errorMessage: null,
      progress: { percent: 0, pages: 0, recordsRead: 0 },
    });

    while (true) {
      const page = await this.fetchSnapshotPage(request.scope, entity, cursor);
      pages += 1;
      recordsRead += page.items.length;

      const upsertResult = await this.upsertSnapshotPage(request.scope, entity, page.items);
      rowsUpserted += upsertResult.upserted;

      cursor = page.nextCursor;
      const percent = page.done ? 100 : Math.min(99, pages * 10);

      await this.deps.checkpoints.save({
        key,
        status: "running",
        cursor,
        lastAttemptedSyncAt: nowIso(),
        progress: { percent, pages, recordsRead, rowsUpserted },
      });

      this.log("progress", { entity, pages, recordsRead, rowsUpserted, percent, done: page.done });

      await this.recordRawIntake(sessionId, request.scope, entity, {
        recordsRead: page.items.length,
        cursorBefore: existing?.cursor ?? null,
        cursorAfter: cursor,
      });

      if (page.done) break;
      if (pages > 10_000) throw new Error(`${entity}: pagination safety limit exceeded`);
    }

    await this.deps.checkpoints.save({
      key,
      status: "complete",
      cursor,
      lastSuccessfulSyncAt: nowIso(),
      lastAttemptedSyncAt: nowIso(),
      progress: { percent: 100, pages, recordsRead, rowsUpserted },
      errorCode: null,
      errorMessage: null,
    });

    return { pages, recordsRead, rowsUpserted };
  }

  private async syncWindowedEntity(
    request: HistoricalBackfillRequest,
    entity: "orders" | "sales" | "finance",
    windowDays: number,
    sessionId: string
  ): Promise<Record<string, unknown>> {
    const key = checkpointKey(request.scope, entity);
    const existing = await this.deps.checkpoints.get(key);
    const windows = buildInclusiveDateWindows(
      request.historyFrom,
      request.historyTo,
      windowDays
    );

    const decoded = decodeBackfillCursor(existing?.cursor);
    let windowIndex =
      typeof decoded.windowIndex === "number" ? Math.max(0, decoded.windowIndex) : 0;
    let pageCursor =
      typeof decoded.pageCursor === "string" || decoded.pageCursor === null
        ? (decoded.pageCursor as string | null)
        : null;

    let pages = Number((existing?.progress as { pages?: number })?.pages ?? 0);
    let recordsRead = Number((existing?.progress as { recordsRead?: number })?.recordsRead ?? 0);
    let rowsUpserted = Number(
      (existing?.progress as { rowsUpserted?: number })?.rowsUpserted ?? 0
    );

    await this.deps.checkpoints.save({
      key,
      status: "running",
      cursor: existing?.cursor ?? null,
      windowStart: windows[windowIndex]?.from ?? request.historyFrom,
      windowEnd: windows[windowIndex]?.to ?? request.historyTo,
      lastAttemptedSyncAt: nowIso(),
      errorCode: null,
      errorMessage: null,
      progress: {
        percent: windows.length ? Math.round((windowIndex / windows.length) * 100) : 100,
        pages,
        recordsRead,
        rowsUpserted,
        windowIndex,
        windowsTotal: windows.length,
      },
    });

    for (; windowIndex < windows.length; windowIndex++) {
      const window = windows[windowIndex];
      let done = false;

      while (!done) {
        const page = await this.fetchWindowedPage(
          request.scope,
          entity,
          window,
          pageCursor
        );
        pages += 1;
        recordsRead += page.items.length;

        const upsertResult = await this.upsertWindowedPage(
          request.scope,
          entity,
          page.items
        );
        rowsUpserted += upsertResult.upserted;

        pageCursor = page.nextCursor;
        done = page.done;

        const percent = Math.min(
          99,
          Math.round(((windowIndex + (done ? 1 : 0.5)) / Math.max(windows.length, 1)) * 100)
        );

        const cursor = encodeBackfillCursor({
          windowIndex: done ? windowIndex + 1 : windowIndex,
          pageCursor: done ? null : pageCursor,
          windowFrom: window.from,
          windowTo: window.to,
        });

        await this.deps.checkpoints.save({
          key,
          status: "running",
          cursor,
          windowStart: window.from,
          windowEnd: window.to,
          lastAttemptedSyncAt: nowIso(),
          progress: {
            percent,
            pages,
            recordsRead,
            rowsUpserted,
            windowIndex,
            windowsTotal: windows.length,
          },
        });

        this.log("progress", {
          entity,
          window,
          windowIndex,
          pages,
          recordsRead,
          rowsUpserted,
          percent,
          done,
        });

        await this.recordRawIntake(sessionId, request.scope, entity, {
          recordsRead: page.items.length,
          windowFrom: window.from,
          windowTo: window.to,
          cursorAfter: cursor,
        });

        if (pages > 50_000) throw new Error(`${entity}: pagination safety limit exceeded`);
      }

      pageCursor = null;
    }

    await this.deps.checkpoints.save({
      key,
      status: "complete",
      cursor: encodeBackfillCursor({
        windowIndex: windows.length,
        pageCursor: null,
        completed: true,
      }),
      windowStart: request.historyFrom,
      windowEnd: request.historyTo,
      lastSuccessfulSyncAt: nowIso(),
      lastAttemptedSyncAt: nowIso(),
      progress: {
        percent: 100,
        pages,
        recordsRead,
        rowsUpserted,
        windowIndex: windows.length,
        windowsTotal: windows.length,
      },
      errorCode: null,
      errorMessage: null,
    });

    return { pages, recordsRead, rowsUpserted, windows: windows.length };
  }

  private async fetchSnapshotPage(
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

  private async upsertSnapshotPage(
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

  private async fetchWindowedPage(
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

  private async upsertWindowedPage(
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
    entity: HistoricalBackfillEntity,
    extra: {
      recordsRead: number;
      cursorBefore?: string | null;
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
      cursorBefore: extra.cursorBefore ?? null,
      cursorAfter: extra.cursorAfter ?? null,
      windowFrom: extra.windowFrom ?? null,
      windowTo: extra.windowTo ?? null,
      meta: { source: "historical_backfill_engine" },
    });
  }
}
