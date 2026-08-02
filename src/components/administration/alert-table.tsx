import { formatWhen } from "@/components/administration/warehouse-format";
import type { WarehouseOpsAlert } from "@/lib/warehouse/ops/types";

const ALERT_LABEL: Record<string, string> = {
  consecutive_failures: "Consecutive Failures",
  long_running_job: "Sync Delayed / Long Running",
  stale_data: "Sync Delayed",
  queue_overflow: "Queue Overflow",
};

type AlertTableProps = {
  alerts: WarehouseOpsAlert[];
};

export function AlertTable({ alerts }: AlertTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Severity</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Marketplace</th>
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">
                {ALERT_LABEL[alert.alertType] ?? alert.alertType}
              </td>
              <td className="px-3 py-2 capitalize">{alert.severity}</td>
              <td className="px-3 py-2">
                <div className="font-medium">{alert.title}</div>
                <div className="text-xs text-muted-foreground">{alert.message}</div>
              </td>
              <td className="px-3 py-2">{alert.marketplaceType}</td>
              <td className="px-3 py-2">{alert.companyId}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatWhen(alert.createdAt)}</td>
              <td className="px-3 py-2">{alert.status}</td>
            </tr>
          ))}
          {!alerts.length ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                No open warehouse alerts.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
