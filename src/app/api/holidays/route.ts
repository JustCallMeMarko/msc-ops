import { asc, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { holidays } from "@/lib/db/schema";
import { holidayDateSchema } from "@/lib/holiday-validation";

const holidaySchema = z.object({
  date: holidayDateSchema,
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["regular", "special"]),
});

export async function GET() {
  const { db } = await getDb();
  return NextResponse.json(await db.select().from(holidays).where(isNull(holidays.deletedAt)).orderBy(asc(holidays.date)));
}

export async function POST(request: Request) {
  const parsed = holidaySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [row] = await db.insert(holidays).values(parsed.data).onConflictDoNothing({ target: holidays.date }).returning();
  if (!row) return NextResponse.json({ error: "A holiday already exists on that date." }, { status: 409 });
  return NextResponse.json(row, { status: 201 });
}
