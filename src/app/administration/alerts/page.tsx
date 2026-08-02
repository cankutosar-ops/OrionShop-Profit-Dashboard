import { WarehouseControlShell } from "@/components/administration/warehouse-control-shell";
import { WarehouseAlertsPanel } from "@/components/administration/warehouse-control-panels";

export const dynamic = "force-dynamic";

export default function AdministrationAlertsPage() {
  return (
    <WarehouseControlShell>
      <WarehouseAlertsPanel />
    </WarehouseControlShell>
  );
}
