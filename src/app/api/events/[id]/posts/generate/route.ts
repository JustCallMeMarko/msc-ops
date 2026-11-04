import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { eventByRef } from "@/lib/events/db-utils";
import { generatePostsForEvent } from "@/lib/creatives/database";
import type { CreativeEvent } from "@/lib/creatives/logic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const created = await generatePostsForEvent(db, event as CreativeEvent);
  return NextResponse.json({ created: created.length, posts: created }, { status: 201 });
}
