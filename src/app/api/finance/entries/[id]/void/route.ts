import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { ledgerEntries } from "@/lib/db/schema";
import { effectiveEntries } from "@/lib/finance/logic";
import { insertLedgerEntry } from "@/lib/finance/ledger";
import { financeReasonSchema } from "@/lib/finance/schemas";
import { now } from "@/lib/clock";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const parsed = financeReasonSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const { db } = await getDb();
  const [entry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, id)).limit(1);
  if (!entry || !effectiveEntries(await db.select().from(ledgerEntries)).some((row) => row.id === id)) {
    return NextResponse.json({ error: "Only an effective income or expense can be voided." }, { status: 409 });
  }
  const voidEntry = await insertLedgerEntry(db, {
    accountId: entry.accountId,
    eventId: entry.eventId,
    kind: "void",
    category: entry.category,
    amountCentavos: entry.amountCentavos,
    occurredOn: now().toISOString().slice(0, 10),
    counterparty: "",
    description: `Void of ledger entry ${entry.seq}`,
    orNumber: "",
    approvedByMemberId: null,
    targetEntryId: entry.id,
    replacesEntryId: null,
    reason: parsed.data.reason,
  });
  return NextResponse.json(voidEntry, { status: 201 });
}
