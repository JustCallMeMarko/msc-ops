import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { templates } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = z.object({ action: z.enum(["confirm", "new"]) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [template] = await db.select().from(templates)
    .where(and(eq(templates.id, id), isNull(templates.deletedAt))).limit(1);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  if (parsed.data.action === "new") {
    const [updated] = await db.update(templates).set({
      lineageId: uuidv7(),
      previousTemplateId: null,
      version: 1,
      active: true,
      updatedAt: new Date(),
    }).where(eq(templates.id, id)).returning();
    return NextResponse.json({ template: updated, action: "new" });
  }
  if (!template.previousTemplateId) return NextResponse.json({ error: "This template has no version to replace." }, { status: 409 });
  if (!template.mappingConfirmedAt) return NextResponse.json({ error: "Confirm the new template mapping before replacing the active version." }, { status: 409 });
  await db.update(templates).set({ active: false, updatedAt: new Date() })
    .where(and(eq(templates.id, template.previousTemplateId), isNull(templates.deletedAt)));
  const [updated] = await db.update(templates).set({ active: true, updatedAt: new Date() })
    .where(eq(templates.id, id)).returning();
  return NextResponse.json({ template: updated, action: "confirm" });
}
