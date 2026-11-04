import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { captionTemplates } from "@/lib/db/schema";
const schema = z.object({ postType: z.string().min(1).optional(), name: z.string().trim().min(1).max(120).optional(), body: z.string().max(20_000).optional() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params; const { db } = await getDb();
  const [row] = await db.update(captionTemplates).set({ ...parsed.data, updatedAt: now() })
    .where(and(eq(captionTemplates.id, id), isNull(captionTemplates.deletedAt))).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Template not found." }, { status: 404 });
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const { db } = await getDb();
  const [row] = await db.update(captionTemplates).set({ deletedAt: now(), updatedAt: now() })
    .where(and(eq(captionTemplates.id, id), isNull(captionTemplates.deletedAt))).returning();
  return row ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Template not found." }, { status: 404 });
}
