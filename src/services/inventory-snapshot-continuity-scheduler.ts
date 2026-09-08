/**
 * Node-only bootstrap for Sprint 10.7 inventory snapshot continuity scheduler.
 *
 * Intentionally has ZERO static imports of capture / marketplace / credentials.
 * Heavy Node work (including encryption → crypto) loads only inside the timer
 * tick via dynamic import, so instrumentation never pulls crypto into Edge/client.
 */

let schedulerStarted = false;
let tickInFlight = false;
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // hourly check; capture is idempotent for today

export type InventorySchedulerDecision = {
  enabled: boolean;
  reason: string;
};

/**
 * Whether this process should run the in-process timer.
 *
 * Production inventory continuity belongs to the standalone Sync Worker
 * (`npm run worker:sync`), which is scheduled externally and keeps its state in
 * Supabase. A serverless web host gives no lifetime guarantees, so a timer
 * there is at best redundant and at worst a second writer racing the worker.
 * Production is therefore opt-in; local development keeps the old behaviour so
 * a single `npm run dev` still captures snapshots.
 */
export function resolveInventorySchedulerDecision(
  env: NodeJS.ProcessEnv = process.env
): InventorySchedulerDecision {
  const flag = env.INVENTORY_SNAPSHOT_SCHEDULER?.trim();
  if (flag === "0") {
    return { enabled: false, reason: "INVENTORY_SNAPSHOT_SCHEDULER=0" };
  }
  if (flag === "1") {
    return { enabled: true, reason: "INVENTORY_SNAPSHOT_SCHEDULER=1" };
  }
  if (env.NODE_ENV === "production") {
    return {
      enabled: false,
      reason:
        "production default: inventory continuity is owned by the Sync Worker (set INVENTORY_SNAPSHOT_SCHEDULER=1 to override)",
    };
  }
  return { enabled: true, reason: "development default" };
}

/**
 * Process-local durable scheduler (Node instrumentation).
 * Independent of Dashboard Sync. Idempotent hourly ticks.
 */
export function startInventorySnapshotContinuityScheduler(): void {
  if (schedulerStarted) return;
  const decision = resolveInventorySchedulerDecision();
  if (!decision.enabled) {
    console.log(`[inventory-continuity] scheduler disabled — ${decision.reason}`);
    return;
  }
  schedulerStarted = true;

  const run = () => {
    if (tickInFlight) return;
    tickInFlight = true;
    void import("@/services/inventory-snapshot-continuity-service")
      .then((m) =>
        m.runInventorySnapshotContinuityForAllAccounts({ trigger: "scheduled" })
      )
      .catch((err) => {
        console.error(
          "[inventory-continuity] scheduler tick failed",
          err instanceof Error ? err.message : String(err)
        );
      })
      .finally(() => {
        tickInFlight = false;
      });
  };

  // Initial delay so startup probes finish first
  setTimeout(run, 15_000);
  const schedulerTimer = setInterval(run, SCHEDULER_INTERVAL_MS);
  // Avoid keeping the process alive solely for the timer in some runtimes
  if (schedulerTimer && typeof schedulerTimer === "object" && "unref" in schedulerTimer) {
    (schedulerTimer as NodeJS.Timeout).unref?.();
  }

  console.log("[inventory-continuity] scheduler started", {
    intervalMs: SCHEDULER_INTERVAL_MS,
    reason: decision.reason,
  });
}

/** Test / admin helper */
export function isInventorySnapshotContinuitySchedulerStarted(): boolean {
  return schedulerStarted;
}
