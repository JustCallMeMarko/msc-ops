import { asc, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { deadlineRules } from "@/lib/db/schema";

const ruleSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,79}$/),
  label: z.string().trim().min(1).max(200),
  offsetDays: z.number().int().min(-3650).max(3650),
  dayType: z.enum(["calendar", "working"]),
  anchor: z.enum(["event_start", "event_end"]),
  source: z.string().trim().min(1).max(500),
});

export async function GET() {
  const { db } = await getDb();
  const rows = await db.select().from(deadlineRules).where(isNull(deadlineRules.deletedAt)).orderBy(asc(deadlineRules.offsetDays));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const parsed = ruleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [row] = await db.insert(deadlineRules).values(parsed.data).onConflictDoNothing({ target: deadlineRules.key }).returning();
  if (!row) return NextResponse.json({ error: "A deadline rule with that key already exists." }, { status: 409 });
  return NextResponse.json(row, { status: 201 });
}
