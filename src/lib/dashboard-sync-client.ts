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

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollSyncStatus(marketplaceAccountId: string) {
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const response = await fetch(
      `/api/sync/status?marketplaceAccountId=${encodeURIComponent(marketplaceAccountId)}`,
      { cache: "no-store" }
    );
    const data = await response.json();

    if (!response.ok) {
      return { ok: false as const, error: data.error ?? "Failed to read sync status" };
    }

    if (data.status !== "running") {
      const results = (data.results ?? []) as DashboardSyncResult[];
      const syncErrors = results.flatMap((row) => row.errors);
      if (data.status === "failed" || data.error) {
        return { ok: false as const, error: data.error ?? "Sync failed", results };
      }
      if (syncErrors.length) {
        return { ok: false as const, error: syncErrors.slice(0, 3).join(" · "), results };
      }
      return { ok: true as const, results };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return { ok: false as const, error: "Sync timed out while waiting for completion" };
}

export async function postDashboardSync(input: {
  marketplaceAccountId: string | null;
  dateFrom: string;
  dateTo: string;
  entities: WbSyncEntity[];
  blocking?: boolean;
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
        blocking: input.blocking ?? false,
      }),
    });

    const data = await response.json();

    if (response.status === 409) {
      return { ok: false, error: data.error ?? "Sync already running" };
    }

    if (!response.ok && response.status !== 202) {
      return { ok: false, error: data.error ?? "Sync failed" };
    }

    if (response.status === 202) {
      const accountId = data.marketplaceAccountId ?? input.marketplaceAccountId;
      if (!accountId) {
        return { ok: false, error: "Missing marketplace account for sync polling" };
      }
      return pollSyncStatus(accountId);
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
