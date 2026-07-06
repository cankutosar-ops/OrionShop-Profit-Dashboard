import type { WbSyncEntity } from "@/lib/wildberries/api-client";

export type DashboardSyncResult = {
  entity: string;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  errors: string[];
};

export type DashboardSyncResponse = {
  ok: boolean;
  error?: string;
  results?: DashboardSyncResult[];
};

export const OPERATIONAL_SYNC_ENTITIES: WbSyncEntity[] = ["orders", "sales"];

type SyncListener = (inFlight: boolean) => void;

let syncInFlight = false;
const listeners = new Set<SyncListener>();

export function getDashboardSyncInFlight(): boolean {
  return syncInFlight;
}

export function subscribeDashboardSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setDashboardSyncInFlight(inFlight: boolean) {
  syncInFlight = inFlight;
  listeners.forEach((listener) => listener(inFlight));
}

export async function postDashboardSync(input: {
  marketplaceAccountId: string | null;
  dateFrom: string;
  dateTo: string;
  entities: WbSyncEntity[];
}): Promise<DashboardSyncResponse> {
  setDashboardSyncInFlight(true);

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplaceAccountId: input.marketplaceAccountId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        entities: input.entities,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, error: data.error ?? "Sync failed" };
    }

    const results = (data.results ?? []) as DashboardSyncResult[];
    const syncErrors = results.flatMap((row) => row.errors);

    if (syncErrors.length) {
      return { ok: false, error: syncErrors.slice(0, 3).join(" · "), results };
    }

    return { ok: true, results };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Sync failed",
    };
  } finally {
    setDashboardSyncInFlight(false);
  }
}
