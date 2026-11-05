import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { files } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  originalName: z.string().trim().min(1).max(255).optional(),
  kind: z.enum(["manual", "cbl", "template", "generated", "receipt", "creative", "event_photo", "import", "other"]).optional(),
  source: z.enum(["sdao", "scoa", "org", "other"]).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  caption: z.string().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) {
    return NextResponse.json({ error: parsed.success ? "No changes provided." : parsed.error.flatten() }, { status: 400 });
  }
  const { db } = await getDb();
  const [row] = await db.update(files).set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(files.id, id), isNull(files.deletedAt))).returning();
  if (!row) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const currentTime = new Date();
  const [row] = await db.update(files).set({ deletedAt: currentTime, updatedAt: currentTime })
    .where(and(eq(files.id, id), isNull(files.deletedAt))).returning();
  if (!row) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}
