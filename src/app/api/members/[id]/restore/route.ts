import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { members } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [member] = await db.update(members)
    .set({ deletedAt: null, updatedAt: now() })
    .where(eq(members.id, id))
    .returning();
  return member ? NextResponse.json(member) : NextResponse.json({ error: "Member not found." }, { status: 404 });
}
