import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { attendees } from "@/lib/db/schema";
import { eventByRef } from "@/lib/events/db-utils";
import { syncParticipantActual } from "@/lib/events/attendees";

type Context = { params: Promise<{ id: string; attendeeId: string }> };

export async function POST(_request: Request, context: Context) {
  const { id, attendeeId } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const currentTime = now();
  const [attendee] = await db.update(attendees).set({ deletedAt: null, updatedAt: currentTime })
    .where(and(eq(attendees.id, attendeeId), eq(attendees.eventId, event.id), isNotNull(attendees.deletedAt))).returning();
  if (!attendee) return NextResponse.json({ error: "Deleted attendee not found." }, { status: 404 });
  await syncParticipantActual(db, event.id, currentTime);
  return NextResponse.json(attendee);
}
