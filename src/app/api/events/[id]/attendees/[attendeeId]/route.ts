import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { attendees } from "@/lib/db/schema";
import { eventByRef } from "@/lib/events/db-utils";
import { syncParticipantActual } from "@/lib/events/attendees";

type Context = { params: Promise<{ id: string; attendeeId: string }> };
const patchSchema = z.object({ checkedIn: z.boolean() });

export async function PATCH(request: Request, context: Context) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, attendeeId } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const currentTime = now();
  const [attendee] = await db.update(attendees).set({ checkedIn: parsed.data.checkedIn, updatedAt: currentTime })
    .where(and(eq(attendees.id, attendeeId), eq(attendees.eventId, event.id), isNull(attendees.deletedAt))).returning();
  if (!attendee) return NextResponse.json({ error: "Attendee not found." }, { status: 404 });
  await syncParticipantActual(db, event.id, currentTime);
  return NextResponse.json(attendee);
}

export async function DELETE(_request: Request, context: Context) {
  const { id, attendeeId } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const currentTime = now();
  const [attendee] = await db.update(attendees).set({ deletedAt: currentTime, updatedAt: currentTime })
    .where(and(eq(attendees.id, attendeeId), eq(attendees.eventId, event.id), isNull(attendees.deletedAt))).returning();
  if (!attendee) return NextResponse.json({ error: "Attendee not found." }, { status: 404 });
  await syncParticipantActual(db, event.id, currentTime);
  return NextResponse.json({ ok: true, id: attendee.id });
}
