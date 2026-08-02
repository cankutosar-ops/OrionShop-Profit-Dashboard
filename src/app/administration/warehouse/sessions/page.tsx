import { WarehouseControlShell } from "@/components/administration/warehouse-control-shell";
import { WarehouseSessionsPanel } from "@/components/administration/warehouse-control-panels";

export const dynamic = "force-dynamic";

export default function AdministrationWarehouseSessionsPage() {
  return (
    <WarehouseControlShell>
      <WarehouseSessionsPanel />
    </WarehouseControlShell>
  );
}
