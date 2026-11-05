import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { parseQuery } from "@/lib/query";
import { getDb } from "@/lib/db/client";
import { accounts, events, ledgerEntries, ledgerReceipts } from "@/lib/db/schema";
import { effectiveEntries, missingReceipts, runningBalance } from "@/lib/finance/logic";
import { insertLedgerEntry } from "@/lib/finance/ledger";
import { financeEntrySchema } from "@/lib/finance/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = parseQuery(new URL(request.url).searchParams.get("q") ?? "");
  const values = new Map<string, string[]>();
  for (const filter of query.filters) values.set(filter.key, [...(values.get(filter.key) ?? []), filter.value]);
  const hasVoided = (values.get("is") ?? []).includes("voided");
  const hasMissing = (values.get("is") ?? []).includes("missing-receipt");
  const { db } = await getDb();
  const [allEntries, accountRows, eventRows, receiptRows] = await Promise.all([
    db.select().from(ledgerEntries).orderBy(ledgerEntries.seq),
    db.select().from(accounts).where(isNull(accounts.deletedAt)),
    db.select().from(events).where(isNull(events.deletedAt)),
    db.select({ entryId: ledgerReceipts.entryId }).from(ledgerReceipts).where(isNull(ledgerReceipts.removedAt)),
  ]);
  const effectiveIds = new Set(effectiveEntries(allEntries).map((entry) => entry.id));
  const activeReceiptEntryIds = new Set(receiptRows.map((row) => row.entryId));
  let rows = hasVoided
    ? allEntries.filter((entry) => entry.kind === "void" || entry.kind === "restore" || !effectiveIds.has(entry.id))
    : allEntries.filter((entry) => effectiveIds.has(entry.id));

  const accountFilter = values.get("account")?.at(-1);
  if (accountFilter) {
    const matchingIds = new Set(accountRows
      .filter((account) => account.id === accountFilter || account.name.toLowerCase().includes(accountFilter.toLowerCase()))
      .map((account) => account.id));
    rows = rows.filter((entry) => matchingIds.has(entry.accountId));
  }
  const eventFilter = values.get("event")?.at(-1);
  if (eventFilter) {
    const matchingIds = new Set(eventRows.filter((event) => event.id === eventFilter || event.slug === eventFilter).map((event) => event.id));
    rows = rows.filter((entry) => entry.eventId && matchingIds.has(entry.eventId));
  }
  for (const category of values.get("category") ?? []) rows = rows.filter((entry) => entry.category === category);
  for (const kind of values.get("kind") ?? []) rows = rows.filter((entry) => entry.kind === kind);
  const from = values.get("from")?.at(-1);
  const to = values.get("to")?.at(-1);
  if (from) rows = rows.filter((entry) => entry.occurredOn >= from);
  if (to) rows = rows.filter((entry) => entry.occurredOn <= to);
  if (hasMissing) {
    const missingIds = new Set(missingReceipts(allEntries, activeReceiptEntryIds).map((entry) => entry.id));
    rows = rows.filter((entry) => missingIds.has(entry.id));
  }
  if (query.text) {
    const term = query.text.toLowerCase();
    rows = rows.filter((entry) =>
      entry.description.toLowerCase().includes(term)
      || entry.counterparty.toLowerCase().includes(term)
      || entry.orNumber.toLowerCase().includes(term),
    );
  }
  const running = new Map(runningBalance(allEntries).map(({ entry, balanceCentavos }) => [entry.id, balanceCentavos]));
  const eventById = new Map(eventRows.map((event) => [event.id, event]));
  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const activeReceipts = receiptRows.reduce<Record<string, number>>((counts, row) => {
    counts[row.entryId] = (counts[row.entryId] ?? 0) + 1;
    return counts;
  }, {});
  return NextResponse.json(rows.map((entry) => ({
    ...entry,
    event: entry.eventId ? eventById.get(entry.eventId) ?? null : null,
    account: accountById.get(entry.accountId) ?? null,
    runningBalanceCentavos: running.get(entry.id) ?? 0,
    receiptCount: activeReceipts[entry.id] ?? 0,
    missingReceipt: entry.kind === "expense" && !activeReceipts[entry.id],
  })));
}

export async function POST(request: Request) {
  const parsed = financeEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [account] = await db.select({ id: accounts.id }).from(accounts).where(and(
    eq(accounts.id, parsed.data.accountId),
    isNull(accounts.archivedAt),
    isNull(accounts.deletedAt),
  )).limit(1);
  if (!account) return NextResponse.json({ error: "Choose an active account." }, { status: 400 });
  if (parsed.data.eventId) {
    const [event] = await db.select({ id: events.id }).from(events).where(and(eq(events.id, parsed.data.eventId), isNull(events.deletedAt))).limit(1);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 400 });
  }
  const row = await insertLedgerEntry(db, {
    ...parsed.data,
    counterparty: parsed.data.counterparty,
    targetEntryId: null,
    replacesEntryId: null,
    reason: "",
  });
  return NextResponse.json(row, { status: 201 });
}

function methodNotAllowed(request: Request) {
  void request;
  return new NextResponse(null, { status: 405, headers: { Allow: "GET, POST" } });
}

export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
