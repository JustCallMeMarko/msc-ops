import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  accounts, budgetLines, checklistItems, events, guideProgress, ledgerEntries,
  ledgerReceipts, liquidationItems, liquidations, reconciliations,
} from "@/lib/db/schema";
import { accountBalances, budgetVsActual, effectiveEntries, eventTotals, liquidationState, missingReceipts, whatToDoNow } from "./logic";
import { verifyLedgerChain } from "./ledger";

export async function getFinanceSnapshot() {
  const { db } = await getDb();
  const [
    accountRows, entries, eventRows, receiptRows, budgetRows, liquidationRows,
    liquidationItemRows, checklistRows, reconciliationRows, progressRows,
  ] = await Promise.all([
    db.select().from(accounts).where(isNull(accounts.deletedAt)),
    db.select().from(ledgerEntries).orderBy(ledgerEntries.seq),
    db.select().from(events).where(isNull(events.deletedAt)),
    db.select().from(ledgerReceipts).where(isNull(ledgerReceipts.removedAt)),
    db.select().from(budgetLines).where(isNull(budgetLines.deletedAt)),
    db.select().from(liquidations).where(isNull(liquidations.deletedAt)),
    db.select().from(liquidationItems).where(isNull(liquidationItems.deletedAt)),
    db.select().from(checklistItems).where(isNull(checklistItems.deletedAt)),
    db.select().from(reconciliations).where(isNull(reconciliations.deletedAt)),
    db.select().from(guideProgress).where(isNull(guideProgress.deletedAt)),
  ]);
  const activeReceiptEntryIds = new Set(receiptRows.map((receipt) => receipt.entryId));
  const effective = effectiveEntries(entries);
  const balances = accountBalances(entries);
  const eventTotalsById = eventTotals(entries);
  const liquidationStates = eventRows.map((event) => {
    const liquidation = liquidationRows.find((row) => row.eventId === event.id);
    const itemIds = liquidation ? liquidationItemRows
      .filter((item) => item.liquidationId === liquidation.id)
      .map((item) => item.entryId) : [];
    return {
      eventName: event.name,
      status: liquidation?.status ?? "open",
      liquidation,
      ...liquidationState(
        event,
        entries,
        liquidation ? { status: liquidation.status as "open" | "submitted" | "approved", entryIds: itemIds } : null,
        checklistRows.filter((item) => item.eventId === event.id),
      ),
    };
  });
  const budgets = eventRows.flatMap((event) => {
    const lines = budgetRows.filter((line) => line.eventId === event.id);
    const actualEntries = entries.filter((entry) => entry.eventId === event.id);
    return budgetVsActual(lines, actualEntries).map((line) => ({
      ...line,
      eventId: event.id,
      eventName: event.name,
    }));
  });
  const missing = missingReceipts(entries, activeReceiptEntryIds);
  const actionItems = whatToDoNow({
    accounts: accountRows.map((account) => ({ ...account, balanceCentavos: balances[account.id] ?? 0 })),
    liquidations: liquidationStates,
    missingReceiptCount: missing.length,
    auditDate: await import("@/lib/settings").then(({ getSetting }) => getSetting("finance.auditDate")),
    events: eventRows.map((event) => ({ id: event.id, name: event.name, hasFee: event.hasFees })),
    guideProgress: progressRows,
    reconciliations: reconciliationRows.map((row) => ({ accountId: row.accountId, statementDate: row.statementDate })),
    budgets,
  });
  return {
    accounts: accountRows.map((account) => ({ ...account, balanceCentavos: balances[account.id] ?? 0 })),
    entries,
    effectiveEntries: effective,
    events: eventRows,
    receipts: receiptRows,
    budgets,
    budgetLines: budgetRows,
    liquidations: liquidationStates,
    liquidationItems: liquidationItemRows,
    checklistItems: checklistRows,
    reconciliations: reconciliationRows,
    guideProgress: progressRows,
    balances,
    eventTotals: eventTotalsById,
    missingReceipts: missing,
    whatToDoNow: actionItems,
    chain: verifyLedgerChain(entries),
  };
}

export async function findActiveAccount(accountId: string) {
  const { db } = await getDb();
  const [account] = await db.select().from(accounts).where(and(
    eq(accounts.id, accountId),
    isNull(accounts.deletedAt),
    isNull(accounts.archivedAt),
  )).limit(1);
  return account;
}

export async function entriesForEvent(eventId: string) {
  const { db } = await getDb();
  return db.select().from(ledgerEntries).where(eq(ledgerEntries.eventId, eventId)).orderBy(ledgerEntries.seq);
}

export async function relatedEntries(entryIds: string[]) {
  if (!entryIds.length) return [];
  const { db } = await getDb();
  return db.select().from(ledgerEntries).where(inArray(ledgerEntries.id, entryIds)).orderBy(ledgerEntries.seq);
}
