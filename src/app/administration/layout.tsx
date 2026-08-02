import type { ReactNode } from "react";
import { AdminLayout } from "@/components/administration/admin-layout";
import { requireAdminAccess } from "@/lib/administration/require-admin-access";

export const dynamic = "force-dynamic";

/**
 * Sprint 11.1 — Administration route group layout.
 * Auth gate + shared shell. Role checks reserved for later sprints.
 */
export default async function AdministrationLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminAccess();

  return <AdminLayout>{children}</AdminLayout>;
}
