import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  accounts, attendees, budgetLines, committees, events, ledgerEntries, members,
} from "@/lib/db/schema";
import { getFinanceSnapshot } from "@/lib/finance/db-utils";
import { accountBalances, effectiveEntries } from "@/lib/finance/logic";
import { getSetting } from "@/lib/settings";
import type { DictionaryType } from "./types";

export const DICTIONARY_KEYS = [
  "org.name",
  "org.short_name",
  "org.president.name",
  "org.adviser.name",
  "org.committees[]",
  "event.title",
  "event.type",
  "event.date",
  "event.end_date",
  "event.venue",
  "event.description",
  "event.approval_status",
  "event.participant_target",
  "event.participant_actual",
  "attendance.rows[]",
  "ledger.expenses[]",
  "ledger.income[]",
  "ledger.total_expense",
  "ledger.total_income",
  "ledger.net",
  "ledger.balance",
  "ledger.balance_by_account[]",
  "bank.balance",
  "budget.lines[]",
  "liquidation.status",
  "liquidation.due_date",
  "liquidation.unliquidated",
  "liquidation.expenses[]",
  "today",
] as const;

export type DictionaryKey = (typeof DICTIONARY_KEYS)[number];

type DictionarySnapshot = {
  profile: { name: string; shortName: string };
  committees: Array<{ name: string; head: string }>;
  members: Array<{ name: string; role: string }>;
  event: typeof events.$inferSelect | null;
  attendees: Array<typeof attendees.$inferSelect>;
  entries: Array<typeof ledgerEntries.$inferSelect>;
  accounts: Array<typeof accounts.$inferSelect & { balanceCentavos: number }>;
  budgets: Array<typeof budgetLines.$inferSelect>;
  liquidation: { status: string; dueAt: string | null; unliquidatedCentavos: number } | null;
};

export type DictionaryContext = {
  eventId?: string;
  termStart?: string;
  termEnd?: string;
  askValues?: Record<string, unknown>;
  snapshot?: DictionarySnapshot;
};

export type DictionaryEntry = {
  key: DictionaryKey;
  label: string;
  type: DictionaryType;
  columns?: Array<{ key: string; label: string; type: Exclude<DictionaryType, "rows">; synonyms?: string[] }>;
  synonyms: string[];
  resolve: (context: DictionaryContext) => unknown;
};

const expenseColumns = [
  { key: "date", label: "Date", type: "date" as const, synonyms: ["occurred on"] },
  { key: "category", label: "Category", type: "text" as const, synonyms: ["expense type"] },
  { key: "description", label: "Description", type: "text" as const, synonyms: ["particulars", "item"] },
  { key: "counterparty", label: "Payee", type: "text" as const, synonyms: ["vendor", "recipient"] },
  { key: "orNumber", label: "OR number", type: "text" as const, synonyms: ["receipt number", "official receipt"] },
  { key: "amountCentavos", label: "Amount", type: "peso" as const, synonyms: ["cost", "expenses"] },
  { key: "account", label: "Account", type: "text" as const, synonyms: ["bank account"] },
];

const incomeColumns = [
  { key: "date", label: "Date", type: "date" as const, synonyms: ["received on"] },
  { key: "category", label: "Category", type: "text" as const, synonyms: ["income type"] },
  { key: "description", label: "Description", type: "text" as const, synonyms: ["particulars", "source"] },
  { key: "counterparty", label: "From", type: "text" as const, synonyms: ["payer", "donor"] },
  { key: "orNumber", label: "OR number", type: "text" as const, synonyms: ["receipt number"] },
  { key: "amountCentavos", label: "Amount", type: "peso" as const, synonyms: ["income", "total"] },
  { key: "account", label: "Account", type: "text" as const, synonyms: ["bank account"] },
];

