import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import {
  discoverLanIpv4Addresses,
  resolveAllowedDevOrigins,
} from "./lan-dev-origins.mjs";

const repoRoot = process.cwd();
const lockFile = resolve(repoRoot, ".dev-server.lock.json");
const DEV_DIST_DIR = ".next-dev";
const DEFAULT_PORT = 3000;
/** Bind all interfaces so phones / LAN PCs can reach the dev server. */
const LAN_HOSTNAME = "0.0.0.0";

function logOk(message) {
  console.log(`✓ ${message}`);
}

function logFail(message) {
  console.error(`✗ ${message}`);
}

function isPidAlive(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseUserArgs(argv) {
  const args = argv.slice(2);
  let port = DEFAULT_PORT;
  let portExplicit = false;
  let hostname = null;
  const forwarded = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port") {
      const value = args[i + 1];
      if (value) {
        port = Number(value);
        portExplicit = true;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
      portExplicit = true;
      continue;
    }
    if (arg === "-H" || arg === "--hostname") {
      const value = args[i + 1];
      if (value) {
        hostname = value;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith("--hostname=")) {
      hostname = arg.slice("--hostname=".length);
      continue;
    }
    if (arg.startsWith("-H=")) {
      hostname = arg.slice("-H=".length);
      continue;
    }
    forwarded.push(arg);
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    logFail(`Invalid port: ${port}`);
    process.exit(1);
  }

  return { port, portExplicit, hostname, forwarded };
}

async function readLock() {
  try {
    return JSON.parse(await readFile(lockFile, "utf8"));
  } catch {
    return null;
  }
}

async function clearLock() {
  try {
    await rm(lockFile, { force: true });
  } catch {
    // no-op
  }
}

function getListenerPid(port) {
  if (process.platform === "win32") {
    try {
      const output = execSync(`netstat -ano -p tcp`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const portToken = `:${port}`;
      for (const line of output.split(/\r?\n/)) {
        if (!line.includes("LISTENING") || !line.includes(portToken)) continue;
        const parts = line.trim().split(/\s+/);
        const localAddress = parts[1] ?? "";
        if (!localAddress.endsWith(portToken)) continue;
        const pid = Number(parts[parts.length - 1]);
        if (Number.isInteger(pid) && pid > 0) return pid;
      }
    } catch {
      return null;
    }
    return null;
  }

  try {
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const pid = Number(output.split(/\r?\n/)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function getProcessInfo(pid) {
  if (!pid) return { name: "unknown", commandLine: "" };

  if (process.platform === "win32") {
    try {
      const output = execSync(
        `wmic process where "ProcessId=${pid}" get Name,CommandLine /FORMAT:LIST`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      );
      const nameMatch = output.match(/Name=([^\r\n]+)/);
      const cmdMatch = output.match(/CommandLine=([^\r\n]*)/);
      return {
        name: nameMatch?.[1]?.trim() || "unknown",
        commandLine: cmdMatch?.[1]?.trim() || "",
      };
    } catch {
      return { name: "unknown", commandLine: "" };
    }
  }

  try {
    const commandLine = execSync(`ps -p ${pid} -o command=`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const name = commandLine.split(/\s+/)[0]?.split("/").pop() || "unknown";
    return { name, commandLine };
  } catch {
    return { name: "unknown", commandLine: "" };
  }
}

function normalizePath(value) {
  return value.replace(/\\/g, "/").toLowerCase();
}

function isOrionShopNextDevProcess(commandLine) {
  if (!commandLine) return false;
  const normalized = normalizePath(commandLine);
  const repo = normalizePath(repoRoot);
  const looksLikeNextDev = /\bnext(\.cmd)?\b/.test(normalized) && normalized.includes(" dev");
  const inThisRepo =
    normalized.includes(repo) ||
    normalized.includes("orionshop-profit-dashboard") ||
    normalized.includes("scripts/dev-launcher.mjs");
  return looksLikeNextDev && inThisRepo;
}

function formatStartedAt(value) {
  return value ?? "unknown";
}

async function verifyLockAndPort(port) {
  const existing = await readLock();

  if (existing?.pid && isPidAlive(existing.pid)) {
    const sameWorkspace = normalizePath(existing.cwd ?? "") === normalizePath(repoRoot);
    if (sameWorkspace) {
      logFail("Another OrionShop dev server is already running.");
      console.error(
        [
          `PID: ${existing.pid}`,
          `Port: ${existing.port ?? port}`,
          `Started: ${formatStartedAt(existing.startedAt)}`,
          "Reuse that server terminal instead of launching a second instance.",
          "If stale, run: npm run dev:recovery",
        ].join("\n")
      );
      process.exit(1);
    }
  }

  if (existing && !isPidAlive(existing.pid)) {
    await clearLock();
    logFail("Stale lock removed");
  } else if (existing) {
    logOk("Lock verified");
  } else {
    logOk("Lock verified");
  }

  const listenerPid = getListenerPid(port);
  if (!listenerPid) {
    logOk(`Port ${port} available`);
    return;
  }

  const { name, commandLine } = getProcessInfo(listenerPid);
  const lock = await readLock();
  const lockMatchesListener = lock?.pid === listenerPid;

  if (lockMatchesListener || isOrionShopNextDevProcess(commandLine)) {
    logFail("Another OrionShop dev server is already running.");
    console.error(
      [
        `PID: ${listenerPid}`,
        `Port: ${port}`,
        `Started: ${formatStartedAt(lock?.startedAt)}`,
        "Stop the existing server before starting a new one.",
        "If stale, run: npm run dev:recovery",
      ].join("\n")
    );
    process.exit(1);
  }

  logFail(`Port ${port} is occupied by ${name} (PID ${listenerPid})`);
  console.error(
    [
      "Free the port before starting the dev server.",
      port === DEFAULT_PORT
        ? `To use another port explicitly: npm run dev -- --port <number>`
        : `Requested port ${port} is not available.`,
    ].join("\n")
  );
  process.exit(1);
}

async function createLock(port, childPid) {
  await mkdir(repoRoot, { recursive: true });
  await writeFile(
    lockFile,
    JSON.stringify(
      {
        pid: process.pid,
        childPid: childPid ?? null,
        cwd: repoRoot,
        port,
        distDir: DEV_DIST_DIR,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

function resolveNextBin() {
  const localBin =
    process.platform === "win32"
      ? join(repoRoot, "node_modules", ".bin", "next.cmd")
      : join(repoRoot, "node_modules", ".bin", "next");
  if (existsSync(localBin)) return localBin;
  return "npx";
}

const { port, portExplicit, hostname, forwarded } = parseUserArgs(process.argv);

if (port !== DEFAULT_PORT && !portExplicit) {
  logFail(`Port ${port} requires an explicit --port argument`);
  process.exit(1);
}

await verifyLockAndPort(port);

const bindHost = hostname || LAN_HOSTNAME;
const lanIps = discoverLanIpv4Addresses();
const allowedDevOrigins = resolveAllowedDevOrigins();

const nextBin = resolveNextBin();
const useLocalBin = nextBin !== "npx";
const extraArgs = forwarded.length > 0 ? ` ${forwarded.join(" ")}` : "";
const nextCommand = useLocalBin
  ? `"${nextBin}" dev --hostname ${bindHost} --port ${port}${extraArgs}`
  : `npx next dev --hostname ${bindHost} --port ${port}${extraArgs}`;

logOk(`Starting Next.js on ${bindHost}:${port} (distDir=${DEV_DIST_DIR})`);
logOk(`Local:   http://localhost:${port}`);
if (lanIps.length > 0) {
  for (const ip of lanIps) {
    logOk(`LAN:     http://${ip}:${port}`);
  }
  logOk(`allowedDevOrigins: ${allowedDevOrigins.join(", ") || "(none)"}`);
} else {
  logOk("LAN:     (no non-internal IPv4 address detected)");
}

const child = spawn(nextCommand, [], {
  cwd: repoRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DIST_DIR: DEV_DIST_DIR,
    // Consumed by next.config.ts → allowedDevOrigins (dev only).
    ALLOWED_DEV_ORIGINS: allowedDevOrigins.join(","),
  },
  shell: true,
});

await createLock(port, child.pid);

const cleanup = async () => {
  await clearLock();
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", async (code, signal) => {
  await cleanup();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", async (error) => {
  await cleanup();
  logFail(`Failed to start Next.js dev server: ${error.message}`);
  process.exit(1);
});
