import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { hashtagSets } from "@/lib/db/schema";
const schema = z.object({ name: z.string().trim().min(1).max(120).optional(), tags: z.array(z.string().trim().min(1).max(100)).max(100).optional() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params; const { db } = await getDb();
  const [row] = await db.update(hashtagSets).set({ ...parsed.data, updatedAt: now() }).where(and(eq(hashtagSets.id, id), isNull(hashtagSets.deletedAt))).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Hashtag set not found." }, { status: 404 });
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const { db } = await getDb();
  const [row] = await db.update(hashtagSets).set({ deletedAt: now(), updatedAt: now() }).where(and(eq(hashtagSets.id, id), isNull(hashtagSets.deletedAt))).returning();
  return row ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Hashtag set not found." }, { status: 404 });
}
