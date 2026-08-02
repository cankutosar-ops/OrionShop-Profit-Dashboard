import { NextResponse } from "next/server";
import {
  assertCompanyInAuthz,
  authorize,
  isAuthzFailure,
} from "@/lib/security/authorize";
import {
  archiveCompany,
  createCompany,
  deleteCompany,
  getCompanyById,
  updateCompany,
} from "@/services/marketplace-account-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const authz = await authorize(request);
    if (isAuthzFailure(authz)) return authz;

    const { id } = await context.params;
    const forbidden = assertCompanyInAuthz(authz, id);
    if (forbidden) return forbidden;

    const company = await getCompanyById(id);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    return NextResponse.json({ company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch company";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authz = await authorize(request);
    if (isAuthzFailure(authz)) return authz;

    const { id } = await context.params;
    const forbidden = assertCompanyInAuthz(authz, id);
    if (forbidden) return forbidden;

    const body = await request.json();
    const company = await updateCompany(id, body);
    return NextResponse.json({ company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update company";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const authz = await authorize(request);
    if (isAuthzFailure(authz)) return authz;

    const { id } = await context.params;
    const forbidden = assertCompanyInAuthz(authz, id);
    if (forbidden) return forbidden;

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");

    // Soft archive by default (Sprint 11.2). Hard delete only with ?mode=hard.
    if (mode === "hard") {
      await deleteCompany(id);
      return NextResponse.json({ success: true, mode: "hard" });
    }

    const company = await archiveCompany(id);
    return NextResponse.json({ success: true, mode: "archive", company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to archive company";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
