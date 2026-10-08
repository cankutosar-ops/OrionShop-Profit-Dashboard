import { PageHeader } from '@/components/layout/page-header';
import { createServerClient } from '@/lib/supabase/server';
import { getOzonFinance, getOzonRealization } from '@/services/ozon-finance-service';
import { OzonFinancePanel } from '@/components/dashboard/ozon-finance-panel';
import type { ScopedDateRange } from '@/types/database';

export async function OzonFinanceReport({ scope }: { scope: ScopedDateRange }) {
  const client = await createServerClient();
  const [{ model, unavailable }, realization] = await Promise.all([
    getOzonFinance(client,scope.marketplaceAccountId,scope.from,scope.to),
    getOzonRealization(client,scope.marketplaceAccountId,scope.from,scope.to),
  ]);
  return <><PageHeader title="Ozon Profit & Loss" description="Stored Ozon accruals and realized sale/return evidence" showWbControls={false}/>
    <div className="space-y-6 p-4 sm:p-6"><OzonFinancePanel model={model} unavailable={unavailable} companyId={scope.companyId} report/>
      <section className="rounded-xl border p-4"><h2 className="font-semibold">Realized unit evidence</h2>
        {realization.status === 'STORED' ? <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Offer / SKU</th><th>Sold</th><th>Returned</th></tr></thead><tbody>{realization.rows.map((row,i) => <tr key={i}><td className="py-2">{row.offerId} / {row.sku}</td><td className="text-center">{row.sold}</td><td className="text-center">{row.returned}</td></tr>)}</tbody></table></div>
          : <p className="mt-2 text-sm text-muted-foreground">{realization.status === 'FULL_MONTH_REQUIRED' ? 'Select a complete calendar month to compare the monthly realization report.' : realization.status === 'NOT_CAPTURED' ? 'The monthly realized-sales report has not been captured. Ozon publishes it in the following month.' : 'Stored monthly realization evidence is unavailable.'}</p>}
      </section>
    </div></>;
}
