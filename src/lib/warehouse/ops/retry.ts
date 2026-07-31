/**
 * Sprint 10.4 — Retry engine: retry only failed entities, never completed ones.
 */

import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";
import {
  DEFAULT_RETRY_POLICY,
  type RetryPolicyConfig,
} from "@/lib/warehouse/ops/constants";
import type { InMemoryWarehouseOpsStore } from "@/lib/warehouse/ops/memory-store";
import type { WarehouseRetryState } from "@/lib/warehouse/ops/types";

export class WarehouseRetryEngine {
  constructor(
    private readonly store: InMemoryWarehouseOpsStore,
    private readonly policy: RetryPolicyConfig = DEFAULT_RETRY_POLICY
  ) {}

  /**
   * Register failed entities for retry. Completed entities are never touched.
   */
  registerFailures(
    marketplaceAccountId: string,
    failedEntities: Array<{ entity: IncrementalSyncEntity; error: string | null }>,
    now = new Date()
  ): WarehouseRetryState[] {
    const out: WarehouseRetryState[] = [];
    for (const item of failedEntities) {
      const existing = this.store.getRetry(marketplaceAccountId, item.entity);
      const attempt = (existing?.attempt ?? 0) + 1;
      const exhausted = attempt >= this.policy.maxAttempts;
      const state: WarehouseRetryState = {
        marketplaceAccountId: String(marketplaceAccountId),
        entity: item.entity,
        attempt,
        maxAttempts: this.policy.maxAttempts,
        nextRetryAt: exhausted
          ? null
          : new Date(now.getTime() + this.policy.delayMs).toISOString(),
        lastError: item.error,
        status: exhausted ? "exhausted" : "pending",
        updatedAt: now.toISOString(),
      };
      out.push(this.store.upsertRetry(state));
    }
    return out;
  }

  /** Clear retry state for entities that succeeded. */
  clearSuccesses(
    marketplaceAccountId: string,
    succeededEntities: IncrementalSyncEntity[],
    now = new Date()
  ): void {
    for (const entity of succeededEntities) {
      this.store.upsertRetry({
        marketplaceAccountId: String(marketplaceAccountId),
        entity,
        attempt: 0,
        maxAttempts: this.policy.maxAttempts,
        nextRetryAt: null,
        lastError: null,
        status: "idle",
        updatedAt: now.toISOString(),
      });
    }
  }

  /** Entities due for retry right now. */
  dueEntities(marketplaceAccountId: string, now = new Date()): IncrementalSyncEntity[] {
    const nowIso = now.toISOString();
    return this.store
      .listRetries(marketplaceAccountId)
      .filter(
        (r) =>
          r.status === "pending" &&
          r.nextRetryAt != null &&
          r.nextRetryAt <= nowIso &&
          r.attempt < r.maxAttempts
      )
      .map((r) => r.entity);
  }

  getPolicy(): RetryPolicyConfig {
    return { ...this.policy };
  }
}
