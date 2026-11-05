import { isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { postingRules } from "@/lib/db/schema";
const schema = z.object({ key: z.string().trim().min(1).max(100), postType: z.string().min(1), label: z.string().trim().min(1).max(200), offsetDays: z.number().int().min(-365).max(365), anchor: z.enum(["event_start", "event_end"]), enabled: z.boolean().default(true) });
export async function GET() { const { db } = await getDb(); return NextResponse.json(await db.select().from(postingRules).where(isNull(postingRules.deletedAt)).orderBy(postingRules.offsetDays)); }
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb(); const [row] = await db.insert(postingRules).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
