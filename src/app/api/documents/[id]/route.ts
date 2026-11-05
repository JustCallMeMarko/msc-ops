import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { docChunks, docPages, documents, files } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await getDb();
  const [document] = await db.select().from(documents).where(and(eq(documents.id, id), isNull(documents.deletedAt))).limit(1);
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const [file] = await db.select({ id: files.id, originalName: files.originalName, mime: files.mime }).from(files).where(eq(files.id, document.fileId)).limit(1);
  const pages = await db.select().from(docPages).where(eq(docPages.documentId, id)).orderBy(asc(docPages.page));
  const chunks = await db.select().from(docChunks).where(eq(docChunks.documentId, id)).orderBy(asc(docChunks.ord));
  return NextResponse.json({ document, file, pages, chunks });
}
