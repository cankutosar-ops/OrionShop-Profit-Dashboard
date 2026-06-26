import { NextResponse } from "next/server";
import {
  deleteCompany,
  getCompanyById,
  updateCompany,
} from "@/services/marketplace-account-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
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
    const { id } = await context.params;
    const body = await request.json();
    const company = await updateCompany(id, body);
    return NextResponse.json({ company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update company";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteCompany(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete company";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
