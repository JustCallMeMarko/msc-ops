import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { liquidationItems, liquidations } from "@/lib/db/schema";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { eventId } = await params;
  const { db } = await getDb();
  const [row] = await db.select().from(liquidations).where(and(
    eq(liquidations.eventId, eventId), isNull(liquidations.deletedAt),
  )).limit(1);
  if (!row) return NextResponse.json({ error: "Liquidation not found." }, { status: 404 });
  await db.delete(liquidationItems).where(eq(liquidationItems.liquidationId, row.id));
  const [updated] = await db.update(liquidations).set({
    status: "open", submittedAt: null, approvedAt: null, updatedAt: now(),
  }).where(eq(liquidations.id, row.id)).returning();
  return NextResponse.json(updated);
}
