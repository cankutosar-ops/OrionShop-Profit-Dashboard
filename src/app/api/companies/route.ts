import { NextResponse } from "next/server";
import {
  createCompany,
  ensureDefaultTenant,
  listCompanies,
} from "@/services/marketplace-account-service";

export async function GET() {
  try {
    await ensureDefaultTenant();
    const companies = await listCompanies();
    return NextResponse.json({ companies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list companies";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, country, currency, timezone, language, is_default } = body as {
      name?: string;
      country?: string | null;
      currency?: string;
      timezone?: string;
      language?: string;
      is_default?: boolean;
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
    });
    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create company";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
