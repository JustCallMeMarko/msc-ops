import { beforeAll, describe, expect, it } from "vitest";

process.env.MSC_DATA_DIR = "memory://";

let POST: typeof import("./route").POST;
let GET: typeof import("./route").GET;
let getDb: typeof import("@/lib/db/client").getDb;
let providers: typeof import("@/lib/db/schema").providers;

beforeAll(async () => {
  ({ POST, GET } = await import("./route"));
  ({ getDb } = await import("@/lib/db/client"));
  ({ providers } = await import("@/lib/db/schema"));
});

describe("provider API key serialization", () => {
  it("never exposes encrypted or plaintext keys", async () => {
    const { db } = await getDb();
    await db.delete(providers);
    const created = await POST(new Request("http://localhost/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test OpenAI",
        type: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test-secret-987654321",
      }),
    }));
    expect(created.status).toBe(201);
    const listed = await GET();
    const response = await listed.json();
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("api_key_enc");
    expect(serialized).not.toContain("apiKeyEnc");
    expect(serialized).not.toContain("sk-test-secret-987654321");
    expect(response[0]).toMatchObject({ hasKey: true, keyLast4: "4321" });
  });
});
