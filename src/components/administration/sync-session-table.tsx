"use client";

import { useState } from "react";
import { formatDuration, formatWhen } from "@/components/administration/warehouse-format";
import type { WarehouseSyncSessionRecord } from "@/lib/warehouse/sessions/types";
import type { WarehouseSyncHistoryRecord } from "@/lib/warehouse/ops/types";

type SessionLike = {
  id: string;
  started: string | null;
  finished: string | null;
  durationMs: number | null;
  trigger: string;
  mode: string;
  entity: string;
  companyId: string;
  marketplace: string;
  status: string;
  errorMessage?: string | null;
};

function fromDbSession(s: WarehouseSyncSessionRecord): SessionLike {
  const durationMs =
    s.startedAt && s.finishedAt
      ? new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()
      : null;
  return {
    id: s.id,
    started: s.startedAt,
    finished: s.finishedAt,
    durationMs,
    trigger: s.triggerSource,
    mode: s.mode,
    entity: s.entity,
    companyId: s.companyId,
    marketplace: s.marketplaceType,
    status: s.status,
    errorMessage: s.errorMessage,
  };
}

function fromHistory(h: WarehouseSyncHistoryRecord): SessionLike {
  return {
    id: h.id,
    started: h.startedAt,
    finished: h.finishedAt,
    durationMs: h.durationMs,
    trigger: h.triggerSource,
    mode: "ops_history",
    entity: h.entity ?? "—",
    companyId: h.companyId,
    marketplace: h.marketplaceType,
    status: h.status,
    errorMessage: h.errorMessage,
  };
}

type SyncSessionTableProps = {
  sessions: WarehouseSyncSessionRecord[];
  history: WarehouseSyncHistoryRecord[];
};

export function SyncSessionTable({ sessions, history }: SyncSessionTableProps) {
  const [detail, setDetail] = useState<SessionLike | null>(null);
  const rows = [
    ...sessions.map(fromDbSession),
    ...history.map(fromHistory),
  ].sort((a, b) => String(b.started ?? "").localeCompare(String(a.started ?? "")));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Finished</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="px-3 py-2 font-medium">Trigger</th>
              <th className="px-3 py-2 font-medium">Mode</th>
              <th className="px-3 py-2 font-medium">Entity</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Marketplace</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{formatWhen(row.started)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatWhen(row.finished)}</td>
                <td className="px-3 py-2">{formatDuration(row.durationMs)}</td>
                <td className="px-3 py-2">{row.trigger}</td>
                <td className="px-3 py-2">{row.mode}</td>
                <td className="px-3 py-2">{row.entity}</td>
                <td className="px-3 py-2">{row.companyId}</td>
                <td className="px-3 py-2">{row.marketplace}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setDetail(row)}
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  No sync sessions yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detail ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold">Session {detail.id}</h3>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] uppercase text-muted-foreground">Status</dt>
              <dd>{detail.status}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-muted-foreground">Entity</dt>
              <dd>{detail.entity}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-muted-foreground">Trigger</dt>
              <dd>{detail.trigger}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-muted-foreground">Mode</dt>
              <dd>{detail.mode}</dd>
            </div>
            {detail.errorMessage ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] uppercase text-muted-foreground">Error</dt>
                <dd className="text-red-600 dark:text-red-400">{detail.errorMessage}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
