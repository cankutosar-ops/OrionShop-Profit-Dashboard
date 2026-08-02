import { WarehouseControlShell } from "@/components/administration/warehouse-control-shell";
import { WarehouseOverviewPanel } from "@/components/administration/warehouse-control-panels";

export const dynamic = "force-dynamic";

export default function AdministrationWarehousePage() {
  return (
    <WarehouseControlShell>
      <WarehouseOverviewPanel />
    </WarehouseControlShell>
  );
}