const attendanceColumns = [
  { key: "name", label: "Name", type: "text" as const, synonyms: ["attendee"] },
  { key: "email", label: "Email", type: "text" as const, synonyms: ["contact"] },
  { key: "checkedIn", label: "Checked in", type: "text" as const, synonyms: ["attendance status"] },
  { key: "source", label: "Source", type: "text" as const, synonyms: ["registration source"] },
];

const budgetColumns = [
  { key: "category", label: "Category", type: "text" as const, synonyms: ["item"] },
  { key: "plannedCentavos", label: "Budget", type: "peso" as const, synonyms: ["planned", "budgeted amount", "estimated amount"] },
  { key: "actualCentavos", label: "Actual", type: "peso" as const, synonyms: ["spent", "actual amount"] },
  { key: "varianceCentavos", label: "Variance", type: "peso" as const, synonyms: ["remaining"] },
];

const balanceColumns = [
  { key: "name", label: "Account", type: "text" as const, synonyms: ["bank"] },
  { key: "kind", label: "Account type", type: "text" as const, synonyms: ["type"] },
  { key: "balanceCentavos", label: "Balance", type: "peso" as const, synonyms: ["available balance"] },
];

export const dictionaryRegistry: Record<DictionaryKey, DictionaryEntry> = {
  "org.name": { key: "org.name", label: "Organization name", type: "text", synonyms: ["organization", "org name"], resolve: ({ snapshot }) => snapshot?.profile.name },
  "org.short_name": { key: "org.short_name", label: "Organization short name", type: "text", synonyms: ["short name", "acronym"], resolve: ({ snapshot }) => snapshot?.profile.shortName },
  "org.president.name": { key: "org.president.name", label: "President name", type: "text", synonyms: ["president", "organization president"], resolve: ({ snapshot }) => snapshot?.members.find((member) => /president/i.test(member.role))?.name },
  "org.adviser.name": { key: "org.adviser.name", label: "Adviser name", type: "text", synonyms: ["adviser", "advisor"], resolve: ({ snapshot }) => snapshot?.members.find((member) => /adviser|advisor/i.test(member.role))?.name },
  "org.committees[]": { key: "org.committees[]", label: "Committees", type: "rows", columns: [{ key: "name", label: "Committee", type: "text" }, { key: "head", label: "Committee head", type: "text", synonyms: ["chair", "lead"] }], synonyms: ["committee list"], resolve: ({ snapshot }) => snapshot?.committees ?? [] },
  "event.title": { key: "event.title", label: "Event title", type: "text", synonyms: ["activity title", "activity name", "event name"], resolve: ({ snapshot }) => snapshot?.event?.name },
  "event.type": { key: "event.type", label: "Event type", type: "text", synonyms: ["activity type"], resolve: ({ snapshot }) => snapshot?.event?.type },
  "event.date": { key: "event.date", label: "Event date", type: "date", synonyms: ["start date", "date of activity"], resolve: ({ snapshot }) => snapshot?.event?.startsAt },
  "event.end_date": { key: "event.end_date", label: "Event end date", type: "date", synonyms: ["end date"], resolve: ({ snapshot }) => snapshot?.event?.endsAt },
  "event.venue": { key: "event.venue", label: "Event venue", type: "text", synonyms: ["location", "place"], resolve: ({ snapshot }) => snapshot?.event?.venue },
  "event.description": { key: "event.description", label: "Event description", type: "text", synonyms: ["purpose", "rationale"], resolve: ({ snapshot }) => snapshot?.event?.description },
  "event.approval_status": { key: "event.approval_status", label: "Approval status", type: "text", synonyms: ["status", "approval"], resolve: ({ snapshot }) => snapshot?.event?.approvalStatus },
  "event.participant_target": { key: "event.participant_target", label: "Target participants", type: "number", synonyms: ["expected attendance", "target attendees"], resolve: ({ snapshot }) => snapshot?.event?.participantTarget },
  "event.participant_actual": { key: "event.participant_actual", label: "Actual participants", type: "number", synonyms: ["actual attendance"], resolve: ({ snapshot }) => snapshot?.event?.participantActual },
  "attendance.rows[]": { key: "attendance.rows[]", label: "Attendance rows", type: "rows", columns: attendanceColumns, synonyms: ["attendees", "attendance list", "participants"], resolve: ({ snapshot }) => snapshot?.attendees.map((row) => ({ ...row })) ?? [] },
  "ledger.expenses[]": { key: "ledger.expenses[]", label: "Ledger expenses", type: "rows", columns: expenseColumns, synonyms: ["expense rows", "expenses", "liquidation items"], resolve: ({ snapshot }) => snapshot?.entries.filter((entry) => entry.kind === "expense").map((entry) => ({ ...entry, date: entry.occurredOn, account: snapshot.accounts.find((account) => account.id === entry.accountId)?.name })) ?? [] },
  "ledger.income[]": { key: "ledger.income[]", label: "Ledger income", type: "rows", columns: incomeColumns, synonyms: ["income rows", "revenue"], resolve: ({ snapshot }) => snapshot?.entries.filter((entry) => entry.kind === "income").map((entry) => ({ ...entry, account: snapshot.accounts.find((account) => account.id === entry.accountId)?.name })) ?? [] },
  "ledger.total_expense": { key: "ledger.total_expense", label: "Total expenses", type: "peso", synonyms: ["expense total", "total expenditure"], resolve: ({ snapshot }) => snapshot?.entries.filter((entry) => entry.kind === "expense").reduce((sum, entry) => sum + entry.amountCentavos, 0) },
  "ledger.total_income": { key: "ledger.total_income", label: "Total income", type: "peso", synonyms: ["income total", "total revenue"], resolve: ({ snapshot }) => snapshot?.entries.filter((entry) => entry.kind === "income").reduce((sum, entry) => sum + entry.amountCentavos, 0) },
  "ledger.net": { key: "ledger.net", label: "Net balance", type: "peso", synonyms: ["net income", "surplus", "deficit"], resolve: ({ snapshot }) => snapshot?.entries.reduce((sum, entry) => sum + (entry.kind === "income" ? entry.amountCentavos : entry.kind === "expense" ? -entry.amountCentavos : 0), 0) },
  "ledger.balance": { key: "ledger.balance", label: "Ledger balance", type: "peso", synonyms: ["running balance", "cash balance"], resolve: ({ snapshot }) => snapshot?.accounts.reduce((sum, account) => sum + account.balanceCentavos, 0) },
  "ledger.balance_by_account[]": { key: "ledger.balance_by_account[]", label: "Balance by account", type: "rows", columns: balanceColumns, synonyms: ["account balances"], resolve: ({ snapshot }) => snapshot?.accounts ?? [] },
  "bank.balance": { key: "bank.balance", label: "Bank balance", type: "peso", synonyms: ["bank account balance"], resolve: ({ snapshot }) => snapshot?.accounts.filter((account) => account.kind === "bank").reduce((sum, account) => sum + account.balanceCentavos, 0) },
  "budget.lines[]": { key: "budget.lines[]", label: "Budget lines", type: "rows", columns: budgetColumns, synonyms: ["budget table", "budget items", "expense estimate", "estimated expenses"], resolve: ({ snapshot }) => snapshot?.budgets.map((line) => ({ ...line })) ?? [] },
  "liquidation.status": { key: "liquidation.status", label: "Liquidation status", type: "text", synonyms: ["status"], resolve: ({ snapshot }) => snapshot?.liquidation?.status },
  "liquidation.due_date": { key: "liquidation.due_date", label: "Liquidation due date", type: "date", synonyms: ["liquidation deadline"], resolve: ({ snapshot }) => snapshot?.liquidation?.dueAt },
  "liquidation.unliquidated": { key: "liquidation.unliquidated", label: "Unliquidated amount", type: "peso", synonyms: ["amount to liquidate"], resolve: ({ snapshot }) => snapshot?.liquidation?.unliquidatedCentavos },
  "liquidation.expenses[]": { key: "liquidation.expenses[]", label: "Liquidation expenses", type: "rows", columns: expenseColumns, synonyms: ["liquidation items", "expense rows"], resolve: ({ snapshot }) => snapshot?.entries.filter((entry) => entry.kind === "expense").map((entry) => ({ ...entry, date: entry.occurredOn, account: snapshot.accounts.find((account) => account.id === entry.accountId)?.name })) ?? [] },
  today: { key: "today", label: "Today's date", type: "date", synonyms: ["current date", "date prepared"], resolve: () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()) },
};

