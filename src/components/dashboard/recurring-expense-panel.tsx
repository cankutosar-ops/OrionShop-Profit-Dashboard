"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatKpiCurrency } from "@/lib/kpi-format";
import type { RecurringExpenseRule, RecurringExpenseSummary } from "@/lib/recurring-expenses";

type Summary = RecurringExpenseSummary & { rules: RecurringExpenseRule[] };
export function RecurringExpensePanel({ companyId, accountId, from, to, brandId, netProfit, profitReady }: {
  companyId: string; accountId: string; from: string; to: string; brandId?: string;
  netProfit?: number; profitReady?: boolean;
}) {
  const key = `${companyId}:${accountId}:${from}:${to}`;
  const [result, setResult] = useState<{ key: string; data?: Summary; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const query = new URLSearchParams({ companyId, accountId, from, to });
    void fetch(`/api/expenses/recurring?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw Error("Fixed expenses unavailable");
        const data: Summary = await response.json();
        if (active) setResult({ key, data });
      }).catch(() => { if (active) setResult({ key, error: "Fixed expenses are temporarily unavailable" }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [companyId, accountId, from, to, key, retry]);
  const current = result?.key === key ? result : null;
  const data = current?.data;
  const money = (kopeks: number) => formatKpiCurrency(kopeks / 100);
  if (data && data.rules.length === 0) return null;
  return <section aria-label="Fixed expenses and profit" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Fixed Expenses / Sabit Giderler</h2>
      <Link className="text-sm text-primary" href={`/expenses?company=${companyId}`}>Expense details</Link>
    </div>
    {!current ? <p role="status" className="mt-2 text-sm text-muted-foreground">Loading fixed expenses…</p> : current.error ?
      <p role="alert" className="mt-2 text-sm">{current.error}. <button onClick={() => { setResult(null); setRetry(n => n + 1); }} className="text-primary underline">Retry</button></p> : data ? <>
        <p className="mt-1 text-xs text-muted-foreground">{from} → {to} · Monthly costs allocated by calendar day. Management accruals; payment and tax eligibility are separate.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><p className="text-sm text-muted-foreground">Fixed expenses in selected period</p><p className="text-xl font-semibold text-rose-600 dark:text-rose-300">{money(data.totalKopeks)}</p></div>
          {netProfit !== undefined && <div><p className="text-sm text-muted-foreground">Profit After Fixed Expenses / Sabit Gider Sonrası Kâr</p>
            <p className="text-xl font-semibold">{profitReady && !brandId ? money(Math.round(netProfit * 100) - data.totalKopeks) : "—"}</p>
            <p className="text-xs text-muted-foreground">{brandId ? "Account costs are not allocated to individual brands. Select All Brands to see the resulting profit." : "Dashboard Net Profit − fixed expenses. Tax estimate is unchanged."}</p>
          </div>}
        </div>
        <details className="mt-3 text-sm"><summary className="cursor-pointer">Monthly expense breakdown</summary>
          <ul className="mt-2 space-y-2">{data.lines.map(line => <li key={line.id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2">
            <span>{line.month} · {line.description} <span className="text-xs text-muted-foreground">({line.days}/{line.monthDays} days; {money(line.monthlyKopeks)}/month)</span></span><span className="tabular-nums">{money(line.amountKopeks)}</span>
          </li>)}</ul>
        </details>
      </> : null}
  </section>;
}
