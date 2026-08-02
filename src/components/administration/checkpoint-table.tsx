import { formatWhen } from "@/components/administration/warehouse-format";
import type { WarehouseCheckpointRecord } from "@/lib/warehouse/checkpoints/types";

type CheckpointTableProps = {
  checkpoints: WarehouseCheckpointRecord[];
};

function progressLabel(progress: Record<string, unknown>): string {
  if (!progress || !Object.keys(progress).length) return "—";
  if (typeof progress.percent === "number") return `${progress.percent}%`;
  if (typeof progress.progressPercent === "number") return `${progress.progressPercent}%`;
  try {
    return JSON.stringify(progress).slice(0, 48);
  } catch {
    return "—";
  }
}

export function CheckpointTable({ checkpoints }: CheckpointTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Entity</th>
            <th className="px-3 py-2 font-medium">Marketplace</th>
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Last Successful Sync</th>
            <th className="px-3 py-2 font-medium">Progress</th>
            <th className="px-3 py-2 font-medium">Retry Count</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {checkpoints.map((row) => (
            <tr key={row.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">
                {row.entity}
                <span className="ml-1 text-xs text-muted-foreground">({row.mode})</span>
              </td>
              <td className="px-3 py-2">{row.marketplaceType}</td>
              <td className="px-3 py-2">{row.companyId}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatWhen(row.lastSuccessfulSyncAt)}
              </td>
              <td className="px-3 py-2">{progressLabel(row.progress)}</td>
              <td className="px-3 py-2">{row.retryCount}</td>
              <td className="px-3 py-2">{row.status}</td>
            </tr>
          ))}
          {!checkpoints.length ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                No checkpoints recorded for this account.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
