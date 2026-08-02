import { AdminPlaceholder } from "@/components/administration/admin-placeholder";
import { findAdminNavItem } from "@/lib/administration/nav";

type AdminPlaceholderPageProps = {
  /** Exact pathname for this route (must match nav href). */
  pathname: string;
};

/** Renders the shared placeholder for a registered Administration nav item. */
export function AdminPlaceholderPage({ pathname }: AdminPlaceholderPageProps) {
  const item = findAdminNavItem(pathname);
  if (!item) {
    return (
      <AdminPlaceholder
        title="Not found"
        description="This Administration route is not registered in the shell navigation."
        comingInSprint="—"
      />
    );
  }

  return (
    <AdminPlaceholder
      title={item.name}
      description={item.description}
      comingInSprint={item.comingInSprint}
    />
  );
}
