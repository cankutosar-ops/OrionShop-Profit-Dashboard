import { WarehouseControlShell } from "@/components/administration/warehouse-control-shell";
import { WarehouseSchedulerPanel } from "@/components/administration/warehouse-control-panels";

export const dynamic = "force-dynamic";

export default function AdministrationWarehouseSchedulerPage() {
  return (
    <WarehouseControlShell>
      <WarehouseSchedulerPanel />
    </WarehouseControlShell>
  );
}
