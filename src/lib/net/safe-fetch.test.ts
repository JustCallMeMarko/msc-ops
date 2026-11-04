import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.MSC_DATA_DIR = "memory://";

let safeFetch: typeof import("./safe-fetch").safeFetch;
let invalidateProviderAllowlist: typeof import("./safe-fetch").invalidateProviderAllowlist;
let EgressBlockedError: typeof import("./safe-fetch").EgressBlockedError;
let getDb: typeof import("@/lib/db/client").getDb;
let setSetting: typeof import("@/lib/settings").setSetting;
let providerTable: typeof import("@/lib/db/schema").providers;
let networkLog: typeof import("@/lib/db/schema").networkLog;

beforeAll(async () => {
  ({ safeFetch, invalidateProviderAllowlist, EgressBlockedError } = await import("./safe-fetch"));
  ({ getDb } = await import("@/lib/db/client"));
  ({ setSetting } = await import("@/lib/settings"));
  ({ providers: providerTable, networkLog } = await import("@/lib/db/schema"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { headers: { "content-length": "2" } })));
});

beforeEach(async () => {
  const { db } = await getDb();
  await db.delete(networkLog);
  await db.delete(providerTable);
  await setSetting("privacy.offlineMode", false);
  invalidateProviderAllowlist();
});

describe("safeFetch", () => {
  it("blocks an unconfigured host and records the blocked request", async () => {
    await expect(safeFetch("https://not-configured.example/v1/models?token=secret")).rejects.toBeInstanceOf(EgressBlockedError);
    const { db } = await getDb();
    const [entry] = await db.select().from(networkLog);
    expect(entry.blocked).toBe(true);
    expect(entry.path).toBe("/v1/models");
    expect(entry.path).not.toContain("token");
  });

  it("blocks configured providers in Offline mode while allowing loopback", async () => {
    const { db } = await getDb();
    await db.insert(providerTable).values({ name: "Test provider", type: "openai", baseUrl: "https://provider.example/v1" });
    invalidateProviderAllowlist();
    await setSetting("privacy.offlineMode", true);
    await expect(safeFetch("https://provider.example/v1/models")).rejects.toBeInstanceOf(EgressBlockedError);
    const response = await safeFetch("http://127.0.0.1:11434/api/tags?ignored=yes");
    expect(response.status).toBe(200);
    const entries = await db.select().from(networkLog);
    expect(entries.some((entry) => entry.blocked && entry.host === "provider.example")).toBe(true);
    expect(entries.find((entry) => entry.host === "127.0.0.1")?.path).toBe("/api/tags");
  });
});
