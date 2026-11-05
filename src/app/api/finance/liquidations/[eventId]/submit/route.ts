import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { ledgerEntries, liquidationItems, liquidations } from "@/lib/db/schema";
import { effectiveEntries } from "@/lib/finance/logic";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { eventId } = await params;
  const { db } = await getDb();
  const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.eventId, eventId));
  const effective = effectiveEntries(entries).filter((entry) => entry.kind === "expense");
  const [liquidation] = await db.insert(liquidations).values({
    eventId, status: "submitted", submittedAt: now(), approvedAt: null,
  }).onConflictDoUpdate({
    target: liquidations.eventId,
    set: { status: "submitted", submittedAt: now(), approvedAt: null, updatedAt: now(), deletedAt: null },
  }).returning();
  await db.delete(liquidationItems).where(eq(liquidationItems.liquidationId, liquidation.id));
  if (effective.length) {
    await db.insert(liquidationItems).values(effective.map((entry) => ({ liquidationId: liquidation.id, entryId: entry.id })));
  }
  return NextResponse.json({ ...liquidation, entryIds: effective.map((entry) => entry.id) });
}
