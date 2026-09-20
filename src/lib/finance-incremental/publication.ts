import { createAdminClient } from "@/lib/supabase/admin";
import type { FinanceIncrementalWeek } from "./types";

export type FinancePublicationEvidence = {
  source: "wb_sales_reports_list";
  marketplaceAccountId: string;
  from: string;
  through: string;
  reportIds: number[];
  observedBefore: string;
};

export type PublicationSnapshot = {
  marketplace_account_id: string | number;
  marketplace_type: string;
  report_id: number;
  date_from: string;
  date_to: string;
  create_date: string;
  observed_at: string;
  meta: unknown;
};

function day(value: string): string | null {
  const d = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d ? d : null;
}

/** Positive publication evidence only. Empty lists/calendar/operation dates prove nothing. */
export function publicationCoverage(accountId: string, week: FinanceIncrementalWeek,
  observedBefore: string, rows: PublicationSnapshot[]): FinancePublicationEvidence | null {
  if (!day(week.from) || !day(week.to) || week.from > week.to || !Number.isFinite(Date.parse(observedBefore))) return null;
  const valid = rows.filter(r => {
    const source = (r.meta as { source?: unknown } | null)?.source;
    const from = day(r.date_from), to = day(r.date_to), created = day(r.create_date);
    return String(r.marketplace_account_id) === accountId && r.marketplace_type === "wildberries" &&
      source === "wb_sales_reports_list" && Number.isSafeInteger(r.report_id) && r.report_id > 0 &&
      from && to && created && from <= to && created >= to &&
      Number.isFinite(Date.parse(r.observed_at)) && Date.parse(r.observed_at) <= Date.parse(observedBefore) &&
      created <= r.observed_at.slice(0, 10);
  }).sort((a,b) => a.date_from.localeCompare(b.date_from));
  let next = week.from;
  const reportIds: number[] = [];
  for (const row of valid) {
    const from = row.date_from.slice(0,10), to = row.date_to.slice(0,10);
    if (to < next) continue;
    if (from > next) break;
    reportIds.push(row.report_id);
    if (to >= week.to) return {source:"wb_sales_reports_list",marketplaceAccountId:accountId,
      from:week.from,through:week.to,reportIds:[...new Set(reportIds)],observedBefore};
    next = new Date(Date.parse(to)+86400000).toISOString().slice(0,10);
  }
  return null;
}

/** Existing independent metadata producer is kpi-snapshot-sync; this read never calls WB. */
export async function readFinancePublicationEvidence(accountId: string, week: FinanceIncrementalWeek,
  observedBefore: string): Promise<FinancePublicationEvidence | null> {
  if (!Number.isSafeInteger(Number(accountId)) || Number(accountId) <= 0) return null;
  const client = createAdminClient();
  const rows: PublicationSnapshot[] = [];
  for (let from=0;;from+=1000) {
    const result = await client.from("warehouse_sales_report_snapshot")
      .select("marketplace_account_id,marketplace_type,report_id,date_from,date_to,create_date,observed_at,meta")
      .eq("marketplace_account_id",Number(accountId)).eq("marketplace_type","wildberries")
      .lte("date_from",week.to).gte("date_to",week.from).lte("observed_at",observedBefore)
      .order("report_id").range(from,from+999);
    if (result.error) throw new Error("Finance publication evidence read failed");
    rows.push(...result.data as unknown as PublicationSnapshot[]);
    if (result.data.length<1000) break;
  }
  return publicationCoverage(accountId,week,observedBefore,rows);
}
