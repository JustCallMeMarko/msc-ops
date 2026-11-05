import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { enqueueDocumentJob } from "@/lib/docs/job-queue";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const database = await getDb();
  const [document] = await database.db.select().from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt))).limit(1);
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  await database.db.update(documents).set({ status: "queued", error: null, progress: 0, updatedAt: new Date() }).where(eq(documents.id, id));
  const job = await enqueueDocumentJob(database, id);
  return NextResponse.json({ job }, { status: 202 });
}
