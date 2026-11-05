import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { members } from "@/lib/db/schema";
import { readJson } from "@/lib/tasks/route-utils";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.string().max(120).optional(),
  committeeId: z.string().uuid().nullable().optional(),
  contact: z.string().max(500).optional(),
  email: z.string().email().max(254).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [member] = await db.update(members)
    .set({ ...parsed.data, updatedAt: now() })
    .where(eq(members.id, id))
    .returning();
  return member ? NextResponse.json(member) : NextResponse.json({ error: "Member not found." }, { status: 404 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [member] = await db.update(members)
    .set({ deletedAt: now(), updatedAt: now() })
    .where(eq(members.id, id))
    .returning({ id: members.id });
  return member ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Member not found." }, { status: 404 });
}
