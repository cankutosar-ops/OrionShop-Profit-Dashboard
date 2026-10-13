import { headers } from "next/headers";
import type { ReactNode } from "react";
import { DashboardLoadError } from "@/components/dashboard/dashboard-load-error";
import { withReadBudget } from "@/lib/supabase/read-budget";

/** Complete the page or return a usable error before the hosting deadline. */
export async function renderDataPage(pageName: string, load: () => Promise<ReactNode>) {
  const requestId = (await headers()).get("x-orion-request-id") ?? undefined;
  const started = Date.now();
  try {
    const page = await withReadBudget(load, 40_000, requestId);
    console.info("[data-page-load]", { pageName, requestId, status: "ready", durationMs: Date.now() - started });
    return page;
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error &&
        typeof error.digest === "string" && error.digest.startsWith("NEXT_")) throw error;
    console.error("[data-page-load]", {
      pageName, requestId, status: "failed", durationMs: Date.now() - started,
      kind: error instanceof Error ? error.name : "unknown",
    });
    return <DashboardLoadError pageName={pageName} />;
  }
}
