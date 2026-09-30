import { DashboardLoadError } from "@/components/dashboard/dashboard-load-error";

// Render the alert on the server; the app shell uses request search params.
export const dynamic = "force-dynamic";

export default function ServiceUnavailablePage() {
  return <DashboardLoadError />;
}
