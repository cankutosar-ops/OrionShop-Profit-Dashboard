import { NextResponse } from "next/server";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import { grantCompanyToUser } from "@/lib/security/tenant-membership";
import {
  createCompany,
  ensureDefaultTenant,
  listCompanies,
} from "@/services/marketplace-account-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authz = await authorize(request);
    if (isAuthzFailure(authz)) return authz;

    // ensureDefaultTenant may create a global tenant — only for internal service.
    if (authz.isInternalService) {
      await ensureDefaultTenant();
    }

    const companies = await listCompanies();
    const filtered = companies.filter(
      (c) => authz.isInternalService || authz.companyIds.includes(c.id)
    );
    return NextResponse.json({ companies: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list companies";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Authenticated users may create a company; membership is granted after create
 * so a user with empty claims can bootstrap their first tenant.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (isAuthFailure(auth)) return auth;

    const body = await request.json();
    const { name, country, currency, timezone, language, is_default, default_tax_percent } =
      body as {
        name?: string;
        country?: string | null;
        currency?: string;
        timezone?: string;
        language?: string;
        is_default?: boolean;
        default_tax_percent?: number;
      };

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const company = await createCompany({
      name,
      country,
      currency,
      timezone,
      language,
      is_default,
      default_tax_percent,
    });

    if (auth.id !== "service:internal") {
      await grantCompanyToUser(auth.id, company.id);
    }

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create company";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
