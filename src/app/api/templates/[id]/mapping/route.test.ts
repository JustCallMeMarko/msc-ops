import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.MSC_DATA_DIR = "memory://";

let mappingApi: typeof import("./route");
let getDb: typeof import("@/lib/db/client").getDb;
let closeDb: typeof import("@/lib/db/client").closeDb;
let files: typeof import("@/lib/db/schema").files;
let templates: typeof import("@/lib/db/schema").templates;

beforeAll(async () => {
  [mappingApi, { getDb, closeDb }, { files, templates }] = await Promise.all([
    import("./route"),
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
  ]);
});

afterAll(async () => {
  await closeDb();
});

describe("template mapping API", () => {
  it("accepts dictionary fields for repeating columns", async () => {
    const { db } = await getDb();
    const [file] = await db.insert(files).values({
      sha256: "a".repeat(64),
      originalName: "template.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 1,
      kind: "template",
    }).returning();
    const structure = {
      format: "xlsx" as const,
      targets: [{
        id: "s:Expenses!rows:1",
        kind: "rows" as const,
        label: "Date · Amount",
        columns: [{ index: 0, label: "Date" }, { index: 1, label: "Amount" }],
      }],
      warnings: [],
    };
    const [template] = await db.insert(templates).values({
      lineageId: crypto.randomUUID(),
      name: "Expense template",
      kind: "liquidation",
      source: "scoa",
      format: "xlsx",
      fileId: file.id,
      structure,
    }).returning();

    const response = await mappingApi.PUT(new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapping: {
          "s:Expenses!rows:1": {
            field: "ledger.expenses[]",
            columns: { "0": "date", "1": "amountCentavos" },
          },
        },
      }),
    }), { params: Promise.resolve({ id: template.id }) });

    expect(response.status).toBe(200);
    const payload = await response.json() as { template: { mapping: Record<string, { columns?: Record<string, string> }> } };
    expect(payload.template.mapping["s:Expenses!rows:1"]?.columns).toEqual({
      "0": "date",
      "1": "amountCentavos",
    });
  });
});
