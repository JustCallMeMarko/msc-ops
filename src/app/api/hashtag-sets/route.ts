import { isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { hashtagSets } from "@/lib/db/schema";
const schema = z.object({ name: z.string().trim().min(1).max(120), tags: z.array(z.string().trim().min(1).max(100)).max(100) });
export async function GET() { const { db } = await getDb(); return NextResponse.json(await db.select().from(hashtagSets).where(isNull(hashtagSets.deletedAt))); }
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb(); const [row] = await db.insert(hashtagSets).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
