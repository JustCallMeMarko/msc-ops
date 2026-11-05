import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { ledgerEntries } from "@/lib/db/schema";
import { getFinanceSnapshot } from "@/lib/finance/db-utils";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const snapshot = await getFinanceSnapshot();
  const event = snapshot.events.find((row) => row.id === id || row.slug === id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const { db } = await getDb();
  const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.eventId, event.id)).orderBy(ledgerEntries.seq);
  return NextResponse.json({
    event,
    entries: entries.filter((entry) => snapshot.effectiveEntries.some((row) => row.id === entry.id)),
    budgets: snapshot.budgets.filter((line) => line.eventId === event.id),
    totals: snapshot.eventTotals[event.id] ?? { eventId: event.id, incomeCentavos: 0, expenseCentavos: 0, netCentavos: 0 },
    liquidation: snapshot.liquidations.find((row) => row.eventId === event.id),
  });
}
