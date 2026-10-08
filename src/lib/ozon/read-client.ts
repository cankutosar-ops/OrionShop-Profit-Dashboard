/** Server/worker transport foundation. Not registered for automatic synchronization. */
import { parseOzonSourceJson } from './source-json';
export type OzonReadEntity = "products" | "prices" | "stocks";

const endpoints: Record<OzonReadEntity, string> = {
  products: "/v3/product/list",
  prices: "/v5/product/info/prices",
  stocks: "/v4/product/info/stocks",
};

export class OzonReadError extends Error {
  constructor(
    readonly stage: "configuration" | "request" | "response",
    readonly endpoint: string | null,
    readonly httpStatus: number | null,
    readonly reason: string,
  ) {
    // Never include source bodies, headers, credentials or fetch exception messages.
    super(`Ozon ${stage}: ${reason}`);
    this.name = "OzonReadError";
  }
}

export type OzonReadPage = {
  entity: OzonReadEntity;
  endpoint: string;
  items: Record<string, unknown>[];
  nextCursor: string;
  observedAt: string;
  /** Only an empty page proves exhaustion here; totals alone are not evidence. */
  exhausted: boolean;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Secrets live in a closure and are absent from object properties/JSON serialization. */
export function createOzonReadClient(input: {
  clientId: string;
  apiKey: string;
  fetch?: typeof fetch;
}) {
  if (typeof window !== "undefined") {
    throw new OzonReadError("configuration", null, null, "server_runtime_required");
  }
  const clientId = input.clientId.trim();
  const apiKey = input.apiKey.trim();
  if (!clientId || !apiKey || /[\r\n]/.test(clientId + apiKey)) {
    throw new OzonReadError("configuration", null, null, "invalid_credentials");
  }
  const request = input.fetch ?? fetch;
  return Object.freeze({
    async readPage(entity: OzonReadEntity, cursor = "", limit = 100): Promise<OzonReadPage> {
      if (!Object.hasOwn(endpoints, entity)) {
        throw new OzonReadError("configuration", null, null, "unsupported_entity");
      }
      const endpoint = endpoints[entity];
      if (typeof cursor !== "string" || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new OzonReadError("configuration", endpoint, null, "invalid_page_request");
      }
      const body = {
        filter: { visibility: "ALL" },
        [entity === "products" ? "last_id" : "cursor"]: cursor,
        limit,
      };
      let response: Response;
      try {
        response = await request(`https://api-seller.ozon.ru${endpoint}`, {
          method: "POST",
          headers: { "Client-Id": clientId, "Api-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new OzonReadError("request", endpoint, null, "transport_failed");
      }
      if (!response.ok) {
        throw new OzonReadError("request", endpoint, response.status, "http_error");
      }
      let json: unknown;
      try { json = parseOzonSourceJson(await response.text()); } catch {
        throw new OzonReadError("response", endpoint, response.status, "invalid_json");
      }
      if (!record(json)) {
        throw new OzonReadError("response", endpoint, response.status, "invalid_root");
      }
      const page = entity === "products" ? json.result : json;
      if (!record(page) || !Array.isArray(page.items) || !page.items.every(record)) {
        throw new OzonReadError("response", endpoint, response.status, "invalid_items");
      }
      const nextCursor = page[entity === "products" ? "last_id" : "cursor"];
      if (typeof nextCursor !== "string") {
        throw new OzonReadError("response", endpoint, response.status, "invalid_cursor");
      }
      if (page.items.length > limit) {
        throw new OzonReadError("response", endpoint, response.status, "page_exceeds_limit");
      }
      if (page.items.length > 0 && (!nextCursor || nextCursor === cursor)) {
        throw new OzonReadError("response", endpoint, response.status, "cursor_not_advancing");
      }
      return {
        entity, endpoint, items: page.items, nextCursor,
        observedAt: new Date().toISOString(), exhausted: page.items.length === 0,
      };
    },
  });
}
