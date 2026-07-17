import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/** Dev launcher sets NEXT_DIST_DIR=.next-dev so production builds never clobber dev output. */
const distDir = process.env.NEXT_DIST_DIR || ".next";

/**
 * Webpack watchOptions.ignored — use string globs (reliable with poll on Windows).
 * Must exclude both dist dirs so incremental writes never re-trigger compile loops.
 */
function devWatchIgnored(): string[] {
  return [
    "**/node_modules/**",
    "**/.git/**",
    "**/.next/**",
    "**/.next-dev/**",
    "**/DumpStack.log.tmp",
    "**/System Volume Information/**",
    "**/pagefile.sys",
    "**/hiberfil.sys",
    "**/swapfile.sys",
  ];
}

/**
 * Extra hosts allowed to call `/_next/*` in development (Next.js allowedDevOrigins).
 * Prefers ALLOWED_DEV_ORIGINS (set by `npm run dev` / LAN launcher), else auto-detects LAN IPv4.
 * Production builds ignore this option.
 */
function resolveAllowedDevOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      try {
        if (part.includes("://")) return new URL(part).hostname;
      } catch {
        // keep raw token
      }
      return part.replace(/^\[|\]$/g, "").split(":")[0];
    })
    .filter(Boolean);

  if (fromEnv.length > 0) {
    return [...new Set(fromEnv)];
  }

  const addresses = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      const family = entry.family;
      const isV4 = family === "IPv4" || family === 4;
      if (!isV4 || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      addresses.add(entry.address);
    }
  }
  return [...addresses].sort();
}

const allowedDevOrigins = resolveAllowedDevOrigins();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir,
  // Dev-only. Enables App Router soft navigation from phones / LAN devices.
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  experimental: {
    optimizePackageImports: ["date-fns", "lucide-react", "recharts"],
  },
  webpack: (config, { dev }) => {
    if (!dev) return config;

    config.watchOptions = {
      ...config.watchOptions,
      ignored: devWatchIgnored(),
      // Debounce bursty saves (e.g. multi-file agent edits) before recompiling.
      aggregateTimeout: 800,
      followSymlinks: false,
      // Polling avoids native Windows watcher races that desync chunk manifests.
      ...(process.platform === "win32" ? { poll: 1000 } : {}),
    };

    // Filesystem pack cache rename races (ENOENT on .pack.gz_) corrupt incremental builds.
    if (process.platform === "win32") {
      config.cache = { type: "memory" };
    }

    return config;
  },
};

export default nextConfig;
