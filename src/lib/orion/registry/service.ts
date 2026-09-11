/**
 * Orion Knowledge Registry service — Sprint 12.4.
 * Ready-only visibility; deterministic, idempotent registration.
 */

import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateKnowledgeObjectBatch } from "@/lib/orion/materialization/validate";
import { orionObjectsDir } from "@/lib/orion/paths";
import {
  readRegistryIndex,
  writeMaterializationRun,
  writeRegistryIndex,
} from "@/lib/orion/registry/storage";
import type {
  OrionKnowledgeObject,
  OrionMaterializationRun,
  OrionRegistryEntry,
  OrionRegistryFilter,
  OrionRegistryIndex,
} from "@/lib/orion/types";

function versionKey(id: string, version: string): string {
  return `${id}@${version}`;
}

function toRegistryEntry(
  obj: OrionKnowledgeObject,
  runId: string,
  isActive: boolean
): OrionRegistryEntry {
  return {
    id: obj.id,
    version: obj.version,
    status: "Ready",
    title: obj.title,
    module: obj.module,
    category: obj.category,
    owner: obj.owner,
    confidence: obj.confidence,
    authority_level: obj.authority_level,
    locale: obj.locale,
    tags: obj.tags,
    registered_at: new Date().toISOString(),
    materialization_run_id: runId,
    is_active: isActive,
    superseded_by: obj.superseded_by,
  };
}

export function loadSourceKnowledgeObjects(): OrionKnowledgeObject[] {
  const dir = orionObjectsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const objects: OrionKnowledgeObject[] = [];

  for (const file of files) {
    const raw = readFileSync(resolve(dir, file), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      objects.push(...(parsed as OrionKnowledgeObject[]));
    } else if (parsed && typeof parsed === "object" && "objects" in parsed) {
      objects.push(...((parsed as { objects: OrionKnowledgeObject[] }).objects));
    } else if (parsed && typeof parsed === "object" && "id" in parsed) {
      objects.push(parsed as OrionKnowledgeObject);
    }
  }

  return objects;
}

export function materializeRegistry(
  sourceObjects?: OrionKnowledgeObject[]
): { run: OrionMaterializationRun; index: OrionRegistryIndex | null } {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const objects = sourceObjects ?? loadSourceKnowledgeObjects();
  const failures = validateKnowledgeObjectBatch(objects);

  if (failures.length > 0) {
    const run: OrionMaterializationRun = {
      run_id: runId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "failed",
      objects_processed: objects.length,
      objects_registered: 0,
      failures,
    };
    writeMaterializationRun(run);
    return { run, index: null };
  }

  const previous = readRegistryIndex();
  const versions: Record<string, OrionKnowledgeObject> = { ...(previous?.versions ?? {}) };
  const activeById = new Map<string, OrionKnowledgeObject>();

  for (const obj of objects) {
    versions[versionKey(obj.id, obj.version)] = obj;
    activeById.set(obj.id, obj);
  }

  if (previous) {
    for (const [key, obj] of Object.entries(previous.versions)) {
      if (!versions[key]) versions[key] = obj;
    }
  }

  const readyObjects: Record<string, OrionKnowledgeObject> = {};
  const entries: OrionRegistryEntry[] = [];

  for (const obj of activeById.values()) {
    readyObjects[obj.id] = obj;
    entries.push(toRegistryEntry(obj, runId, !obj.superseded_by));
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const index: OrionRegistryIndex = {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    materialization_run_id: runId,
    entries,
    objects: readyObjects,
    versions,
  };

  writeRegistryIndex(index);

  const run: OrionMaterializationRun = {
    run_id: runId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: "success",
    objects_processed: objects.length,
    objects_registered: entries.filter((e) => e.is_active).length,
    failures: [],
  };
  writeMaterializationRun(run);

  return { run, index };
}

export function getRegistryIndex(): OrionRegistryIndex {
  const index = readRegistryIndex();
  if (!index) {
    const { index: built } = materializeRegistry();
    if (!built) throw new Error("Orion registry materialization failed");
    return built;
  }
  return index;
}

export function lookupById(
  id: string,
  options: { version?: string; includeHistorical?: boolean } = {}
): OrionKnowledgeObject | null {
  const index = getRegistryIndex();
  if (options.version) {
    const key = versionKey(id, options.version);
    return index.versions[key] ?? null;
  }
  const entry = index.entries.find((e) => e.id === id && e.is_active && e.status === "Ready");
  if (!entry) {
    if (options.includeHistorical) return index.objects[id] ?? null;
    return null;
  }
  return index.objects[id] ?? null;
}

export function filterRegistry(filter: OrionRegistryFilter = {}): OrionRegistryEntry[] {
  const index = getRegistryIndex();
  let entries = index.entries.filter((e) => e.status === "Ready");

  if (!filter.includeHistorical) {
    entries = entries.filter((e) => e.is_active);
  }
  if (filter.id) entries = entries.filter((e) => e.id === filter.id);
  if (filter.module) entries = entries.filter((e) => e.module === filter.module);
  if (filter.category) entries = entries.filter((e) => e.category === filter.category);
  if (filter.owner) entries = entries.filter((e) => e.owner === filter.owner);
  if (filter.confidence) entries = entries.filter((e) => e.confidence === filter.confidence);
  if (filter.tag) entries = entries.filter((e) => e.tags.includes(filter.tag!));
  if (filter.locale) entries = entries.filter((e) => e.locale === filter.locale);
  if (filter.status) entries = entries.filter((e) => e.status === filter.status);

  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

export function registerIfReady(objects: OrionKnowledgeObject[]): OrionMaterializationRun {
  const { run } = materializeRegistry(objects);
  return run;
}

export function getReadyObjectIds(): Set<string> {
  const index = getRegistryIndex();
  return new Set(index.entries.filter((e) => e.is_active && e.status === "Ready").map((e) => e.id));
}
