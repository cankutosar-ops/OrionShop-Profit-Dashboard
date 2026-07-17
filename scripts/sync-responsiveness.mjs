/**
 * Measures page responsiveness while a background sync runs.
 * Usage: node scripts/sync-responsiveness.mjs [--port 3000] [--account 1]
 */
const DEFAULT_PORT = 3000;
const DEFAULT_ACCOUNT = "1";
const REQUEST_TIMEOUT_MS = 30_000;
const POLL_MS = 2000;
const SYNC_TIMEOUT_MS = 15 * 60 * 1000;

function parseArgs() {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;
  let account = DEFAULT_ACCOUNT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) port = Number(args[++i]);
    if (args[i] === "--account" && args[i + 1]) account = args[++i];
  }
  return { port, account };
}

function dateRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function buildProbeRoutes(account) {
  const r30 = dateRange(30);
  const q = `from=${r30.from}&to=${r30.to}&company=1&account=${account}`;
  return [
    { name: "Dashboard", path: `/?${q}` },
    { name: "Reports", path: `/reports?${q}` },
    { name: "Product Analytics", path: `/analytics/products?${q}` },
    { name: "Inventory", path: `/inventory?${q}` },
    { name: "Settings", path: `/settings/companies` },
  ];
}

async function timedFetch(baseUrl, path) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const elapsed = Date.now() - started;
  const body = await response.text();
  const styled =
    path.includes("/settings") ||
    body.includes('rel="stylesheet"') ||
    body.includes("bg-background");
  return { elapsed, ok: response.ok && styled, status: response.status };
}

async function startBackgroundSync(baseUrl, account, from, to) {
  const response = await fetch(`${baseUrl}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marketplaceAccountId: account,
      dateFrom: from,
      dateTo: to,
      entities: ["products", "orders", "sales", "finance", "stock"],
    }),
  });
  const data = await response.json();
  if (response.status !== 202) {
    throw new Error(`Expected sync 202, got ${response.status}: ${JSON.stringify(data)}`);
  }
  return data.requestId;
}

async function waitForSyncEnd(baseUrl, account) {
  const started = Date.now();
  while (Date.now() - started < SYNC_TIMEOUT_MS) {
    const response = await fetch(
      `${baseUrl}/api/sync/status?marketplaceAccountId=${encodeURIComponent(account)}`
    );
    const data = await response.json();
    if (data.status !== "running") {
      return data;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error("Sync did not finish within timeout");
}

async function main() {
  const { port, account } = parseArgs();
  const baseUrl = `http://localhost:${port}`;
  const range = dateRange(90);
  const routes = buildProbeRoutes(account);
  const samples = [];

  console.log(`Sync responsiveness test on ${baseUrl} (account ${account})`);

  const requestId = await startBackgroundSync(baseUrl, account, range.from, range.to);
  console.log(`Background sync accepted: requestId=${requestId}`);

  const syncStarted = Date.now();
  let round = 0;

  while (true) {
    const statusResponse = await fetch(
      `${baseUrl}/api/sync/status?marketplaceAccountId=${encodeURIComponent(account)}`
    );
    const status = await statusResponse.json();
    if (status.status !== "running") break;

    round += 1;
    for (const route of routes) {
      const result = await timedFetch(baseUrl, route.path);
      samples.push({ round, route: route.name, ...result });
      const flag = result.ok ? "ok" : "FAIL";
      console.log(
        `  [round ${round}] ${route.name}: ${result.elapsed}ms (${flag}, HTTP ${result.status})`
      );
      if (!result.ok) {
        console.error("\nRESPONSIVENESS_FAIL: page became unresponsive or unstyled during sync");
        process.exit(1);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  const finalStatus = await waitForSyncEnd(baseUrl, account);
  const syncMs = Date.now() - syncStarted;
  const elapsed = samples.map((s) => s.elapsed);
  const avg = elapsed.reduce((a, b) => a + b, 0) / Math.max(elapsed.length, 1);
  const max = Math.max(...elapsed, 0);

  console.log("\n[RESPONSIVENESS] Performance Summary");
  console.log(`Probe rounds ........... ${round}`);
  console.log(`Probe requests ......... ${samples.length}`);
  console.log(`Average API Response ... ${(avg / 1000).toFixed(1)} s`);
  console.log(`Maximum API Response ... ${(max / 1000).toFixed(1)} s`);
  console.log(`Total Sync ............. ${(syncMs / 1000).toFixed(1)} s`);
  console.log(`Sync status ............ ${finalStatus.status}`);
  if (finalStatus.timing) {
    console.log(`Peak Memory ............ ${finalStatus.timing.peakRssMb} MB`);
    console.log(JSON.stringify(finalStatus.timing.phases, null, 2));
  }

  console.log("\nRESPONSIVENESS_OK: pages stayed responsive during background sync");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
