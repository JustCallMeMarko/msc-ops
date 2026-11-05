import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { accounts, events } from "@/lib/db/schema";
import { appendLedgerEntries } from "@/lib/finance/ledger";
import { financeTransferSchema } from "@/lib/finance/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = financeTransferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.fromAccountId === parsed.data.toAccountId) {
    return NextResponse.json({ error: "Choose two different accounts." }, { status: 400 });
  }

  const { db } = await getDb();
  const activeAccounts = await db.select().from(accounts).where(and(
    inArray(accounts.id, [parsed.data.fromAccountId, parsed.data.toAccountId]),
    isNull(accounts.archivedAt),
    isNull(accounts.deletedAt),
  ));
  const fromAccount = activeAccounts.find((account) => account.id === parsed.data.fromAccountId);
  const toAccount = activeAccounts.find((account) => account.id === parsed.data.toAccountId);
  if (!fromAccount || !toAccount) return NextResponse.json({ error: "Choose two active accounts." }, { status: 400 });
  if (parsed.data.eventId) {
    const [event] = await db.select({ id: events.id }).from(events).where(and(
      eq(events.id, parsed.data.eventId),
      isNull(events.deletedAt),
    )).limit(1);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 400 });
  }

  const description = parsed.data.description.trim();
  const suffix = description ? ` — ${description}` : "";
  const entries = await appendLedgerEntries(db, [
    {
      accountId: fromAccount.id,
      eventId: parsed.data.eventId,
      kind: "transfer_out",
      category: "other",
      amountCentavos: parsed.data.amountCentavos,
      occurredOn: parsed.data.occurredOn,
      counterparty: "",
      description: `Transfer to ${toAccount.name}${suffix}`,
      orNumber: parsed.data.orNumber,
      approvedByMemberId: null,
      targetEntryId: null,
      replacesEntryId: null,
      reason: "",
    },
    {
      accountId: toAccount.id,
      eventId: parsed.data.eventId,
      kind: "transfer_in",
      category: "other",
      amountCentavos: parsed.data.amountCentavos,
      occurredOn: parsed.data.occurredOn,
      counterparty: "",
      description: `Transfer from ${fromAccount.name}${suffix}`,
      orNumber: parsed.data.orNumber,
      approvedByMemberId: null,
      targetEntryId: null,
      replacesEntryId: null,
      reason: "",
    },
  ]);
  return NextResponse.json({ entries }, { status: 201 });
}
