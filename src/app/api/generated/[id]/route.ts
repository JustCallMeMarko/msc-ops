import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { files, generatedDocs } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [generated] = await db.select().from(generatedDocs).where(and(
    eq(generatedDocs.id, id),
    isNull(generatedDocs.deletedAt),
  )).limit(1);
  if (!generated) return NextResponse.json({ error: "Generated document not found." }, { status: 404 });
  const deletedAt = new Date();
  await db.update(generatedDocs).set({ deletedAt, updatedAt: deletedAt }).where(eq(generatedDocs.id, id));
  await db.update(files).set({ deletedAt, updatedAt: deletedAt })
    .where(and(eq(files.id, generated.fileId), isNull(files.deletedAt)));
  return NextResponse.json({ deleted: true, generatedDocId: id, fileId: generated.fileId });
}
