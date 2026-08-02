"use client";

import type { ReactNode } from "react";
import { WarehouseControlProvider } from "@/components/administration/warehouse-control-context";

/** Shared account scope + control-center fetch for Warehouse Admin pages. */
export function WarehouseControlShell({ children }: { children: ReactNode }) {
  return <WarehouseControlProvider>{children}</WarehouseControlProvider>;
}
