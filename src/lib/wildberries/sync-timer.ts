export type SyncPhaseKey =
  | "products_fetch"
  | "products_db"
  | "orders_fetch"
  | "orders_db"
  | "sales_fetch"
  | "sales_db"
  | "finance_fetch"
  | "finance_map"
  | "finance_db"
  | "stock_fetch"
  | "stock_db"
  | "account_meta";

export type SyncTimingReport = {
  phases: Record<string, number>;
  totalMs: number;
  peakRssMb: number;
};

let activeTimer: SyncTimer | null = null;

export function beginSyncTimer(): SyncTimer {
  activeTimer = new SyncTimer();
  return activeTimer;
}

export function getActiveSyncTimer(): SyncTimer | null {
  return activeTimer;
}

export function endSyncTimer(): SyncTimingReport | null {
  if (!activeTimer) return null;
  const report = activeTimer.printSummary();
  activeTimer = null;
  return report;
}

export class SyncTimer {
  private readonly syncStart = Date.now();
  private readonly phases = new Map<string, number>();
  private readonly phaseStarts = new Map<string, number>();
  private peakRss = 0;

  startPhase(key: SyncPhaseKey | string): void {
    this.phaseStarts.set(key, Date.now());
    this.sampleMemory();
  }

  endPhase(key: SyncPhaseKey | string): void {
    const started = this.phaseStarts.get(key);
    if (started === undefined) return;
    const elapsed = Date.now() - started;
    this.phases.set(key, (this.phases.get(key) ?? 0) + elapsed);
    this.phaseStarts.delete(key);
    this.sampleMemory();
  }

  sampleMemory(): void {
    const rss = process.memoryUsage().rss;
    if (rss > this.peakRss) this.peakRss = rss;
  }

  phaseMs(key: SyncPhaseKey | string): number {
    return this.phases.get(key) ?? 0;
  }

  toReport(): SyncTimingReport {
    this.sampleMemory();
    const phases: Record<string, number> = {};
    for (const [key, value] of this.phases) {
      phases[key] = value;
    }
    return {
      phases,
      totalMs: Date.now() - this.syncStart,
      peakRssMb: Math.round((this.peakRss / 1024 / 1024) * 10) / 10,
    };
  }

  printSummary(): SyncTimingReport {
    const report = this.toReport();
    const line = (label: string, ms: number) =>
      `${label.padEnd(22)} ${(ms / 1000).toFixed(1)} s`;

    const ordersFetch = report.phases.orders_fetch ?? 0;
    const ordersDb = report.phases.orders_db ?? 0;
    const salesFetch = report.phases.sales_fetch ?? 0;
    const salesDb = report.phases.sales_db ?? 0;
    const financeFetch = report.phases.finance_fetch ?? 0;
    const financeMap = report.phases.finance_map ?? 0;
    const financeDb = report.phases.finance_db ?? 0;
    const stockFetch = report.phases.stock_fetch ?? 0;
    const stockDb = report.phases.stock_db ?? 0;
    const productsFetch = report.phases.products_fetch ?? 0;
    const productsDb = report.phases.products_db ?? 0;

    console.log("\n[SYNC TIMING] Performance Summary");
    console.log("Sync Start");
    console.log(`↓`);
    console.log(line("Products Fetch", productsFetch));
    console.log(line("Products DB Writes", productsDb));
    console.log(line("Orders Fetch", ordersFetch));
    console.log(line("Orders DB Writes", ordersDb));
    console.log(line("Sales Fetch", salesFetch));
    console.log(line("Sales DB Writes", salesDb));
    console.log(line("Finance Fetch", financeFetch));
    console.log(line("Finance Map", financeMap));
    console.log(line("Finance DB Writes", financeDb));
    console.log(line("Stock Fetch", stockFetch));
    console.log(line("Stock DB Writes", stockDb));
    console.log(line("Ads Fetch", 0));
    console.log(line("Total Sync", report.totalMs));
    console.log(`Peak Memory .......... ${report.peakRssMb} MB`);
    return report;
  }
}
