import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { embedMany } from "ai";
import type { Database } from "@/lib/db/client";
import { chunkEmbeddings, docChunks, docPages, documents, files, jobs, providers } from "@/lib/db/schema";
import { getEmbeddingModel } from "@/lib/ai/providers";
import { getDataDir } from "@/lib/data-dir";
import { readFileBlob } from "@/lib/files/storage";
import { getSetting } from "@/lib/settings";
import { chunkPages, type PageItems } from "./chunker";
import { extractPdf, type ExtractedPage } from "./extract";

type QueueState = { active: boolean; pending: string[] };
const queueGlobal = globalThis as typeof globalThis & { __docQueue?: QueueState; __docDb?: Database };
const state = queueGlobal.__docQueue ??= { active: false, pending: [] };

class JobCancelledError extends Error {}

async function updateProgress(db: Database["db"], jobId: string, documentId: string, progress: number) {
  await db.update(jobs).set({ progress, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  await db.update(documents).set({ progress, updatedAt: new Date() }).where(eq(documents.id, documentId));
}

async function cancelled(db: Database["db"], jobId: string): Promise<boolean> {
  const [job] = await db.select({ cancelRequested: jobs.cancelRequested }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return !job || job.cancelRequested;
}

async function savePages(db: Database["db"], documentId: string, pages: ExtractedPage[]) {
  for (const page of pages) {
    await db.insert(docPages).values({
      documentId,
      page: page.page,
      width: Math.ceil(page.width),
      height: Math.ceil(page.height),
      items: page.items,
      charCount: page.charCount,
      ocr: page.ocr,
    }).onConflictDoUpdate({
      target: [docPages.documentId, docPages.page],
      set: { width: Math.ceil(page.width), height: Math.ceil(page.height), items: page.items, charCount: page.charCount, ocr: page.ocr },
    });
  }
}

async function makeChunks(database: Database, documentId: string, pageCount: number, jobId: string) {
  const { db } = database;
  const rows = await db.select().from(docPages).where(eq(docPages.documentId, documentId)).orderBy(asc(docPages.page));
  const chunks = chunkPages(rows.map((row) => ({ page: row.page, items: row.items as PageItems["items"] })));
  await db.delete(docChunks).where(eq(docChunks.documentId, documentId));
  for (let offset = 0; offset < chunks.length; offset += 50) {
    if (await cancelled(db, jobId)) throw new JobCancelledError();
    const batch = chunks.slice(offset, offset + 50);
    await db.insert(docChunks).values(batch.map((chunk) => ({
      documentId,
      ord: chunk.ord,
      headingPath: chunk.headingPath,
      text: chunk.text,
      segments: chunk.segments,
    })));
    await updateProgress(db, jobId, documentId, 80 + Math.floor(((offset + batch.length) / Math.max(1, chunks.length)) * 15));
  }
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  const ocr = rows.some((row) => row.ocr);
  const defaults = await getSetting("ai.defaults");
  const hasEmbedding = Boolean(defaults.embedding);
  await db.update(documents).set({
    pageCount, status: hasEmbedding ? "embedding" : "ready", progress: hasEmbedding ? 95 : 100,
    ocr, error: null, updatedAt: new Date(),
  }).where(eq(documents.id, documentId));
  if (document) await db.update(jobs).set({ status: "ready", progress: 100, finishedAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, jobId));
  if (hasEmbedding) await enqueueDocumentJob(database, documentId, "embed");
}

async function embedDocument(database: Database, documentId: string, jobId: string) {
  const { db } = database;
  const defaults = await getSetting("ai.defaults");
  if (!defaults.embedding) {
    await db.update(documents).set({ status: "ready", progress: 100, updatedAt: new Date() }).where(eq(documents.id, documentId));
    await db.update(jobs).set({ status: "ready", progress: 100, finishedAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, jobId));
    return;
  }
  const [provider] = await db.select().from(providers)
    .where(and(eq(providers.id, defaults.embedding.providerId), isNull(providers.deletedAt))).limit(1);
  if (!provider) throw new Error("The configured embedding provider is unavailable.");
  const modelKey = `${provider.type}:${defaults.embedding.model}`;
  const model = await getEmbeddingModel(provider.id, defaults.embedding.model);
  const chunks = await db.select({ id: docChunks.id, text: docChunks.text })
    .from(docChunks).where(eq(docChunks.documentId, documentId)).orderBy(asc(docChunks.ord));
  if (chunks.length) {
    await db.delete(chunkEmbeddings).where(and(
      eq(chunkEmbeddings.modelKey, modelKey),
      inArray(chunkEmbeddings.chunkId, chunks.map((chunk) => chunk.id)),
    ));
  }
  await db.update(documents).set({ status: "embedding", progress: 0, error: null, updatedAt: new Date() }).where(eq(documents.id, documentId));
  for (let offset = 0; offset < chunks.length; offset += 32) {
    if (await cancelled(db, jobId)) throw new JobCancelledError();
    const batch = chunks.slice(offset, offset + 32);
    const { embeddings } = await embedMany({ model, values: batch.map((chunk) => chunk.text) });
    await db.insert(chunkEmbeddings).values(batch.map((chunk, index) => ({
      chunkId: chunk.id,
      modelKey,
      dims: embeddings[index]!.length,
      embedding: `[${embeddings[index]!.join(",")}]`,
    })));
    const progress = Math.floor(((offset + batch.length) / Math.max(1, chunks.length)) * 100);
    await updateProgress(db, jobId, documentId, progress);
  }
  await db.update(documents).set({ status: "ready", progress: 100, error: null, updatedAt: new Date() }).where(eq(documents.id, documentId));
  await db.update(jobs).set({ status: "ready", progress: 100, finishedAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, jobId));
}

async function process(jobId: string, database: Database) {
  const { db } = database;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return;
  const [document] = await db.select().from(documents).where(eq(documents.id, job.refId)).limit(1);
  if (!document) throw new Error("Document not found.");
  const [file] = await db.select().from(files).where(and(eq(files.id, document.fileId), isNull(files.deletedAt))).limit(1);
  if (!file) throw new Error("Source PDF is no longer available.");
  const bytes = await readFileBlob(await getDataDir(), file.sha256);
  await db.update(jobs).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, jobId));
  if (job.kind === "embed") {
    await embedDocument(database, document.id, jobId);
    return;
  }
  if (job.kind === "chunk") {
    await makeChunks(database, document.id, document.pageCount, jobId);
    return;
  }
  await db.update(documents).set({ status: "extracting", error: null, ocr: false, updatedAt: new Date() }).where(eq(documents.id, document.id));
  let pageCount = 0;
  const extracted = await extractPdf(bytes, async (page, count, pageData) => {
    pageCount = count;
    if (await cancelled(db, jobId)) throw new JobCancelledError();
    await savePages(db, document.id, [pageData]);
    await updateProgress(db, jobId, document.id, Math.floor(page / count * 70));
  });
  await db.update(documents).set({ pageCount: extracted.pageCount, status: extracted.needsOcr.length ? "needs_ocr" : "chunking", progress: 75 }).where(eq(documents.id, document.id));
  if (extracted.needsOcr.length) {
    await db.update(jobs).set({ status: "ready", progress: 75, finishedAt: new Date() }).where(eq(jobs.id, jobId));
    return;
  }
  if (await cancelled(db, jobId)) throw new JobCancelledError();
  await updateProgress(db, jobId, document.id, 80);
  await makeChunks(database, document.id, pageCount, jobId);
}

async function pump() {
  if (state.active || !queueGlobal.__docDb) return;
  const db = queueGlobal.__docDb;
  state.active = true;
  try {
    while (state.pending.length) {
      const jobId = state.pending.shift()!;
      try {
        await process(jobId, db);
      } catch (error) {
        const [job] = await db.db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
        if (!job) continue;
        const message = error instanceof Error ? error.message : "Document processing failed.";
        if (error instanceof JobCancelledError || job.cancelRequested) {
          await db.db.update(documents).set({ status: "cancelled", updatedAt: new Date() }).where(eq(documents.id, job.refId));
          await db.db.update(jobs).set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, jobId));
        } else {
          await db.db.update(documents).set({ status: "error", error: message, updatedAt: new Date() }).where(eq(documents.id, job.refId));
          await db.db.update(jobs).set({ status: "error", error: message, finishedAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, jobId));
        }
      }
    }
  } finally {
    state.active = false;
    if (state.pending.length) void pump();
  }
}

export async function enqueueDocumentJob(database: Database, documentId: string, kind: "extract" | "chunk" | "embed" = "extract") {
  queueGlobal.__docDb = database;
  const { db } = database;
  const [job] = await db.insert(jobs).values({ kind, refId: documentId, status: "queued" }).returning();
  if (!job) throw new Error("Could not queue document processing.");
  state.pending.push(job.id);
  void pump();
  return job;
}

export async function resumeDocumentJobs(database: Database) {
  queueGlobal.__docDb = database;
  const { db } = database;
  const rows = await db.select({ id: jobs.id }).from(jobs).where(or(eq(jobs.status, "queued"), eq(jobs.status, "running"))).orderBy(asc(jobs.createdAt));
  for (const row of rows) state.pending.push(row.id);
  void pump();
}
