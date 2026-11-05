import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { financeAccountSchema } from "@/lib/finance/schemas";
import { now } from "@/lib/clock";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Expected account fields." }, { status: 400 });
  const { expectedUpdatedAt, ...fields } = body;
  const parsed = financeAccountSchema.partial().safeParse(fields);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [current] = await db.select().from(accounts).where(and(eq(accounts.id, id), isNull(accounts.deletedAt))).limit(1);
  if (!current) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (expectedUpdatedAt && new Date(String(expectedUpdatedAt)).getTime() !== current.updatedAt.getTime()) {
    return NextResponse.json({ error: "Changed elsewhere — reload." }, { status: 409 });
  }
  const [updated] = await db.update(accounts).set({
    ...parsed.data,
    ...(parsed.data.openedAt !== undefined ? { openedAt: parsed.data.openedAt } : {}),
    updatedAt: now(),
  }).where(and(eq(accounts.id, id), eq(accounts.updatedAt, current.updatedAt))).returning();
  if (!updated) return NextResponse.json({ error: "Changed elsewhere — reload." }, { status: 409 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const { db } = await getDb();
  const [updated] = await db.update(accounts).set({ archivedAt: now(), updatedAt: now() })
    .where(and(eq(accounts.id, id), isNull(accounts.archivedAt), isNull(accounts.deletedAt))).returning();
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Account not found." }, { status: 404 });
}
