/**
 * Sprint 10.1 — Sync session helpers (create / complete metadata only).
 */

import type { WarehouseSyncSessionRepository } from "@/lib/warehouse/repositories/contracts";
import type {
  CreateWarehouseSyncSessionInput,
  UpdateWarehouseSyncSessionInput,
  WarehouseSyncSessionRecord,
} from "@/lib/warehouse/sessions/types";

export class WarehouseSyncSessionService {
  constructor(private readonly repo: WarehouseSyncSessionRepository) {}

  create(input: CreateWarehouseSyncSessionInput): Promise<WarehouseSyncSessionRecord> {
    return this.repo.create(input);
  }

  getById(id: string): Promise<WarehouseSyncSessionRecord | null> {
    return this.repo.getById(id);
  }

  listByAccount(marketplaceAccountId: string, limit?: number) {
    return this.repo.listByAccount(marketplaceAccountId, limit);
  }

  markRunning(id: string): Promise<WarehouseSyncSessionRecord> {
    return this.repo.update(id, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
  }

  /** Non-terminal progress update (does not stamp finishedAt). */
  update(
    id: string,
    patch: UpdateWarehouseSyncSessionInput
  ): Promise<WarehouseSyncSessionRecord> {
    return this.repo.update(id, patch);
  }

  finish(
    id: string,
    patch: UpdateWarehouseSyncSessionInput
  ): Promise<WarehouseSyncSessionRecord> {
    return this.repo.update(id, {
      ...patch,
      finishedAt:
        patch.finishedAt !== undefined ? patch.finishedAt : new Date().toISOString(),
    });
  }
}
