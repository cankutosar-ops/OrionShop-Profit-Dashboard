import type { SyncVerificationReportRow } from "@/lib/sync-verification-audit/types";

export function verificationReportToJson(row: SyncVerificationReportRow): string {
  return JSON.stringify(
    {
      id: row.id,
      verifiedAt: row.verified_at,
      marketplaceAccountId: row.marketplace_account_id,
      healthScore: row.health_score,
      overallResult: row.overall_result,
      schemaStatus: row.schema_status,
      ordersStatus: row.orders_status,
      salesStatus: row.sales_status,
      financeStatus: row.finance_status,
      inventoryStatus: row.inventory_status,
      syncStatus: row.sync_status,
      syncDurationMs: row.sync_duration_ms,
      alerts: row.snapshot.operationalAlerts,
      failures: row.failures,
      snapshot: row.snapshot,
    },
    null,
    2
  );
}

export function verificationReportToCsv(row: SyncVerificationReportRow): string {
  const lines = [
    "field,value",
    csv("verifiedAt", row.verified_at),
    csv("marketplaceAccountId", row.marketplace_account_id),
    csv("healthScore", String(row.health_score)),
    csv("overallResult", row.overall_result),
    csv("schemaStatus", row.schema_status),
    csv("ordersStatus", row.orders_status),
    csv("salesStatus", row.sales_status),
    csv("financeStatus", row.finance_status),
    csv("inventoryStatus", row.inventory_status),
    csv("syncStatus", row.sync_status ?? ""),
    csv("syncDurationMs", row.sync_duration_ms == null ? "" : String(row.sync_duration_ms)),
    csv("ordersLatestDb", row.snapshot.orders.latestDbDate ?? ""),
    csv("ordersLatestApi", row.snapshot.orders.latestApiDate ?? ""),
    csv("salesLatestDb", row.snapshot.sales.latestDbDate ?? ""),
    csv("salesLatestApi", row.snapshot.sales.latestApiDate ?? ""),
    csv("financeLatestDb", row.snapshot.finance.latestDbDate ?? ""),
    csv("financeLatestApi", row.snapshot.finance.latestApiDate ?? ""),
    csv("inventoryLatestDb", row.snapshot.inventory.latestDbDate ?? ""),
    csv("alertsCount", String(row.snapshot.operationalAlerts.length)),
    csv("failuresCount", String(row.failures.length)),
  ];
  for (const f of row.failures) {
    lines.push(csv(`failure:${f.category}`, `${f.affectedEntity} | ${f.reason}`));
  }
  return lines.join("\n");
}

function csv(field: string, value: string): string {
  const escaped = `"${value.replace(/"/g, '""')}"`;
  return `${field},${escaped}`;
}

/** Minimal single-page PDF (Helvetica) for audit export — no external PDF dependency. */
export function verificationReportToPdf(row: SyncVerificationReportRow): Buffer {
  const lines = [
    "OrionShop Sync Verification Report",
    `Verified At: ${row.verified_at}`,
    `Marketplace Account: ${row.marketplace_account_id}`,
    `Health Score: ${row.health_score}`,
    `Overall Result: ${row.overall_result}`,
    `Schema: ${row.schema_status}`,
    `Orders: ${row.orders_status} (DB ${row.snapshot.orders.latestDbDate ?? "-"} / API ${row.snapshot.orders.latestApiDate ?? "-"})`,
    `Sales: ${row.sales_status} (DB ${row.snapshot.sales.latestDbDate ?? "-"} / API ${row.snapshot.sales.latestApiDate ?? "-"})`,
    `Finance: ${row.finance_status} (DB ${row.snapshot.finance.latestDbDate ?? "-"} / API ${row.snapshot.finance.latestApiDate ?? "-"})`,
    `Inventory: ${row.inventory_status} (DB ${row.snapshot.inventory.latestDbDate ?? "-"})`,
    `Sync Status: ${row.sync_status ?? "-"}`,
    `Duration ms: ${row.sync_duration_ms ?? "-"}`,
    "",
    "Alerts:",
    ...(row.snapshot.operationalAlerts.length
      ? row.snapshot.operationalAlerts.map((a) => `- [${a.severity}] ${a.title}: ${a.detail}`)
      : ["- none"]),
    "",
    "Failures:",
    ...(row.failures.length
      ? row.failures.map((f) => `- [${f.category}] ${f.affectedEntity}: ${f.reason}`)
      : ["- none"]),
  ].map((line) => line.replace(/[^\x20-\x7E]/g, "?"));

  const contentLines: string[] = ["BT", "/F1 10 Tf", "50 780 Td", "14 TL"];
  for (let i = 0; i < lines.length; i++) {
    const safe = lines[i].replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    if (i === 0) contentLines.push(`(${safe}) Tj`);
    else contentLines.push(`T* (${safe}) Tj`);
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj"
  );
  objects.push(`4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream endobj`);
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj + "\n";
  }
  const xref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
