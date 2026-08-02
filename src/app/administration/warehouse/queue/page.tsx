import { WarehouseControlShell } from "@/components/administration/warehouse-control-shell";
import { WarehouseQueuePanel } from "@/components/administration/warehouse-control-panels";

export const dynamic = "force-dynamic";

export default function AdministrationWarehouseQueuePage() {
  return (
    <WarehouseControlShell>
      <WarehouseQueuePanel />
    </WarehouseControlShell>
  );
}
