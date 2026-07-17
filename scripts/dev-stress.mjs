/**
 * Dev runtime stress test — validates CSS, chunks, and route health under load.
 * Usage: node scripts/dev-stress.mjs [--port 3000] [--rounds 60]
 */
const DEFAULT_PORT = 3000;
const DEFAULT_ROUNDS = 60;
const REQUEST_TIMEOUT_MS = 120_000;

function parseArgs() {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;
  let rounds = DEFAULT_ROUNDS;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = Number(args[++i]);
      continue;
    }
    if (args[i] === "--rounds" && args[i + 1]) {
      rounds = Number(args[++i]);
      continue;
    }
  }
  return { port, rounds };
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

function buildRoutes() {
  const r30 = dateRange(30);
  const r90 = dateRange(90);
  const q30 = `from=${r30.from}&to=${r30.to}&company=1&account=1`;
  const q90 = `from=${r90.from}&to=${r90.to}&company=2&account=2`;
  return [
    "/",
    `/reports?${q30}`,
    `/reports/product-profit?${q30}`,
    `/analytics/products?${q30}`,
    `/analytics/products?${q90}`,
    `/inventory?${q30}`,
    `/analytics/pricing?${q30}`,
    `/analytics/simulator?${q30}`,
    "/api/companies",
    "/api/brands?account=1&company=1",
  ];
}

function hasStyledHtml(html) {
  return (
    html.includes('rel="stylesheet"') ||
    html.includes("bg-background") ||
    html.includes("--color-background")
  );
}

function hasRuntimeErrorPage(html) {
  return (
    html.includes("Internal Server Error") ||
    html.includes("Application error: a server-side exception has occurred")
  );
}

async function waitForServer(baseUrl, maxAttempts = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) {
        console.log(`Server ready (${attempt} attempt(s))`);
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Dev server not ready at ${baseUrl} after ${maxAttempts}s`);
}

async function checkRoute(baseUrl, route, attempt = 1) {
  const url = `${baseUrl}${route}`;
  const started = Date.now();
  let response;
  let body;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    body = await response.text();
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      return checkRoute(baseUrl, route, attempt + 1);
    }
    throw error;
  }
  const elapsed = Date.now() - started;
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    throw new Error(`${route} -> HTTP ${response.status} (${elapsed}ms)`);
  }

  if (hasRuntimeErrorPage(body)) {
    throw new Error(`${route} -> Internal Server Error page (${elapsed}ms)`);
  }

  if (route.startsWith("/api/")) {
    return { route, elapsed, css: "n/a" };
  }

  if (!contentType.includes("text/html")) {
    throw new Error(`${route} -> unexpected content-type: ${contentType}`);
  }

  if (!hasStyledHtml(body)) {
    throw new Error(`${route} -> unstyled HTML (no stylesheet/theme markers)`);
  }

  const cssMatch = body.match(/href="(\/_next\/static\/css\/[^"]+\.css)"/);
  if (cssMatch) {
    const cssUrl = `${baseUrl}${cssMatch[1]}`;
    const cssResponse = await fetch(cssUrl);
    if (!cssResponse.ok) {
      throw new Error(`${route} -> CSS asset ${cssMatch[1]} returned ${cssResponse.status}`);
    }
    const cssBody = await cssResponse.text();
    if (!cssBody.includes("background") && !cssBody.includes("--color")) {
      throw new Error(`${route} -> CSS asset appears empty or invalid`);
    }
  }

  return { route, elapsed, css: cssMatch?.[1] ?? "inline" };
}

async function main() {
  const { port, rounds } = parseArgs();
  const baseUrl = `http://localhost:${port}`;
  const routes = buildRoutes();

  console.log(`Dev stress test: ${rounds} rounds x ${routes.length} routes on ${baseUrl}`);
  await waitForServer(baseUrl);

  let total = 0;
  for (let round = 1; round <= rounds; round++) {
    for (const route of routes) {
      total += 1;
      try {
        const result = await checkRoute(baseUrl, route);
        if (total % 20 === 0) {
          console.log(
            `  ok [${total}] ${result.route} (${result.elapsed}ms, css=${result.css})`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\nFAIL at round ${round}, request ${total}, route: ${route}`);
        console.error(`FIRST_FAILURE: ${message}`);
        process.exit(1);
      }
    }
  }

  console.log(`\nSTRESS_OK: ${total} requests completed without CSS/chunk/runtime failures`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
