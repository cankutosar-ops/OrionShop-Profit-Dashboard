"use client";

import { useCallback, useState } from "react";
import type { CostManagementRow } from "@/types/database";
import { CostManagementBulkUpdate } from "@/components/costs/cost-management-bulk-update";
import { CostManagementTable } from "@/components/costs/cost-management-table";
import { useScopeQueryString } from "@/hooks/use-scope-query";

type CostManagementManagerProps = {
  initialRows: CostManagementRow[];
};

export function CostManagementManager({ initialRows }: CostManagementManagerProps) {
  const scopeQuery = useScopeQueryString();
  const [rows, setRows] = useState(initialRows);

  const reloadRows = useCallback(async () => {
    const url = scopeQuery ? `/api/costs/rows?${scopeQuery}` : "/api/costs/rows";
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Failed to reload costs");
    }
    setRows(data.rows as CostManagementRow[]);
  }, [scopeQuery]);

  return (
    <div className="space-y-6">
      <CostManagementTable rows={rows} scopeQuery={scopeQuery} onRowUpdated={setRows} />
      <CostManagementBulkUpdate
        productCount={rows.length}
        onImportComplete={() => {
          void reloadRows();
        }}
      />
    </div>
  );
}
