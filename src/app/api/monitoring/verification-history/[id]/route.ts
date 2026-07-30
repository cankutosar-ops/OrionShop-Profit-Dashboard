import { NextResponse } from "next/server";
import {
  assertAccountInAuthz,
  authorize,
  isAuthzFailure,
} from "@/lib/security/authorize";
import {
  verificationReportToCsv,
  verificationReportToJson,
  verificationReportToPdf,
} from "@/lib/sync-verification-audit/export";
import { getVerificationReport } from "@/services/sync-verification-report-repository";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/** Sprint 9.5 — immutable verification detail / export. */
export async function GET(request: Request, { params }: RouteParams) {
  const authz = await authorize(request);
  if (isAuthzFailure(authz)) return authz;

  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "json";

  try {
    const row = await getVerificationReport(id);
    if (!row) {
      return NextResponse.json({ error: "Verification report not found" }, { status: 404 });
    }

    const forbidden = assertAccountInAuthz(authz, row.marketplace_account_id);
    if (forbidden) return forbidden;

    if (format === "csv") {
      return new NextResponse(verificationReportToCsv(row), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="verification-${id}.csv"`,
        },
      });
    }

    if (format === "pdf") {
      const pdf = verificationReportToPdf(row);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="verification-${id}.pdf"`,
        },
      });
    }

    return new NextResponse(verificationReportToJson(row), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(format === "download"
          ? { "Content-Disposition": `attachment; filename="verification-${id}.json"` }
          : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load verification report" },
      { status: 500 }
    );
  }
}
