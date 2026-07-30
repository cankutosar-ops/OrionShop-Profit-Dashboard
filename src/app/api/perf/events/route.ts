import { NextResponse } from "next/server";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";
import type { PerfCategory } from "@/lib/perf/types";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";

export const dynamic = "force-dynamic";

/** Ingest client-side performance events. */
export async function POST(request: Request) {
  try {
    const authz = await authorize(request);
    if (isAuthzFailure(authz)) return authz;

    const body = (await request.json()) as {
      category?: PerfCategory;
      name?: string;
      durationMs?: number;
      route?: string;
      meta?: Record<string, string | number | boolean | null | undefined>;
      ts?: number;
    };

    if (!body.name || body.durationMs === undefined || !body.category) {
      return NextResponse.json({ ok: false, error: "Invalid event" }, { status: 400 });
    }

    recordPerfEvent({
      category: body.category,
      name: body.name,
      durationMs: Number(body.durationMs) || 0,
      route: body.route,
      meta: body.meta,
      ts: body.ts,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
