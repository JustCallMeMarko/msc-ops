import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { docChunks, docPages, documents, fileLinks, files, jobs } from "@/lib/db/schema";

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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await getDb();
  const deletedAt = new Date();
  const result = await db.transaction(async (tx) => {
    const [document] = await tx.update(documents).set({ deletedAt, active: false, updatedAt: deletedAt })
      .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
      .returning({ fileId: documents.fileId });
    if (!document) return null;

    const cancelledJobs = await tx.update(jobs).set({ cancelRequested: true, updatedAt: deletedAt })
      .where(and(eq(jobs.refId, id), inArray(jobs.status, ["queued", "running"])))
      .returning({ id: jobs.id });
    const [remainingDocument] = await tx.select({ id: documents.id }).from(documents)
      .where(and(eq(documents.fileId, document.fileId), isNull(documents.deletedAt))).limit(1);
    const [remainingLink] = await tx.select({ id: fileLinks.id }).from(fileLinks)
      .where(and(eq(fileLinks.fileId, document.fileId), isNull(fileLinks.deletedAt))).limit(1);
    let fileDeleted = false;
    if (!remainingDocument && !remainingLink) {
      const [file] = await tx.update(files).set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(files.id, document.fileId), isNull(files.deletedAt)))
        .returning({ id: files.id });
      fileDeleted = Boolean(file);
    }
    return { fileId: document.fileId, fileDeleted, cancelRequestedJobIds: cancelledJobs.map((job) => job.id) };
  });
  if (!result) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return NextResponse.json({ ok: true, id, ...result });
}
