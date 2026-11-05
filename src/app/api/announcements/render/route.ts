import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { announcementTemplates } from "@/lib/db/schema";
import { eventByRef } from "@/lib/events/db-utils";
import { announcementGuard, renderAnnouncement, type EventRecord } from "@/lib/events/logic";

const schema = z.object({
  eventId: z.string().min(1),
  templateKey: z.string().min(1).max(80),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const event = await eventByRef(db, parsed.data.eventId);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const [template] = await db.select().from(announcementTemplates)
    .where(and(eq(announcementTemplates.key, parsed.data.templateKey), isNull(announcementTemplates.deletedAt))).limit(1);
  if (!template) return NextResponse.json({ error: "Announcement template not found." }, { status: 404 });
  return NextResponse.json({
    text: renderAnnouncement(template, event as EventRecord),
    ...announcementGuard(event as EventRecord, template.key),
    template,
  });
}
