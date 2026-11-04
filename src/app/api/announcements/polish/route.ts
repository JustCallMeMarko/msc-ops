import { generateText } from "ai";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { getSetting } from "@/lib/settings";
import { getDb } from "@/lib/db/client";
import { eventByRef } from "@/lib/events/db-utils";
import { providers } from "@/lib/db/schema";
import { MANILA_TIME_ZONE } from "@/lib/events/logic";

const schema = z.object({
  text: z.string().min(1).max(20_000),
  eventId: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const defaults = await getSetting("ai.defaults");
  if (!defaults.chat) return NextResponse.json({ error: "No default chat provider is configured." }, { status: 409 });
  const { db } = await getDb();
  const [provider] = await db.select({ id: providers.id }).from(providers)
    .where(and(eq(providers.id, defaults.chat.providerId), isNull(providers.deletedAt))).limit(1);
  if (!provider) return NextResponse.json({ error: "The default chat provider is unavailable." }, { status: 409 });
  const event = await eventByRef(db, parsed.data.eventId);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  try {
    const model = await getLanguageModel(defaults.chat.providerId, defaults.chat.model);
    const eventDate = format(new TZDate(event.startsAt, MANILA_TIME_ZONE), "EEE, MMM d, yyyy h:mm a");
    const result = await generateText({
      model,
      system: "Polish the event announcement for clarity and warmth. Preserve all facts and links. Return only the improved announcement.",
      prompt: `Announcement text:\n${parsed.data.text}\n\nEvent name: ${event.name}\nEvent date: ${eventDate}\nVenue: ${event.venue}`,
    });
    return NextResponse.json({ text: result.text });
  } catch {
    return NextResponse.json({ error: "The configured provider could not polish this announcement." }, { status: 502 });
  }
}
