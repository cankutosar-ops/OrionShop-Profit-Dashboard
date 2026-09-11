/**
 * Orion Knowledge Registry — file storage (Sprint 12.4).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { orionRegistryPath, orionRunsDir } from "@/lib/orion/paths";
import type { OrionMaterializationRun, OrionRegistryIndex } from "@/lib/orion/types";

export function ensureOrionDirs(): void {
  const registryPath = orionRegistryPath();
  mkdirSync(dirname(registryPath), { recursive: true });
  mkdirSync(orionRunsDir(), { recursive: true });
}

export function readRegistryIndex(): OrionRegistryIndex | null {
  const path = orionRegistryPath();
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as OrionRegistryIndex;
}

/** Atomic write: temp file + rename */
export function writeRegistryIndex(index: OrionRegistryIndex): void {
  ensureOrionDirs();
  const path = orionRegistryPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(index, null, 2), "utf8");
  renameSync(tmp, path);
}

export function writeMaterializationRun(run: OrionMaterializationRun): void {
  ensureOrionDirs();
  const path = `${orionRunsDir()}/${run.run_id}.json`;
  writeFileSync(path, JSON.stringify(run, null, 2), "utf8");
}

export function readMaterializationRun(runId: string): OrionMaterializationRun | null {
  const path = `${orionRunsDir()}/${runId}.json`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as OrionMaterializationRun;
}

export function listMaterializationRuns(): OrionMaterializationRun[] {
  ensureOrionDirs();
  const files = readdirSync(orionRunsDir()).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => readMaterializationRun(f.replace(/\.json$/, "")))
    .filter((r): r is OrionMaterializationRun => r !== null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}
