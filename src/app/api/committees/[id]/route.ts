import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { committees } from "@/lib/db/schema";
import { readJson } from "@/lib/tasks/route-utils";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  color: z.enum(["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"]).optional(),
  description: z.string().max(2000).optional(),
  headMemberId: z.string().uuid().nullable().optional(),
  defaultCheckinDays: z.number().int().min(1).max(365).optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const { db } = await getDb();
    const [committee] = await db.update(committees)
      .set({ ...parsed.data, updatedAt: now() })
      .where(eq(committees.id, id))
      .returning();
    return committee ? NextResponse.json(committee) : NextResponse.json({ error: "Committee not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Could not update committee." }, { status: 409 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [committee] = await db.update(committees)
    .set({ deletedAt: now(), updatedAt: now() })
    .where(eq(committees.id, id))
    .returning({ id: committees.id });
  return committee ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Committee not found." }, { status: 404 });
}
