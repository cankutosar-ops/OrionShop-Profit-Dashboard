/**
 * Static import-graph analysis for architecture boundary checks.
 *
 * Shared by `verify-production-data-plane.mjs` (full sweep) and
 * `verify-worker-production-readiness.mjs` (targeted preflight) so both agree
 * on what "reaches WB HTTP" means.
 *
 * This resolves real module specifiers rather than scanning text: `@/` alias
 * and relative paths are resolved to files on disk and followed transitively.
 * Type-only imports are excluded because they vanish at compile time and cannot
 * cause a runtime request.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const RESOLVE_SUFFIXES = ["", ".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"];

const STATIC_IMPORT = /(?:^|\n)\s*import\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
const REEXPORT = /(?:^|\n)\s*export\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Modules that can originate a marketplace request: they build the client or hardcode the host. */
const WB_HOST = /https?:\/\/[a-z0-9.-]*wildberries\.ru/i;
const WB_CLIENT = /\bnew\s+WbApiClient\s*\(|\bcreateWbSyncService\s*\(/;

/** Recursively collect TypeScript sources, skipping node_modules and dot-dirs. */
export function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walkFiles(full, out);
    } else if (/\.(tsx?|mts|cts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function createImportGraph({ root, srcDir }) {
  const SRC = srcDir ?? path.join(root, "src");
  const edgeCache = new Map();
  const sinkCache = new Map();

  const rel = (p) => path.relative(root, p).replace(/\\/g, "/");

  /** Resolve a `@/` or relative specifier to a real file, or null when external. */
  function resolveSpecifier(specifier, fromFile) {
    let base;
    if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
    else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
    else return null;

    for (const suffix of RESOLVE_SUFFIXES) {
      const candidate = base + suffix;
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  function readEdges(file) {
    const src = readFileSync(file, "utf8");
    const staticSpecs = new Set();
    const deferredSpecs = new Set();

    for (const re of [STATIC_IMPORT, REEXPORT]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        if (/^type\b/.test((m[1] ?? "").trim())) continue;
        staticSpecs.add(m[2]);
      }
    }

    BARE_IMPORT.lastIndex = 0;
    let bare;
    while ((bare = BARE_IMPORT.exec(src))) staticSpecs.add(bare[1]);

    DYNAMIC_IMPORT.lastIndex = 0;
    let dyn;
    while ((dyn = DYNAMIC_IMPORT.exec(src))) deferredSpecs.add(dyn[1]);

    return { staticSpecs, deferredSpecs };
  }

  function edgesOf(file) {
    if (!edgeCache.has(file)) edgeCache.set(file, readEdges(file));
    return edgeCache.get(file);
  }

  function isWbHttpSink(file) {
    if (!sinkCache.has(file)) {
      const src = readFileSync(file, "utf8");
      sinkCache.set(file, WB_HOST.test(src) || WB_CLIENT.test(src));
    }
    return sinkCache.get(file);
  }

  /** Transitive closure over import edges, tracking parents for chain reporting. */
  function reachable(entry, { includeDeferred = false } = {}) {
    const seen = new Set([entry]);
    const parents = new Map();
    const queue = [entry];

    while (queue.length > 0) {
      const current = queue.shift();
      const { staticSpecs, deferredSpecs } = edgesOf(current);
      const specs = includeDeferred
        ? [...staticSpecs, ...deferredSpecs]
        : [...staticSpecs];

      for (const spec of specs) {
        const target = resolveSpecifier(spec, current);
        if (!target || seen.has(target)) continue;
        seen.add(target);
        parents.set(target, current);
        queue.push(target);
      }
    }
    return { seen, parents };
  }

  function chainTo(file, parents, entry) {
    const chain = [file];
    let cursor = file;
    while (parents.has(cursor) && cursor !== entry) {
      cursor = parents.get(cursor);
      chain.push(cursor);
    }
    return chain.reverse().map(rel).join(" -> ");
  }

  /** WB HTTP sinks reachable from an entrypoint, with the import chain to each. */
  function wbSinksFor(entry, options) {
    const { seen, parents } = reachable(entry, options);
    const sinks = [...seen].filter(isWbHttpSink);
    return {
      count: seen.size,
      sinks,
      chains: sinks.map((s) => chainTo(s, parents, entry)),
    };
  }

  return { rel, resolveSpecifier, reachable, isWbHttpSink, wbSinksFor, chainTo, SRC };
}
