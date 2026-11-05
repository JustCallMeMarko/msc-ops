import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { committees } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [committee] = await db.update(committees)
    .set({ deletedAt: null, updatedAt: now() })
    .where(eq(committees.id, id))
    .returning();
  return committee ? NextResponse.json(committee) : NextResponse.json({ error: "Committee not found." }, { status: 404 });
}
