/**
 * Sprint 10.2 — Incremental eligibility after historical backfill completes.
 */

import type { WarehouseCheckpointRecord } from "@/lib/warehouse/checkpoints/types";
import {
  HISTORICAL_BACKFILL_ENTITY_ORDER,
  HISTORICAL_BACKFILL_MODE,
  type HistoricalBackfillEntity,
} from "@/lib/warehouse/backfill/constants";

export type IncrementalEligibility = {
  eligible: boolean;
  historicalBackfillComplete: boolean;
  missingEntities: HistoricalBackfillEntity[];
  failedEntities: HistoricalBackfillEntity[];
  completedEntities: HistoricalBackfillEntity[];
  reason: string;
};

/**
 * Incremental sync is allowed only when every locked backfill entity is complete.
 * Does not start incremental sync — only evaluates eligibility.
 */
export function evaluateIncrementalEligibility(
  checkpoints: WarehouseCheckpointRecord[],
  marketplaceAccountId: string
): IncrementalEligibility {
  const relevant = checkpoints.filter(
    (cp) =>
      String(cp.marketplaceAccountId) === String(marketplaceAccountId) &&
      cp.mode === HISTORICAL_BACKFILL_MODE &&
      (HISTORICAL_BACKFILL_ENTITY_ORDER as readonly string[]).includes(cp.entity)
  );

  const byEntity = new Map(relevant.map((cp) => [cp.entity as HistoricalBackfillEntity, cp]));

  const completedEntities: HistoricalBackfillEntity[] = [];
  const failedEntities: HistoricalBackfillEntity[] = [];
  const missingEntities: HistoricalBackfillEntity[] = [];

  for (const entity of HISTORICAL_BACKFILL_ENTITY_ORDER) {
    const cp = byEntity.get(entity);
    if (!cp) {
      missingEntities.push(entity);
      continue;
    }
    if (cp.status === "complete") completedEntities.push(entity);
    else if (cp.status === "failed") failedEntities.push(entity);
    else missingEntities.push(entity);
  }

  const historicalBackfillComplete =
    completedEntities.length === HISTORICAL_BACKFILL_ENTITY_ORDER.length &&
    failedEntities.length === 0 &&
    missingEntities.length === 0;

  const eligible = historicalBackfillComplete;

  let reason: string;
  if (eligible) {
    reason = "Historical backfill complete — incremental sync eligible";
  } else if (failedEntities.length) {
    reason = `Historical backfill failed for: ${failedEntities.join(", ")}`;
  } else {
    reason = `Historical backfill incomplete — pending: ${missingEntities.join(", ")}`;
  }

  return {
    eligible,
    historicalBackfillComplete,
    missingEntities,
    failedEntities,
    completedEntities,
    reason,
  };
}
