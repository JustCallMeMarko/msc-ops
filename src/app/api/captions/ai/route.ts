import { generateText } from "ai";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { getDb } from "@/lib/db/client";
import { eventByRef } from "@/lib/events/db-utils";
import { providers, posts } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { MANILA_TIME_ZONE } from "@/lib/tasks/logic";

const schema = z.object({
  action: z.enum(["draft", "rewrite", "shorten", "hashtags"]),
  tone: z.enum(["formal", "hype", "taglish", "short"]).optional(),
  platform: z.enum(["facebook", "instagram", "linkedin", "x", "tiktok"]).optional(),
  postId: z.string().uuid(),
  text: z.string().max(20_000).optional(),
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
  const [post] = await db.select().from(posts).where(and(eq(posts.id, parsed.data.postId), isNull(posts.deletedAt))).limit(1);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const event = post.eventId ? await eventByRef(db, post.eventId) : null;
  const publicFields = event ? {
    name: event.name,
    date: format(new TZDate(event.startsAt, MANILA_TIME_ZONE), "EEE, MMM d, yyyy h:mm a"),
    venue: event.venue,
    lumaLink: event.lumaUrl,
    description: event.description,
  } : null;
  const instruction = parsed.data.action === "draft" ? "Write a new social caption."
    : parsed.data.action === "rewrite" ? "Rewrite the supplied caption with clearer phrasing."
      : parsed.data.action === "shorten" ? "Shorten the supplied caption for the requested platform."
        : "Suggest a compact set of relevant hashtags.";
  try {
    const model = await getLanguageModel(defaults.chat.providerId, defaults.chat.model);
    const result = await generateText({
      model,
      system: `You are a careful social-media copywriter. ${instruction} Preserve factual accuracy. Return only the result.`,
      prompt: JSON.stringify({
        action: parsed.data.action, tone: parsed.data.tone, platform: parsed.data.platform,
        postType: post.type, event: publicFields, caption: parsed.data.text ?? "",
      }),
    });
    return NextResponse.json({ text: result.text });
  } catch {
    return NextResponse.json({ error: "The configured provider could not generate a caption." }, { status: 502 });
  }
}
