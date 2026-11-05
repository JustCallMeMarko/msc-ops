import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { liquidations } from "@/lib/db/schema";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { eventId } = await params;
  const { db } = await getDb();
  const [row] = await db.update(liquidations).set({ status: "approved", approvedAt: now(), updatedAt: now() })
    .where(and(eq(liquidations.eventId, eventId), eq(liquidations.status, "submitted"), isNull(liquidations.deletedAt))).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Submit the liquidation before SCOA approval." }, { status: 409 });
}
