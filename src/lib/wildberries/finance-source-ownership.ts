import type { AdminClient } from "@/lib/supabase/admin";
import type { WbFinance } from "@/types/database";

/** Reject the whole API page before any UPSERT if Excel already owns its report. */
export async function assertFinanceApiReportOwnership(
  db: Pick<AdminClient, "from">,
  rows: readonly Omit<WbFinance, "id">[]
): Promise<void> {
  const apiRows = rows.filter(row => row.source_key?.startsWith("rrd:"));
  if (!apiRows.length) return;
  const accounts = new Set(apiRows.map(row => String(row.marketplace_account_id)));
  if (accounts.size !== 1 || !/^[1-9]\d*$/.test([...accounts][0])) {
    throw new Error("Finance source ownership requires one valid account");
  }
  const reportIds = [...new Set(apiRows.map(row => row.realizationreport_id)
    .filter((id): id is number => id != null && Number.isSafeInteger(id) && id > 0))];
  if (!reportIds.length) return; // Older API evidence can lack report identity.
  const { data, error } = await db.from("wb_finance_excel_imports")
    .select("report_id").eq("marketplace_account_id", [...accounts][0])
    .in("report_id", reportIds).limit(1);
  if (error || !Array.isArray(data)) throw new Error(`Finance source ownership could not be verified: ${error?.code ?? "INVALID_READ"}`);
  if (data?.length) {
    throw new Error(`Finance source conflict: report ${data[0].report_id} is already imported from Excel for this account. Reconcile sources before API persistence.`);
  }
}
