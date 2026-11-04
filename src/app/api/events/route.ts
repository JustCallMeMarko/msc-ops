import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { checklistItems, events } from "@/lib/db/schema";
import { generateChecklist, type EventRecord } from "@/lib/events/logic";
import { eventHolidays, eventRules } from "@/lib/events/db-utils";
import { lumaUrlSchema } from "@/lib/events/validation";
import { getSetting } from "@/lib/settings";
import { generatePostsForEvent } from "@/lib/creatives/database";
import type { CreativeEvent } from "@/lib/creatives/logic";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(["on_campus", "off_campus", "online", "booth"]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  venue: z.string().max(500).default(""),
  description: z.string().max(50_000).default(""),
  lumaUrl: lumaUrlSchema,
  participantTarget: z.number().int().min(0).max(1_000_000).default(0),
  participantActual: z.number().int().min(0).max(1_000_000).default(0),
  approvalStatus: z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]).default("draft"),
  hasFees: z.boolean().default(false),
  hasExternalGuests: z.boolean().default(false),
  isMajor: z.boolean().default(false),
}).refine((value) => value.endsAt > value.startsAt, { message: "End time must be after start time.", path: ["endsAt"] });

function slugBase(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "event";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const currentTime = now();
  const { db } = await getDb();
  const rows = await db.select().from(events).where(isNull(events.deletedAt)).orderBy(events.startsAt);
  const checklist = rows.length
    ? await db.select().from(checklistItems).where(and(inArray(checklistItems.eventId, rows.map((event) => event.id)), isNull(checklistItems.deletedAt)))
    : [];
  const counts = new Map<string, { total: number; done: number }>();
  for (const item of checklist) {
    const count = counts.get(item.eventId) ?? { total: 0, done: 0 };
    if (item.status !== "na") count.total += 1;
    if (item.status === "done") count.done += 1;
    counts.set(item.eventId, count);
  }
  let filtered = rows;
  if (query) {
    const tokens = query.split(/\s+/).filter(Boolean);
    filtered = rows.filter((event) => tokens.every((token) => {
      if (token.startsWith("type:")) return event.type === token.slice(5);
      if (token.startsWith("status:")) return event.approvalStatus === token.slice(7);
      if (token === "is:upcoming") return event.endsAt >= currentTime;
      if (token === "is:past") return event.endsAt < currentTime;
      return `${event.name} ${event.venue} ${event.description}`.toLowerCase().includes(token);
    }));
  }
  return NextResponse.json(filtered.map((event) => ({
    ...event, checklistProgress: counts.get(event.id) ?? { total: 0, done: 0 },
  })));
}

export async function POST(request: Request) {
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const currentTime = now();
  const { db } = await getDb();
  const baseSlug = slugBase(input.name);
  let slug = baseSlug;
  let suffix = 2;
  while ((await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).limit(1)).length) {
    slug = `${baseSlug}-${suffix++}`;
  }
  const [event] = await db.insert(events).values({
    ...input, slug, approvedAt: input.approvalStatus === "approved" ? currentTime : null,
  }).returning();
  const [rules, holidays] = await Promise.all([eventRules(db), eventHolidays(db)]);
  const generated = generateChecklist(event as EventRecord, rules, holidays, currentTime);
  if (generated.length) await db.insert(checklistItems).values(generated.map((item) => ({ ...item, eventId: event.id })));
  if (await getSetting("creatives.autoSchedule")) await generatePostsForEvent(db, event as CreativeEvent, currentTime);
  return NextResponse.json(event, { status: 201 });
}
