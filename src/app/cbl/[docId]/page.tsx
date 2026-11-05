import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { DocumentViewer } from "@/components/docs/viewer";
import type { DocData } from "@/components/docs/viewer";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { getDb } from "@/lib/db/client";
import { docChunks, docPages, documents } from "@/lib/db/schema";

export default async function CblDocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const { db } = await getDb();
  const [document] = await db.select().from(documents).where(and(eq(documents.id, docId), isNull(documents.deletedAt))).limit(1);
  if (!document) notFound();

  const pages = await db.select().from(docPages).where(eq(docPages.documentId, docId)).orderBy(asc(docPages.page));
  const chunks = await db.select().from(docChunks).where(eq(docChunks.documentId, docId)).orderBy(asc(docChunks.ord));
  return <WorkspaceShell breadcrumbLabel={document.title}><DocumentViewer key={document.id} initialData={{ document, pages, chunks } as DocData} /></WorkspaceShell>;
}
