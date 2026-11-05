import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { postingRules } from "@/lib/db/schema";
const schema = z.object({ key: z.string().trim().min(1).max(100).optional(), postType: z.string().min(1).optional(), label: z.string().trim().min(1).max(200).optional(), offsetDays: z.number().int().min(-365).max(365).optional(), anchor: z.enum(["event_start", "event_end"]).optional(), enabled: z.boolean().optional() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params; const { db } = await getDb();
  const [row] = await db.update(postingRules).set({ ...parsed.data, updatedAt: now() }).where(and(eq(postingRules.id, id), isNull(postingRules.deletedAt))).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Posting rule not found." }, { status: 404 });
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const { db } = await getDb();
  const [row] = await db.update(postingRules).set({ deletedAt: now(), updatedAt: now() }).where(and(eq(postingRules.id, id), isNull(postingRules.deletedAt))).returning();
  return row ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Posting rule not found." }, { status: 404 });
}
