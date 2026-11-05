import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await getDb();
  const [job] = await db.update(jobs).set({ cancelRequested: true, updatedAt: new Date() })
    .where(and(eq(jobs.id, id), inArray(jobs.status, ["queued", "running"])))
    .returning();
  if (!job) return NextResponse.json({ error: "Job not found or already finished." }, { status: 404 });
  return NextResponse.json({ job });
}
