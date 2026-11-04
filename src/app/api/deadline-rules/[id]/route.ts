import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { deadlineRules } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };
const patchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  offsetDays: z.number().int().min(-3650).max(3650).optional(),
  dayType: z.enum(["calendar", "working"]).optional(),
  anchor: z.enum(["event_start", "event_end"]).optional(),
  source: z.string().trim().min(1).max(500).optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: Context) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const { db } = await getDb();
  const condition = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? eq(deadlineRules.id, id) : eq(deadlineRules.key, id);
  const [row] = await db.update(deadlineRules).set({ ...parsed.data, updatedAt: now() })
    .where(and(condition, isNull(deadlineRules.deletedAt))).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Deadline rule not found." }, { status: 404 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const condition = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? eq(deadlineRules.id, id) : eq(deadlineRules.key, id);
  const [row] = await db.delete(deadlineRules).where(and(condition, isNull(deadlineRules.deletedAt)))
    .returning({ id: deadlineRules.id });
  return row ? NextResponse.json({ ok: true, id: row.id }) : NextResponse.json({ error: "Deadline rule not found." }, { status: 404 });
}
