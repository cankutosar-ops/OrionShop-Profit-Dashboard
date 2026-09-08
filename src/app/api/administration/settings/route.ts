/**
 * Sprint 11.6 — Platform Settings API.
 * Reads/writes through the shared platform configuration provider (SoT).
 */

import { NextResponse } from "next/server";
import { requireAdminApi, isAdminAuthFailure } from "@/lib/security/admin-authorization";
import {
  getPlatformConfigurationPayload,
  savePlatformConfiguration,
  type PlatformSettingsDocument,
} from "@/lib/platform-config";
import { assertSettingsPayloadSafe } from "@/services/administration-platform-settings-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApi(request);
    if (isAdminAuthFailure(auth)) return auth;

    const payload = await getPlatformConfigurationPayload();
    assertSettingsPayloadSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminApi(request);
    if (isAdminAuthFailure(auth)) return auth;

    const body = (await request.json()) as Partial<PlatformSettingsDocument>;
    // Strip ownership-foreign fields if clients still send them.
    if (body.general && "defaultCurrency" in (body.general as object)) {
      const { defaultCurrency: _ignored, ...rest } = body.general as Record<string, unknown>;
      body.general = rest as PlatformSettingsDocument["general"];
    }

    const payload = await savePlatformConfiguration(body, auth.id);
    assertSettingsPayloadSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
