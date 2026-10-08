/** Explicit, bounded, read-only Ozon probe. No database client or persistence. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createOzonReadClient, OzonReadError } from "../src/lib/ozon/read-client.ts";

const allowed = ["products", "prices", "stocks"];
const entity = process.argv[2];
if (!allowed.includes(entity) || process.argv.length !== 3) {
  console.error("Usage: node --import tsx scripts/probe-ozon-catalog.mjs products|prices|stocks");
  process.exit(1);
}

try {
  const entries = {};
  for (const line of readFileSync(resolve(".env.ozon.local"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(OZON_CLIENT_ID|OZON_API_KEY)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    entries[match[1]] = value;
  }
  const client = createOzonReadClient({
    clientId: entries.OZON_CLIENT_ID ?? "", apiKey: entries.OZON_API_KEY ?? "",
  });
  const page = await client.readPage(entity, "", 1);
  console.log(JSON.stringify({
    entity, endpoint: page.endpoint, httpStatus: 200, rowsFetched: page.items.length,
    cursorPresent: Boolean(page.nextCursor), observedAt: page.observedAt,
    completeCapture: page.exhausted, databaseWrites: 0,
  }));
} catch (error) {
  console.error(JSON.stringify(error instanceof OzonReadError ? {
    stage: error.stage, endpoint: error.endpoint, httpStatus: error.httpStatus, reason: error.reason,
  } : { stage: "configuration", reason: "local_probe_failed" }));
  process.exitCode = 1;
}
