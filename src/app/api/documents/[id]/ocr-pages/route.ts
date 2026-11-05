import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { docPages, documents } from "@/lib/db/schema";
import { enqueueDocumentJob } from "@/lib/docs/job-queue";

const pageSchema = z.object({
  page: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  items: z.array(z.object({
    str: z.string(),
    transform: z.array(z.number()),
    width: z.number(),
    height: z.number(),
    hasEOL: z.boolean().optional(),
  })),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z.object({ pages: z.array(pageSchema).min(1) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid OCR page data." }, { status: 400 });
  const { db } = await getDb();
  const [document] = await db.select().from(documents).where(and(eq(documents.id, id), isNull(documents.deletedAt))).limit(1);
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  for (const page of parsed.data.pages) {
    const charCount = page.items.reduce((count, item) => count + item.str.length, 0);
    await db.insert(docPages).values({
      documentId: id,
      page: page.page,
      width: Math.ceil(page.width),
      height: Math.ceil(page.height),
      items: page.items,
      charCount,
      ocr: true,
    }).onConflictDoUpdate({
      target: [docPages.documentId, docPages.page],
      set: { width: Math.ceil(page.width), height: Math.ceil(page.height), items: page.items, charCount, ocr: true },
    });
  }
  await db.update(documents).set({ status: "chunking", ocr: true, updatedAt: new Date() }).where(eq(documents.id, id));
  const job = await enqueueDocumentJob(await getDb(), id, "chunk");
  return NextResponse.json({ job }, { status: 202 });
}
