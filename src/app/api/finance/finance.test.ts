import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.MSC_DATA_DIR = "memory://";

let entriesApi: typeof import("./entries/route");
let transfersApi: typeof import("./transfers/route");
let verifyApi: typeof import("./verify/route");
let voidApi: typeof import("./entries/[id]/void/route");
let restoreApi: typeof import("./entries/[id]/restore/route");
let correctApi: typeof import("./entries/[id]/correct/route");
let getDb: typeof import("@/lib/db/client").getDb;
let closeDb: typeof import("@/lib/db/client").closeDb;

const request = (method: string, body?: unknown) => new Request("http://localhost/api/finance/entries", {
  method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const eventParams = (eventId: string) => ({ params: Promise.resolve({ eventId }) });

beforeAll(async () => {
  [entriesApi, transfersApi, verifyApi, voidApi, restoreApi, correctApi] = await Promise.all([
    import("./entries/route"), import("./transfers/route"), import("./verify/route"), import("./entries/[id]/void/route"),
    import("./entries/[id]/restore/route"), import("./entries/[id]/correct/route"),
  ]);
  ({ getDb, closeDb } = await import("@/lib/db/client"));
});

afterAll(async () => { await closeDb(); });

describe("Finance ledger API and migration", () => {
  it("enforces POST-only writes, append-only rows, corrections, restores, and hash verification", async () => {
    const { db } = await getDb();
    const { accounts, ledgerEntries } = await import("@/lib/db/schema");
    const { sql } = await import("drizzle-orm");
    const [account] = await db.insert(accounts).values({ name: "Audit Bank", kind: "bank", bankName: "China Bank" }).returning();
    const body = { accountId: account.id, eventId: null, kind: "expense", category: "food", amountCentavos: 5000, occurredOn: "2026-11-04", description: "Receiptless lunch", counterparty: "", orNumber: "" };
    const createdResponse = await entriesApi.POST(request("POST", body));
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string };
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      const response = await entriesApi[method](request(method, body));
      expect(response.status).toBe(405);
    }
    const voidResponse = await voidApi.POST(request("POST", { reason: "Duplicate entry" }), params(created.id));
    expect(voidResponse.status).toBe(201);
    const voidRow = await voidResponse.json() as { id: string };
    let verify = await verifyApi.GET();
    expect((await verify.json()).ok).toBe(true);
    expect(await db.execute(sql`UPDATE ledger_entries SET description = 'tamper' WHERE id = ${created.id}`).then(() => false, () => true)).toBe(true);
    const restoreResponse = await restoreApi.POST(request("POST", { reason: "Undo duplicate" }), params(voidRow.id));
    expect(restoreResponse.status).toBe(201);
    const correction = await correctApi.POST(request("POST", { ...body, amountCentavos: 3000, reason: "Corrected receipt total" }), params(created.id));
    expect(correction.status).toBe(201);
    const allRows = await db.select().from(ledgerEntries);
    const { accountBalances } = await import("@/lib/finance/logic");
    expect(accountBalances(allRows)[account.id]).toBe(-3000);
    verify = await verifyApi.GET();
    expect((await verify.json()).ok).toBe(true);
    await db.execute(sql`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_append_only`);
    await db.execute(sql`UPDATE ledger_entries SET description = 'tampered outside trigger' WHERE id = ${created.id}`);
    const broken = await verifyApi.GET();
    expect(await broken.json()).toMatchObject({ ok: false, brokenAtSeq: 1 });
    await db.execute(sql`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_append_only`);
  });

  it("adds transfers as an atomic pair and keeps filtered account balances independent", async () => {
    const { db } = await getDb();
    const { accounts, ledgerEntries } = await import("@/lib/db/schema");
    const [bank] = await db.insert(accounts).values({ name: "Interleaved Bank", kind: "bank" }).returning();
    const [cash] = await db.insert(accounts).values({ name: "Interleaved Cash", kind: "cash" }).returning();
    const postEntry = (accountId: string, kind: "income" | "expense", amountCentavos: number) => entriesApi.POST(request("POST", {
      accountId,
      eventId: null,
      kind,
      category: "other",
      amountCentavos,
      occurredOn: "2026-11-04",
    }));
    expect((await postEntry(bank.id, "income", 600000)).status).toBe(201);
    expect((await postEntry(cash.id, "expense", 220000)).status).toBe(201);
    expect((await postEntry(bank.id, "expense", 35000)).status).toBe(201);

    const filtered = await entriesApi.GET(new Request(`http://localhost/api/finance/entries?q=account:${bank.id}`));
    expect((await filtered.json() as Array<{ runningBalanceCentavos: number }>).map((entry) => entry.runningBalanceCentavos)).toEqual([600000, 565000]);

    const beforeCount = (await db.select().from(ledgerEntries)).length;
    const unpaired = await entriesApi.POST(request("POST", {
      accountId: bank.id,
      eventId: null,
      kind: "transfer_out",
      category: "other",
      amountCentavos: 1,
      occurredOn: "2026-11-04",
    }));
    expect(unpaired.status).toBe(400);
    const response = await transfersApi.POST(request("POST", {
      fromAccountId: bank.id,
      toAccountId: cash.id,
      eventId: null,
      amountCentavos: 170000,
      occurredOn: "2026-11-04",
      description: "Cash float",
    }));
    expect(response.status).toBe(201);
    const result = await response.json() as { entries: Array<{ accountId: string; amountCentavos: number; kind: string; seq: number; prevHash: string; hash: string }> };
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((entry) => entry.kind)).toEqual(["transfer_out", "transfer_in"]);
    expect(result.entries.map((entry) => entry.accountId)).toEqual([bank.id, cash.id]);
    expect(result.entries.map((entry) => entry.amountCentavos)).toEqual([170000, 170000]);
    expect(result.entries[1].seq).toBe(result.entries[0].seq + 1);
    expect(result.entries[1].prevHash).toBe(result.entries[0].hash);
    expect((await db.select().from(ledgerEntries)).length).toBe(beforeCount + 2);

    const transferBalances = await entriesApi.GET(new Request(`http://localhost/api/finance/entries?q=account:${bank.id}`));
    expect((await transferBalances.json() as Array<{ runningBalanceCentavos: number }>).map((entry) => entry.runningBalanceCentavos)).toEqual([600000, 565000, 395000]);
    const invalid = await transfersApi.POST(request("POST", {
      fromAccountId: bank.id,
      toAccountId: bank.id,
      amountCentavos: 1,
      occurredOn: "2026-11-04",
    }));
    expect(invalid.status).toBe(400);
    expect((await db.select().from(ledgerEntries)).length).toBe(beforeCount + 2);
  });

  it("clears missing receipts, snapshots liquidation items, and exports all SCOA sheets", async () => {
    const { db } = await getDb();
    const { accounts, events, files } = await import("@/lib/db/schema");
    const [{ POST: addBudget }, { POST: submitLiquidation }, { POST: attachReceipt, GET: listReceipts }, { GET: exportFinance }, { GET: listReconciliations, POST: addReconciliation }] = await Promise.all([
      import("./budgets/route"),
      import("./liquidations/[eventId]/submit/route"),
      import("./entries/[id]/receipts/route"),
      import("./export/route"),
      import("./reconciliations/route"),
    ]);
    const [account] = await db.insert(accounts).values({ name: "Receipt Test Cash", kind: "cash" }).returning();
    const [event] = await db.insert(events).values({
      name: "Finance Fixture",
      slug: "finance-fixture",
      type: "on_campus",
      startsAt: new Date("2026-11-10T10:00:00.000Z"),
      endsAt: new Date("2026-11-10T12:00:00.000Z"),
      approvalStatus: "approved",
    }).returning();
    const body = {
      accountId: account.id,
      eventId: event.id,
      kind: "expense",
      category: "food",
      amountCentavos: 4500,
      occurredOn: "2026-11-10",
      description: "Finance fixture lunch",
      counterparty: "Campus caterer",
      orNumber: "OR-FIN-1",
    };
    const created = await entriesApi.POST(request("POST", body));
    const entry = await created.json() as { id: string };
    const missing = await entriesApi.GET(new Request("http://localhost/api/finance/entries?q=event:finance-fixture%20is:missing-receipt"));
    expect(await missing.json()).toHaveLength(1);

    const [file] = await db.insert(files).values({
      sha256: "f".repeat(64),
      originalName: "receipt.txt",
      mime: "text/plain",
      size: 12,
      kind: "receipt",
    }).returning();
    const attached = await attachReceipt(request("POST", { fileId: file.id }), params(entry.id));
    expect(attached.status).toBe(201);
    const listedReceipts = await listReceipts(new Request("http://localhost/api/finance/entries/receipt"), params(entry.id));
    expect(await listedReceipts.json()).toMatchObject([{ file: { originalName: "receipt.txt", mime: "text/plain" } }]);
    const cleared = await entriesApi.GET(new Request("http://localhost/api/finance/entries?q=event:finance-fixture%20is:missing-receipt"));
    expect(await cleared.json()).toEqual([]);

    const budget = await addBudget(request("POST", {
      eventId: event.id,
      category: "food",
      plannedCentavos: 10000,
      note: "Fixture budget",
    }));
    expect(budget.status).toBe(201);
    const submitted = await submitLiquidation(request("POST"), eventParams(event.id));
    expect(submitted.status).toBe(200);
    expect(await submitted.json()).toMatchObject({ entryIds: [entry.id] });

    const savedReconciliation = await addReconciliation(request("POST", {
      accountId: account.id,
      statementDate: "2026-11-10",
      statementBalanceCentavos: -4500,
      note: "Fixture statement",
    }));
    expect(savedReconciliation.status).toBe(201);
    const preview = await listReconciliations(new Request(`http://localhost/api/finance/reconciliations?accountId=${account.id}&statementDate=2026-11-10`));
    expect(await preview.json()).toEqual({ computedBalanceCentavos: -4500 });
    const history = await listReconciliations(new Request("http://localhost/api/finance/reconciliations"));
    expect(await history.json()).toMatchObject([{ reconciliation: { statementBalanceCentavos: -4500, computedBalanceCentavos: -4500 }, account: { name: "Receipt Test Cash" } }]);

    const exported = await exportFinance(new Request("http://localhost/api/finance/export?format=xlsx"));
    expect(exported.status).toBe(200);
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const workbookBytes = Buffer.from(await exported.arrayBuffer());
    await workbook.xlsx.load(workbookBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Ledger",
      "Per-event summary",
      "Missing receipts",
      "Voided & corrections",
      "Chain verification result",
    ]);
    const eventRow = workbook.getWorksheet("Per-event summary")?.getRows(2, 1)?.[0];
    expect(eventRow?.getCell(1).value).toBe("Finance Fixture");
    expect(eventRow?.getCell(4).value).toBe(45);
  });

  it("returns 409 for cloud chat when sensitive finance data is local-only", async () => {
    const { db } = await getDb();
    const { providers } = await import("@/lib/db/schema");
    const { setSetting } = await import("@/lib/settings");
    const { POST: chat } = await import("./chat/route");
    const [provider] = await db.insert(providers).values({
      name: "Cloud finance test",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
    }).returning();
    await setSetting("ai.defaults", { chat: { providerId: provider.id, model: "test-model" } });
    await setSetting("privacy.sensitiveLocalOnly", true);
    const response = await chat(request("POST", { messages: [{ role: "user", content: "How do I reconcile?" }] }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("local-only") });
  });
});
