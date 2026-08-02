import { WarehouseControlShell } from "@/components/administration/warehouse-control-shell";
import { WarehouseCheckpointsPanel } from "@/components/administration/warehouse-control-panels";

export const dynamic = "force-dynamic";

export default function AdministrationWarehouseCheckpointsPage() {
  return (
    <WarehouseControlShell>
      <WarehouseCheckpointsPanel />
    </WarehouseControlShell>
  );
}
