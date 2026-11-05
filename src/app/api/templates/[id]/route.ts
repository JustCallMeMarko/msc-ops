import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { files, templates } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [template] = await db.select().from(templates)
    .where(and(eq(templates.id, id), isNull(templates.deletedAt))).limit(1);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  if (template.source === "builtin") {
    return NextResponse.json({ error: "Built-in templates cannot be deleted." }, { status: 409 });
  }
  const deletedAt = new Date();
  await db.update(templates).set({ active: false, deletedAt, updatedAt: deletedAt }).where(eq(templates.id, id));
  await db.update(files).set({ deletedAt, updatedAt: deletedAt })
    .where(and(eq(files.id, template.fileId), isNull(files.deletedAt)));
  return NextResponse.json({ deleted: true, templateId: id, fileId: template.fileId });
}