export async function loadDictionarySnapshot(context: Pick<DictionaryContext, "eventId" | "termStart" | "termEnd">): Promise<DictionarySnapshot> {
  const { db } = await getDb();
  const [profile, committeeRows, memberRows, eventRows, entryRows, accountRows, budgetRows, finance] = await Promise.all([
    getSetting("org.profile"),
    db.select().from(committees).where(isNull(committees.deletedAt)),
    db.select().from(members).where(isNull(members.deletedAt)),
    context.eventId
      ? db.select().from(events).where(and(eq(events.id, context.eventId), isNull(events.deletedAt))).limit(1)
      : Promise.resolve([]),
    db.select().from(ledgerEntries).orderBy(ledgerEntries.seq),
    db.select().from(accounts).where(and(isNull(accounts.deletedAt), isNull(accounts.archivedAt))),
    context.eventId
      ? db.select().from(budgetLines).where(and(eq(budgetLines.eventId, context.eventId), isNull(budgetLines.deletedAt)))
      : Promise.resolve([]),
    getFinanceSnapshot(),
  ]);
  const event = eventRows[0] ?? null;
  const attendeeRows = context.eventId
    ? await db.select().from(attendees).where(and(eq(attendees.eventId, context.eventId), isNull(attendees.deletedAt)))
    : [];
  let entries = effectiveEntries(entryRows);
  if (context.eventId) entries = entries.filter((entry) => entry.eventId === context.eventId);
  if (context.termStart) entries = entries.filter((entry) => entry.occurredOn >= context.termStart!);
  if (context.termEnd) entries = entries.filter((entry) => entry.occurredOn <= context.termEnd!);
  const balances = accountBalances(entryRows);
  const accountsWithBalances = accountRows.map((account) => ({ ...account, balanceCentavos: balances[account.id] ?? 0 }));
  const liquidation = event
    ? finance.liquidations.find((row) => row.eventId === event.id)
    : null;
  const committeeHeads = new Map(committeeRows.map((committee) => [
    committee.id,
    memberRows.find((member) => member.id === committee.headMemberId)?.name ?? "",
  ]));
  return {
    profile: { name: profile.name, shortName: profile.shortName },
    committees: committeeRows.map((committee) => ({ name: committee.name, head: committeeHeads.get(committee.id) ?? "" })),
    members: memberRows.map(({ name, role }) => ({ name, role })),
    event,
    attendees: attendeeRows,
    entries,
    accounts: accountsWithBalances,
    budgets: context.eventId
      ? budgetRows.filter((line) => line.eventId === context.eventId)
      : budgetRows,
    liquidation: liquidation
      ? { status: liquidation.status, dueAt: liquidation.dueAt, unliquidatedCentavos: liquidation.unliquidatedCentavos }
      : null,
  };
}

export async function resolveDictionaryField(field: string, context: DictionaryContext): Promise<unknown> {
  const askMatch = /^ask\.([a-z0-9_]+)$/.exec(field);
  if (askMatch) return context.askValues?.[field] ?? context.askValues?.[askMatch[1]!];
  if (!DICTIONARY_KEYS.includes(field as DictionaryKey)) return undefined;
  const snapshot = context.snapshot ?? await loadDictionarySnapshot(context);
  return dictionaryRegistry[field as DictionaryKey].resolve({ ...context, snapshot });
}

export function askFieldForLabel(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return `ask.${slug || "value"}`;
}
