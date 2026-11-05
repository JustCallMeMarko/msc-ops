import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { captions, postActivity, posts } from "@/lib/db/schema";
import { captionLength } from "@/lib/creatives/logic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = z.object({ platform: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const { db } = await getDb();
  const [post] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const rows = await db.select().from(captions)
    .where(and(eq(captions.postId, id), eq(captions.platform, parsed.data.platform), isNull(captions.deletedAt)))
    .orderBy(captions.version);
  const caption = rows.at(-1);
  if (!caption) return NextResponse.json({ error: "Caption not found." }, { status: 404 });
  if (parsed.data.platform !== "base" && parsed.data.platform in { facebook: true, instagram: true, linkedin: true, x: true, tiktok: true }) {
    const length = captionLength(caption.body, parsed.data.platform as "facebook" | "instagram" | "linkedin" | "x" | "tiktok");
    if (length.over || length.hashtagOver) return NextResponse.json({ error: "Caption exceeds the platform limit.", ...length }, { status: 422 });
  }
  const currentTime = now();
  const [approved] = await db.update(captions).set({ status: "approved", approvedAt: currentTime, updatedAt: currentTime })
    .where(eq(captions.id, caption.id)).returning();
  await db.insert(postActivity).values({
    postId: post.id, kind: "caption_approved", body: `Approved ${caption.platform} caption v${caption.version}`,
    meta: { platform: caption.platform, version: caption.version }, at: currentTime,
  });
  return NextResponse.json(approved);
}
