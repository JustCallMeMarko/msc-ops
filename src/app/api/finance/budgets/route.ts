import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { budgetLines } from "@/lib/db/schema";
import { budgetLineSchema } from "@/lib/finance/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("event");
  const { db } = await getDb();
  const rows = await db.select().from(budgetLines).where(and(
    isNull(budgetLines.deletedAt),
    ...(eventId ? [eq(budgetLines.eventId, eventId)] : []),
  )).orderBy(budgetLines.eventId, budgetLines.category);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const parsed = budgetLineSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [row] = await db.insert(budgetLines).values(parsed.data).onConflictDoUpdate({
    target: [budgetLines.eventId, budgetLines.category],
    set: { plannedCentavos: parsed.data.plannedCentavos, note: parsed.data.note, updatedAt: now(), deletedAt: null },
  }).returning();
  return NextResponse.json(row, { status: 201 });
}
