/**
 * Sprint 10.1 — Thin checkpoint helpers (no scheduler / no sync).
 */

import type { WarehouseCheckpointRepository } from "@/lib/warehouse/repositories/contracts";
import type { WarehouseCheckpointKey } from "@/lib/warehouse/types";
import {
  formatCheckpointKey,
  type UpsertWarehouseCheckpointInput,
  type WarehouseCheckpointRecord,
} from "@/lib/warehouse/checkpoints/types";

export class WarehouseCheckpointService {
  constructor(private readonly repo: WarehouseCheckpointRepository) {}

  formatKey(key: WarehouseCheckpointKey): string {
    return formatCheckpointKey(key);
  }

  get(key: WarehouseCheckpointKey): Promise<WarehouseCheckpointRecord | null> {
    return this.repo.get(key);
  }

  listByAccount(marketplaceAccountId: string): Promise<WarehouseCheckpointRecord[]> {
    return this.repo.listByAccount(marketplaceAccountId);
  }

  /**
   * Ensure a checkpoint row exists (idle) for the key — foundation bootstrap only.
   */
  ensure(key: WarehouseCheckpointKey): Promise<WarehouseCheckpointRecord> {
    return this.repo.upsert({ key, status: "idle", retryCount: 0, progress: {} });
  }

  save(input: UpsertWarehouseCheckpointInput): Promise<WarehouseCheckpointRecord> {
    return this.repo.upsert(input);
  }
}
