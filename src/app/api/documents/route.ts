import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { chunkEmbeddings, docChunks, documents, files, jobs, providers } from "@/lib/db/schema";
import { enqueueDocumentJob } from "@/lib/docs/job-queue";
import { MAX_PDF_BYTES } from "@/lib/docs/extract";
import { storeFileBlob } from "@/lib/files/storage";
import { FileValidationError, validateFileContent } from "@/lib/files/validation";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = await getDb();
  const rows = await db.select().from(documents).where(isNull(documents.deletedAt)).orderBy(desc(documents.createdAt));
  const defaults = await getSetting("ai.defaults");
  const [embeddingProvider] = defaults.embedding
    ? await db.select().from(providers).where(and(eq(providers.id, defaults.embedding.providerId), isNull(providers.deletedAt))).limit(1)
    : [];
  const activeModelKey = embeddingProvider && defaults.embedding ? `${embeddingProvider.type}:${defaults.embedding.model}` : null;
  const chunkRows = rows.length
    ? await db.select({ documentId: docChunks.documentId, chunkId: docChunks.id }).from(docChunks).where(inArray(docChunks.documentId, rows.map((row) => row.id)))
    : [];
  const embeddings = activeModelKey && chunkRows.length
    ? await db.select({ chunkId: chunkEmbeddings.chunkId }).from(chunkEmbeddings)
      .where(and(eq(chunkEmbeddings.modelKey, activeModelKey), inArray(chunkEmbeddings.chunkId, chunkRows.map((row) => row.chunkId))))
    : [];
  const indexedChunks = new Set(embeddings.map((row) => row.chunkId));
  const chunksByDocument = new Map<string, { total: number; indexed: number }>();
  for (const chunk of chunkRows) {
    const counts = chunksByDocument.get(chunk.documentId) ?? { total: 0, indexed: 0 };
    counts.total += 1;
    if (indexedChunks.has(chunk.chunkId)) counts.indexed += 1;
    chunksByDocument.set(chunk.documentId, counts);
  }
  const latestJobs = await Promise.all(rows.map(async (document) => {
    const [job] = await db.select().from(jobs).where(eq(jobs.refId, document.id)).orderBy(desc(jobs.createdAt)).limit(1);
    return [document.id, job] as const;
  }));
  const jobByDocument = new Map(latestJobs);
  return NextResponse.json({ documents: rows.map((document) => {
    const counts = chunksByDocument.get(document.id) ?? { total: 0, indexed: 0 };
    return {
      ...document,
      job: jobByDocument.get(document.id) ?? null,
      indexedModel: activeModelKey && counts.total > 0 && counts.indexed === counts.total ? activeModelKey : null,
      keywordOnly: !activeModelKey || counts.indexed < counts.total,
    };
  }) });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  const title = form.get("title");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF to upload." }, { status: 400 });
  if (typeof kind !== "string" || !["cbl", "rso_manual", "reference"].includes(kind)) return NextResponse.json({ error: "Choose a document kind." }, { status: 400 });
  const documentKind = kind as "cbl" | "rso_manual" | "reference";
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "PDF files must be 50 MB or smaller." }, { status: 413 });
  let validated: { bytes: Uint8Array; mime: string };
  try {
    validated = await validateFileContent(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (error) {
    const message = error instanceof FileValidationError ? error.message : "Could not validate PDF content.";
    return NextResponse.json({ error: message }, { status: 415 });
  }
  if (validated.mime !== "application/pdf") return NextResponse.json({ error: "Only PDF documents can be added to the library." }, { status: 415 });
  const dataDir = await getDataDir();
  const sha256 = await storeFileBlob(dataDir, validated.bytes);
  const { db } = await getDb();
  const [existingFile] = await db.select().from(files).where(and(eq(files.sha256, sha256), isNull(files.deletedAt))).limit(1);
  if (existingFile) {
    const [existingDocument] = await db.select().from(documents).where(and(eq(documents.fileId, existingFile.id), isNull(documents.deletedAt))).limit(1);
    if (existingDocument) return NextResponse.json({ error: "Already in library", document: existingDocument, href: `/cbl/${existingDocument.id}` }, { status: 409 });
  }

  const [activeVersion] = documentKind === "cbl"
    ? await db.select().from(documents).where(and(eq(documents.kind, "cbl"), eq(documents.active, true), isNull(documents.deletedAt))).orderBy(desc(documents.version)).limit(1)
    : [];
  const asNewVersion = documentKind === "cbl" && Boolean(activeVersion) && form.get("newVersion") !== "false";
  const documentId = uuidv7();
  const lineageId = asNewVersion ? activeVersion!.lineageId : documentId;
  let fileRow = existingFile;
  if (!fileRow) {
    [fileRow] = await db.insert(files).values({
      sha256,
      originalName: file.name.slice(0, 255),
      mime: validated.mime,
      size: validated.bytes.byteLength,
      kind: documentKind === "cbl" ? "cbl" : "manual",
      source: null,
    }).returning();
  }
  if (!fileRow) return NextResponse.json({ error: "Could not save the uploaded file." }, { status: 500 });

  const document = await db.transaction(async (tx) => {
    if (asNewVersion && activeVersion) {
      await tx.update(documents).set({ active: false, updatedAt: new Date() }).where(eq(documents.id, activeVersion.id));
    }
    const [created] = await tx.insert(documents).values({
      id: documentId,
      fileId: fileRow.id,
      lineageId,
      title: (typeof title === "string" && title.trim() ? title.trim() : file.name.replace(/\.pdf$/i, "")).slice(0, 200),
      kind: documentKind,
      version: asNewVersion && activeVersion ? activeVersion.version + 1 : 1,
      previousDocumentId: asNewVersion ? activeVersion!.id : null,
      active: true,
      status: "queued",
    }).returning();
    return created;
  });
  const job = await enqueueDocumentJob(await getDb(), document.id);
  return NextResponse.json({ document, job }, { status: 201 });
}
