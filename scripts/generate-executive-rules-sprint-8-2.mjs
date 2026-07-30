/**
 * Sprint 8.2 — emit Executive Rule Engine example outputs for proofs.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";
import { resolveScopedDateRange } from "../src/lib/marketplace-scope.ts";
import { buildMarketplaceIntelligence } from "../src/lib/reporting/marketplace-intelligence.ts";
import { EXECUTIVE_RULE_CATALOG } from "../src/lib/reporting/executive-rule-engine/catalog.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const OUT = path.join(
  process.cwd(),
  "exports",
  "browser-proof",
  "sprint-8-2-executive-rule-engine"
);

async function main() {
  loadEnv();
  await mkdir(OUT, { recursive: true });

  const scope = await resolveScopedDateRange({
    company: "1",
    account: "1",
    from: "2026-06-20",
    to: "2026-07-20",
  });

  const document = await buildMarketplaceIntelligence(scope, {
    periodPresetLabel: "Monthly",
  });

  const section = document.sections.find(
    (s) => s.id === "marketplace-executive-insights"
  );
  const data = section?.data ?? {};

  await writeFile(
    path.join(OUT, "rule-catalog.json"),
    JSON.stringify(EXECUTIVE_RULE_CATALOG, null, 2),
    "utf8"
  );
  await writeFile(
    path.join(OUT, "example-recommendations.json"),
    JSON.stringify(data, null, 2),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        engineVersion: data.engineVersion,
        fired: data.firedRuleIds,
        count: data.recommendations?.length ?? 0,
        titles: (data.recommendations ?? []).map((r) => ({
          severity: r.severity,
          title: r.title,
          ruleId: r.ruleId,
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
