import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db/client";
import { attendees, events } from "@/lib/db/schema";

export async function syncParticipantActual(db: DrizzleDb, eventId: string, updatedAt: Date) {
  const checked = await db.select({ id: attendees.id }).from(attendees)
    .where(and(eq(attendees.eventId, eventId), eq(attendees.checkedIn, true), isNull(attendees.deletedAt)));
  await db.update(events).set({ participantActual: checked.length, updatedAt }).where(eq(events.id, eventId));
  return checked.length;
}
