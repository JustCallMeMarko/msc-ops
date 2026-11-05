import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { attendees } from "@/lib/db/schema";
import { eventByRef } from "@/lib/events/db-utils";
import { syncParticipantActual } from "@/lib/events/attendees";

type Context = { params: Promise<{ id: string }> };
const attendeeSchema = z.object({
  name: z.string().trim().max(300).default(""),
  email: z.string().trim().email().max(320).or(z.literal("")).default(""),
  checkedIn: z.boolean().default(false),
}).refine((value) => value.name.length > 0 || value.email.length > 0, "Add a name or email.");

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const search = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const rows = await db.select().from(attendees)
    .where(and(eq(attendees.eventId, event.id), isNull(attendees.deletedAt))).orderBy(asc(attendees.name));
  return NextResponse.json(rows.filter((row) => !search || `${row.name} ${row.email ?? ""}`.toLowerCase().includes(search)));
}

export async function POST(request: Request, context: Context) {
  const parsed = attendeeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const currentTime = now();
  const email = parsed.data.email || null;
  const [existing] = email
    ? await db.select().from(attendees).where(and(
      eq(attendees.eventId, event.id), sql`lower(${attendees.email}) = lower(${email})`, isNull(attendees.deletedAt),
    )).limit(1)
    : [];
  const [attendee] = existing
    ? await db.update(attendees).set({
      name: parsed.data.name, checkedIn: parsed.data.checkedIn, source: "manual", updatedAt: currentTime,
    }).where(eq(attendees.id, existing.id)).returning()
    : await db.insert(attendees).values({
      eventId: event.id, name: parsed.data.name, email, checkedIn: parsed.data.checkedIn, source: "manual",
    }).returning();
  await syncParticipantActual(db, event.id, currentTime);
  return NextResponse.json(attendee, { status: existing ? 200 : 201 });
}
