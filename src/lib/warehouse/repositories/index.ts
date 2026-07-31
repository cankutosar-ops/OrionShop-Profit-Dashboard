/**
 * Sprint 10.1 — Default repository wiring (composition root for warehouse foundation).
 */

import type { WarehouseRepositories } from "@/lib/warehouse/repositories/contracts";
import { SupabaseWarehouseCheckpointRepository } from "@/lib/warehouse/repositories/supabase-checkpoint-repository";
import { SupabaseWarehouseSyncSessionRepository } from "@/lib/warehouse/repositories/supabase-session-repository";
import {
  SupabaseWarehouseMetadataRepository,
  SupabaseWarehouseRawMetadataRepository,
} from "@/lib/warehouse/repositories/supabase-metadata-repository";

export function createWarehouseRepositories(): WarehouseRepositories {
  return {
    checkpoints: new SupabaseWarehouseCheckpointRepository(),
    sessions: new SupabaseWarehouseSyncSessionRepository(),
    metadata: new SupabaseWarehouseMetadataRepository(),
    rawMetadata: new SupabaseWarehouseRawMetadataRepository(),
  };
}
