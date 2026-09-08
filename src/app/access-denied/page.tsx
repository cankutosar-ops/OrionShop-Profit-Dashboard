import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { PageScopeDenialReason } from "@/lib/security/page-scope";

export const dynamic = "force-dynamic";

/**
 * Denial surface for server pages. Renders no tenant data and resolves no scope,
 * so it stays reachable for a signed-in user with no (or insufficient) membership.
 */
const REASONS: Record<string, string> = {
  AUTHZ_NO_MEMBERSHIP:
    "Your account has no company membership yet. An administrator must grant access before any data is visible.",
  AUTHZ_ACCOUNT_FORBIDDEN:
    "The requested marketplace account is not part of your access. Pick an account from the header selector.",
  AUTHZ_COMPANY_FORBIDDEN:
    "The requested company is not part of your access. Pick a company from the header selector.",
  AUTHZ_TENANT_MISMATCH:
    "The requested marketplace account does not belong to the requested company.",
  AUTHZ_ACCOUNT_REQUIRED:
    "No marketplace account could be resolved for your access.",
  AUTHZ_ADMIN_ROLE_REQUIRED:
    "Administration requires the administrator platform role.",
};

type PageProps = {
  searchParams: Promise<{ code?: string }>;
};

export default async function AccessDeniedPage({ searchParams }: PageProps) {
  const { code } = await searchParams;
  const reason = code as PageScopeDenialReason | "AUTHZ_ADMIN_ROLE_REQUIRED" | undefined;
  const detail =
    (reason && REASONS[reason]) ??
    "You are not authorized to view this data with the current selection.";

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
      <ShieldAlert className="h-10 w-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Not authorized</h1>
      <p className="text-sm text-muted-foreground">{detail}</p>
      {reason ? (
        <p className="font-mono text-xs text-muted-foreground/70">{reason}</p>
      ) : null}
      <div className="mt-2 flex gap-3">
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Back to dashboard
        </Link>
        <Link
          href="/auth/logout"
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Sign out
        </Link>
      </div>
    </div>
  );
}
