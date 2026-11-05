import { describe, expect, it } from "vitest";
import { accountBalances, budgetVsActual, effectiveEntries, eventTotals, formatPeso, liquidationState, missingReceipts, parsePeso, runningBalance, whatToDoNow } from "./logic";
import type { LedgerEntry } from "./logic";

const entry = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: "e1", seq: 1, accountId: "a1", eventId: "event1", kind: "expense", category: "food",
  amountCentavos: 1000, occurredOn: "2026-11-04", targetEntryId: null, replacesEntryId: null, ...overrides,
});

describe("Finance integer money and ledger logic", () => {
  it("parses and formats peso amounts without floating-point arithmetic", () => {
    expect(parsePeso("₱1,200.50")).toBe(120050);
    expect(parsePeso("1200")).toBe(120000);
    expect(parsePeso("1,200.5")).toBe(120050);
    expect(parsePeso("PHP 1200")).toBe(120000);
    for (const invalid of ["-1", "1.001", "12,00", "garbage", "₱"]) expect(parsePeso(invalid)).toBeNull();
    expect(formatPeso(120050)).toBe("₱1,200.50");
  });

  it("drops voided entries unless the void is restored and drops replaced entries", () => {
    const rows = [
      entry({ id: "a", seq: 1 }),
      entry({ id: "b", seq: 2, kind: "void", targetEntryId: "a" }),
      entry({ id: "c", seq: 3, kind: "restore", targetEntryId: "b" }),
      entry({ id: "d", seq: 4, replacesEntryId: "a", amountCentavos: 700 }),
    ];
    expect(effectiveEntries(rows).map((row) => row.id)).toEqual(["d"]);
    expect(accountBalances(rows).a1).toBe(-700);
    expect(runningBalance(rows).at(-1)?.balanceCentavos).toBe(-700);
    expect(eventTotals(rows).event1).toMatchObject({ incomeCentavos: 0, expenseCentavos: 700, netCentavos: -700 });
  });

  it("keeps running balances separate for interleaved accounts", () => {
    const rows = [
      entry({ id: "bank-income", seq: 1, accountId: "bank", kind: "income", amountCentavos: 600000 }),
      entry({ id: "cash-expense", seq: 2, accountId: "cash", amountCentavos: 220000 }),
      entry({ id: "bank-expense", seq: 3, accountId: "bank", amountCentavos: 35000 }),
      entry({ id: "cash-income", seq: 4, accountId: "cash", kind: "income", amountCentavos: 100000 }),
    ];
    expect(runningBalance(rows).map(({ balanceCentavos }) => balanceCentavos)).toEqual([600000, -220000, 565000, -120000]);
  });

  it("calculates budgets, missing receipts, and liquidation state", () => {
    const rows = [entry(), entry({ id: "inc", seq: 2, kind: "income", amountCentavos: 5000 })];
    expect(budgetVsActual([{ category: "food", plannedCentavos: 800 }], rows)[0]).toMatchObject({ actualCentavos: 1000, varianceCentavos: -200 });
    expect(missingReceipts(rows, new Set()).map((row) => row.id)).toEqual(["e1"]);
    expect(liquidationState({ id: "event1" }, rows, null, [{ eventId: "event1", ruleKey: "liquidation", dueAt: "2026-11-02T00:00:00.000Z" }], new Date("2026-11-04T00:00:00.000Z"))).toMatchObject({ unliquidatedCentavos: 1000, overdue: true });
  });

  it("emits each action rule and sorts by severity then due date", () => {
    const items = whatToDoNow({
      accounts: [
        { id: "a", name: "Cash", kind: "cash", balanceCentavos: -1 },
        { id: "b", name: "Bank", kind: "bank", balanceCentavos: 100 },
      ],
      liquidations: [
        { eventId: "late", eventName: "Late Event", status: "open", unliquidatedCentavos: 420000, dueAt: "2026-11-02", overdue: true },
        { eventId: "soon", eventName: "Soon Event", status: "open", unliquidatedCentavos: 100, dueAt: "2026-11-06", overdue: false },
      ],
      missingReceiptCount: 3, auditDate: "2026-11-14",
      events: [{ id: "fee", name: "Fee Event", hasFee: true }],
      guideProgress: [],
      reconciliations: [],
      budgets: [
        { eventId: "fee", eventName: "Fee Event", category: "food", plannedCentavos: 10, actualCentavos: 20 },
        { eventId: "fee", eventName: "Fee Event", category: "other", plannedCentavos: 10, actualCentavos: 60 },
      ],
    }, new Date("2026-11-04T00:00:00.000Z"));
    expect(items.map((item) => item.id)).toEqual(expect.arrayContaining([
      "liquidation-overdue-late", "liquidation-due-soon", "finance-missing-receipts",
      "fundraising-guide-fee", "reconcile-b", "negative-balance-a", "budget-over-fee",
    ]));
    expect(items[0].severity).toBe("critical");
    expect(items.find((item) => item.id === "finance-missing-receipts")?.severity).toBe("critical");
    expect(items.find((item) => item.id === "negative-balance-a")).toMatchObject({ severity: "critical", title: "Cash has a negative balance" });
    expect(items.find((item) => item.id === "budget-over-fee")?.title).toBe("Fee Event is ₱0.60 over budget (food, other)");
    expect(items.filter((item) => item.id.startsWith("budget-over-fee"))).toHaveLength(1);
    const noBank = whatToDoNow({ accounts: [], liquidations: [], missingReceiptCount: 0, events: [], guideProgress: [], reconciliations: [], budgets: [] }, new Date("2026-11-04T00:00:00.000Z"));
    expect(noBank.find((item) => item.id === "finance-bank-account")?.action).toEqual({ guide: "bank_account", step: "prepare" });
  });
});
