import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { budgetLines } from "@/lib/db/schema";
import { budgetLineSchema } from "@/lib/finance/schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Expected budget fields." }, { status: 400 });
  const { expectedUpdatedAt, ...fields } = body;
  const parsed = budgetLineSchema.partial().safeParse(fields);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [current] = await db.select().from(budgetLines).where(and(eq(budgetLines.id, id), isNull(budgetLines.deletedAt))).limit(1);
  if (!current) return NextResponse.json({ error: "Budget line not found." }, { status: 404 });
  if (expectedUpdatedAt && new Date(String(expectedUpdatedAt)).getTime() !== current.updatedAt.getTime()) {
    return NextResponse.json({ error: "Changed elsewhere — reload." }, { status: 409 });
  }
  const [row] = await db.update(budgetLines).set({ ...parsed.data, updatedAt: now() })
    .where(and(eq(budgetLines.id, id), eq(budgetLines.updatedAt, current.updatedAt))).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Changed elsewhere — reload." }, { status: 409 });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const { db } = await getDb();
  const [row] = await db.update(budgetLines).set({ deletedAt: now(), updatedAt: now() })
    .where(and(eq(budgetLines.id, id), isNull(budgetLines.deletedAt))).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Budget line not found." }, { status: 404 });
}
