import type { DashboardPageSearchParamsInput } from "@/lib/filter-params";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<DashboardPageSearchParamsInput>;
};

/** Legacy route — main dashboard is now at "/". */
export default async function ProfitV3Redirect({ searchParams }: PageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      qs.set(key, String(value));
    }
  }
  const query = qs.toString();
  redirect(query ? `/?${query}` : "/");
}
