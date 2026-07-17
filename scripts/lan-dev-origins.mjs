/**
 * Shared LAN origin discovery for Next.js dev (launcher + next.config).
 * Development only — never used for production builds.
 */
import os from "node:os";

/** @param {string | undefined} value */
export function parseAllowedDevOriginsEnv(value) {
  if (!value?.trim()) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          try {
            if (part.includes("://")) return new URL(part).hostname;
          } catch {
            // keep raw host token
          }
          return part.replace(/^\[|\]$/g, "").split(":")[0];
        })
        .filter(Boolean)
    ),
  ];
}

/** IPv4 addresses on non-internal interfaces (excludes localhost / link-local). */
export function discoverLanIpv4Addresses() {
  const addresses = new Set();
  const nets = os.networkInterfaces();

  for (const entries of Object.values(nets)) {
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

/**
 * Origins for Next.js `allowedDevOrigins`.
 * Prefers ALLOWED_DEV_ORIGINS env (comma-separated hosts), else auto-detected LAN IPs.
 */
export function resolveAllowedDevOrigins() {
  const fromEnv = parseAllowedDevOriginsEnv(process.env.ALLOWED_DEV_ORIGINS);
  if (fromEnv.length > 0) return fromEnv;
  return discoverLanIpv4Addresses();
}
