import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { ledgerEntries } from "@/lib/db/schema";
import { insertLedgerEntry } from "@/lib/finance/ledger";
import { financeReasonSchema } from "@/lib/finance/schemas";
import { now } from "@/lib/clock";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const parsed = financeReasonSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const { db } = await getDb();
  const rows = await db.select().from(ledgerEntries).orderBy(ledgerEntries.seq);
  const selected = rows.find((entry) => entry.id === id);
  const voidEntry = selected?.kind === "void"
    ? selected
    : rows.filter((entry) => entry.kind === "void" && entry.targetEntryId === id)
      .filter((entry) => !rows.some((candidate) => candidate.kind === "restore" && candidate.targetEntryId === entry.id))
      .at(-1);
  if (!voidEntry) return NextResponse.json({ error: "No active void to restore." }, { status: 409 });
  if (rows.some((entry) => entry.kind === "restore" && entry.targetEntryId === voidEntry.id)) {
    return NextResponse.json({ error: "This void has already been restored." }, { status: 409 });
  }
  const entry = rows.find((candidate) => candidate.id === voidEntry.targetEntryId);
  if (!entry) return NextResponse.json({ error: "Voided entry not found." }, { status: 404 });
  const restored = await insertLedgerEntry(db, {
    accountId: entry.accountId,
    eventId: entry.eventId,
    kind: "restore",
    category: entry.category,
    amountCentavos: entry.amountCentavos,
    occurredOn: now().toISOString().slice(0, 10),
    counterparty: "",
    description: `Restore of ledger entry ${entry.seq}`,
    orNumber: "",
    approvedByMemberId: null,
    targetEntryId: voidEntry.id,
    replacesEntryId: null,
    reason: parsed.data.reason,
  });
  return NextResponse.json(restored, { status: 201 });
}
