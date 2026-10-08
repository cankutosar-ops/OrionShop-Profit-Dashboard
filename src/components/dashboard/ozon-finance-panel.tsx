import Link from 'next/link';
import type { OzonFinanceModel } from '@/lib/ozon/finance-model';

const labels: Record<string, string> = { sales: 'Realized sales / returns', sellerSubsidies: 'Discount points / partner credits',
  commission: 'Final commission', acquiring: 'Acquiring', logistics: 'Logistics', returnsLogistics: 'Return logistics',
  storage: 'Storage', acceptance: 'Acceptance / handling', advertising: 'Advertising booked by Seller API',
  penalties: 'Penalties', adjustments: 'Adjustments', compensation: 'Compensation', otherServices: 'Other services',
  cashMovement: 'Balance transfers / deposits (outside P&L)', unknown: 'Unclassified source amounts' };

export function OzonFinancePanel({ model, unavailable, companyId, report = false }: {
  model: OzonFinanceModel; unavailable: boolean; companyId: string; report?: boolean;
}) {
  const query = new URLSearchParams({ account: model.accountId, company: companyId, from: model.from, to: model.to });
  return <section className="space-y-4" aria-label="Ozon financial performance">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">{report ? 'Ozon financial breakdown' : 'Ozon Commercial Performance'}</h2>
      <div className="flex flex-wrap gap-3 text-sm">
        {!report && <Link className="text-primary" href={`/reports/profit-loss?${query}`}>Financial breakdown</Link>}
        <a className="text-primary" href={`/api/ozon/finance/export?${query}`}>Export source breakdown CSV</a>
      </div>
    </div>
    <p className="text-sm text-muted-foreground">{unavailable ? 'Stored finance data is unavailable.' : model.status === 'NOT_CAPTURED'
      ? 'Finance has not been synchronized for this period.' : model.status === 'NO_ACCRUALS_REPORTED'
      ? `No accruals reported for ${model.daysChecked} checked date(s). Expected for a new store; this is not a zero-profit statement.`
      : `${model.daysChecked} checked date(s). ${model.sourceControlsMatched ? 'Source component totals agree with accrual controls.' : 'Source reconciliation requires review.'}`}</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {(['grossSales','returnedSales','netSales','revenueBeforeOtherExpenses'] as const).map(key=>{
        const total=model.totals.find(t=>t.currency==='RUB');
        const hasSales=model.lines.some(line=>line.category==='sales'&&line.currency==='RUB');
        const names={grossSales:'Realized gross sales',returnedSales:'Returns',netSales:'Net realized sales',revenueBeforeOtherExpenses:'Revenue after commission / acquiring'};
        return <div key={key} className="rounded-xl border bg-card p-4"><h3 className="text-sm text-muted-foreground">{names[key]}</h3><p className="mt-2 text-xl font-semibold">{total&&hasSales&&model.sourceControlsMatched?`${total[key]} ₽`:'—'}</p><p className="mt-1 text-xs text-muted-foreground">Observed accruals; publication completeness is not finalized</p></div>;
      })}
      {['commission','logistics','storage','advertising'].map(category => {
        const total = model.totals.find(t => t.currency === 'RUB')?.categories.find(c => c.category === category);
        return <div key={category} className="rounded-xl border bg-card p-4"><h3 className="text-sm text-muted-foreground">{labels[category]}</h3>
          <p className="mt-2 text-xl font-semibold">{total && model.sourceControlsMatched ? `${total.deduction} ₽` : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{total ? 'Stored source deduction; credits retain their sign' : 'No verified component captured'}</p></div>;
      })}
      <div className="rounded-xl border bg-card p-4"><h3 className="text-sm text-muted-foreground">Product Cost</h3><p className="mt-2 text-xl font-semibold">{model.productCost===null?'—':`${model.productCost} ₽`}</p><p className="mt-1 text-xs text-muted-foreground">Requires verified realized units and explicit product costing</p></div>
      <div className="rounded-xl border bg-card p-4"><h3 className="text-sm text-muted-foreground">Tax</h3><p className="mt-2 text-xl font-semibold">{model.tax===null?'—':`${model.tax} ₽`}</p><p className="mt-1 text-xs text-muted-foreground">Requires verified Ozon tax basis and effective company profile</p></div>
      <div className="rounded-xl border bg-card p-4"><h3 className="text-sm text-muted-foreground">Net Profit</h3><p className="mt-2 text-xl font-semibold">{model.netProfit===null?'—':`${model.netProfit} ₽`}</p><p className="mt-1 text-xs text-muted-foreground">Not finalized while publication, cost or tax evidence is unresolved</p></div>
    </div>
    {model.totals.map(total => <div key={total.currency} className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm"><caption className="p-3 text-left text-muted-foreground">Observed accrual components · {total.currency} · {model.from}–{model.to}</caption>
        <thead><tr className="border-b"><th className="p-3">Component</th><th className="p-3 text-right">Signed source amount</th></tr></thead>
        <tbody>{total.categories.map(category => <tr key={category.category} className="border-b"><td className="p-3">{labels[category.category]}</td><td className="p-3 text-right tabular-nums">{category.signedAmount}</td></tr>)}
          <tr><td className="p-3">Classified source contribution before Product Cost / tax</td><td className="p-3 text-right tabular-nums">{total.sourcePnlContribution}</td></tr>
          <tr><td className="p-3">Accrual control total (comparison only)</td><td className="p-3 text-right tabular-nums">{total.controlTotal}</td></tr>
        </tbody></table>
    </div>)}
    <p className="text-xs text-muted-foreground">Final commission is counted once; list commission and unit prices are informational. Delivery totals and accrual totals are controls, not extra costs. Seller-booked advertising is already included; Performance spend must be reconciled before any additional deduction.</p>
    {model.issues.length > 0 && <details className="rounded-xl border p-3"><summary>{model.issues.length} source reconciliation warning(s)</summary><ul className="mt-2 space-y-1 text-xs">{model.issues.slice(0,30).map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
  </section>;
}
