import { WarehouseControlShell } from "@/components/administration/warehouse-control-shell";
import { SystemHealthPanel } from "@/components/administration/warehouse-control-panels";

export const dynamic = "force-dynamic";

export default function AdministrationSystemHealthPage() {
  return (
    <WarehouseControlShell>
      <SystemHealthPanel />
    </WarehouseControlShell>
  );
}
