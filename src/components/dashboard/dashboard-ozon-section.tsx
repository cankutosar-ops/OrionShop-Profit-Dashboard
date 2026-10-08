import { createServerClient } from '@/lib/supabase/server';
import { getOzonCaptureStatuses,getOzonCatalog } from '@/services/ozon-dashboard-service';
import { OzonCatalogTable } from '@/components/dashboard/ozon-catalog-table';
import { getOzonPostingWindows } from '@/services/ozon-posting-service';
import { OzonPostingTable } from '@/components/dashboard/ozon-posting-table';
import type { ScopedDateRange } from '@/types/database';
import { getOzonFinanceSourceStatus } from '@/services/ozon-finance-source-service';
import { OzonSourceSyncControls } from '@/components/dashboard/ozon-source-sync-controls';
import { getOzonFinance } from '@/services/ozon-finance-service';
import { OzonFinancePanel } from '@/components/dashboard/ozon-finance-panel';

const labels = { products: 'Product catalog', prices: 'Current prices', stocks: 'Current stock' };

export async function DashboardOzonSection({ scope }: { scope: ScopedDateRange }) {
  const client=await createServerClient();
  const [statuses,catalog]=await Promise.all([getOzonCaptureStatuses(client,scope.marketplaceAccountId),getOzonCatalog(client,scope.marketplaceAccountId)]);
  const from=`${scope.from}T00:00:00Z`,to=`${scope.to}T23:59:59Z`;
  const postingWindows=await getOzonPostingWindows(client,scope.marketplaceAccountId,from,to);
  const finance=await getOzonFinanceSourceStatus(client,scope.marketplaceAccountId,scope.from,scope.to);
  const financial=await getOzonFinance(client,scope.marketplaceAccountId,scope.from,scope.to);
  return (
    <section className="space-y-6" aria-label="Ozon dashboard">
      <div>
        <h2 className="text-xl font-semibold">Ozon</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A new store may have products and shipments before finance accruals appear. Empty accrual responses are recorded without inventing revenue or profit.
        </p>
      </div>
      <OzonSourceSyncControls accountId={scope.marketplaceAccountId} from={scope.from} to={scope.to}/>
      <OzonFinancePanel model={financial.model} unavailable={financial.unavailable} companyId={scope.companyId}/>
      <div className="rounded-xl border p-4">
        <h3 className="font-medium">Finance source status</h3>
        <p className="mt-2 text-sm text-muted-foreground">{finance.status === 'NO_ACCRUALS_REPORTED'
          ? `No accruals reported for ${finance.daysChecked} checked date(s). Expected while a new store has no published accruals.`
          : finance.status === 'SOURCE_ROWS_STORED' ? `${finance.rowsStored} accrual source records stored across ${finance.daysChecked} checked date(s).`
          : finance.status === 'NOT_CAPTURED' ? 'Finance dates have not been synchronized yet.' : 'Stored finance source status is unavailable.'}</p>
        {finance.latestCapture && <p className="mt-2 text-xs text-muted-foreground">Last capture: {finance.latestCapture}</p>}
        <p className="mt-2 text-xs text-muted-foreground">Checked dates describe stored API observations. Accounting totals remain unavailable until the source is reconciled.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statuses.map(value => (
          <div key={value.entity} className="rounded-xl border p-5">
            <h3 className="font-medium">{labels[value.entity]}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {value.status === 'STORED' ? `${value.rowCount} source product records stored`
                : value.status === 'NOT_CAPTURED' ? 'Not synchronized yet' : 'Stored data unavailable'}
            </p>
            {value.observedAt && <p className="mt-2 break-words text-xs text-muted-foreground">
              Last capture: {value.observedAt}
            </p>}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Catalog, prices and stock describe the latest stored capture, independently of the report date filter.
      </p>
      <OzonCatalogTable model={catalog}/>
      <OzonPostingTable windows={postingWindows} from={from} to={to}/>
    </section>
  );
}
