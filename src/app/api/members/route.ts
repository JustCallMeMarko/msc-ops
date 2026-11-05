import { isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { members } from "@/lib/db/schema";
import { readJson } from "@/lib/tasks/route-utils";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().max(120).default(""),
  committeeId: z.string().uuid().nullable().optional(),
  contact: z.string().max(500).default(""),
  email: z.string().email().max(254).nullable().optional(),
});

export async function GET(request: Request) {
  const committeeId = new URL(request.url).searchParams.get("committee");
  const { db } = await getDb();
  const rows = await db.select().from(members).where(isNull(members.deletedAt)).orderBy(members.name);
  return NextResponse.json(committeeId ? rows.filter((member) => member.committeeId === committeeId) : rows);
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [member] = await db.insert(members).values(parsed.data).returning();
  return NextResponse.json(member, { status: 201 });
}
