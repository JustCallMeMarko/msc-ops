import { isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { captionTemplates } from "@/lib/db/schema";

const schema = z.object({ postType: z.string().min(1), name: z.string().trim().min(1).max(120), body: z.string().max(20_000) });
export async function GET() {
  const { db } = await getDb();
  return NextResponse.json(await db.select().from(captionTemplates).where(isNull(captionTemplates.deletedAt)).orderBy(captionTemplates.postType));
}
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [row] = await db.insert(captionTemplates).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
