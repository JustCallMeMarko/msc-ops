import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { holidays } from "@/lib/db/schema";
import { holidayDateSchema } from "@/lib/holiday-validation";

type Context = { params: Promise<{ id: string }> };
const patchSchema = z.object({
  date: holidayDateSchema.optional(),
  name: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(["regular", "special"]).optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: Context) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const { db } = await getDb();
  const [row] = await db.update(holidays).set({ ...parsed.data, updatedAt: now() })
    .where(eq(holidays.id, id)).returning();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Holiday not found." }, { status: 404 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [row] = await db.delete(holidays).where(eq(holidays.id, id)).returning({ id: holidays.id });
  return row ? NextResponse.json({ ok: true, id: row.id }) : NextResponse.json({ error: "Holiday not found." }, { status: 404 });
}
