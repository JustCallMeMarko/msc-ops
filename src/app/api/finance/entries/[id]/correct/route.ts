import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { ledgerEntries } from "@/lib/db/schema";
import { effectiveEntries } from "@/lib/finance/logic";
import { appendLedgerEntries } from "@/lib/finance/ledger";
import { financeCorrectionSchema } from "@/lib/finance/schemas";
import { now } from "@/lib/clock";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const parsed = financeCorrectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const { db } = await getDb();
  const rows = await db.select().from(ledgerEntries).orderBy(ledgerEntries.seq);
  const original = rows.find((entry) => entry.id === id);
  if (!original || !effectiveEntries(rows).some((entry) => entry.id === id)) {
    return NextResponse.json({ error: "Only an effective entry can be corrected." }, { status: 409 });
  }
  const { reason, ...replacement } = parsed.data;
  const mutationDate = now().toISOString().slice(0, 10);
  const [voidEntry, replacementEntry] = await appendLedgerEntries(db, [
    {
      accountId: original.accountId,
      eventId: original.eventId,
      kind: "void",
      category: original.category,
      amountCentavos: original.amountCentavos,
      occurredOn: mutationDate,
      counterparty: "",
      description: `Correction of ledger entry ${original.seq}`,
      orNumber: "",
      approvedByMemberId: null,
      targetEntryId: original.id,
      replacesEntryId: null,
      reason,
    },
    {
      ...replacement,
      kind: replacement.kind,
      counterparty: replacement.counterparty,
      reason,
      targetEntryId: null,
      replacesEntryId: original.id,
    },
  ]);
  return NextResponse.json({ voidEntry, replacementEntry }, { status: 201 });
}
