import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { events } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const ref = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? eq(events.id, id) : eq(events.slug, id);
  const [event] = await db.update(events).set({ deletedAt: null, updatedAt: now() })
    .where(and(ref, isNotNull(events.deletedAt))).returning();
  return event ? NextResponse.json(event) : NextResponse.json({ error: "Deleted event not found." }, { status: 404 });
}
