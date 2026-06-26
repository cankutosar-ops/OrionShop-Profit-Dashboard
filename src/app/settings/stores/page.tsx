import { redirect } from "next/navigation";

export default function LegacySettingsStoresPage() {
  redirect("/settings/companies");
}
