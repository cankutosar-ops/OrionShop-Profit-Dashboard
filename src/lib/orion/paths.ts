/**
 * Orion data paths — server-side file locations.
 */

import { resolve } from "node:path";

export function orionDataRoot(): string {
  return resolve(process.cwd(), "data", "orion");
}

export function orionObjectsDir(): string {
  return resolve(orionDataRoot(), "objects");
}

export function orionRegistryPath(): string {
  return resolve(orionDataRoot(), "registry", "index.json");
}

export function orionRunsDir(): string {
  return resolve(orionDataRoot(), "runs");
}
