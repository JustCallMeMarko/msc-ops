import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { captions, posts } from "@/lib/db/schema";
import { POST_PLATFORMS } from "@/lib/creatives/logic";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ platform: z.enum(["base", ...POST_PLATFORMS]), body: z.string().max(100_000) });

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const rows = await db.select().from(captions)
    .where(and(eq(captions.postId, id), isNull(captions.deletedAt)))
    .orderBy(captions.platform, captions.version);
  return NextResponse.json(rows);
}

export async function POST(request: Request, context: Context) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const { db } = await getDb();
  const [post] = await db.select({ id: posts.id }).from(posts)
    .where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const [latest] = await db.select({ version: sql<number>`max(${captions.version})` }).from(captions)
    .where(and(eq(captions.postId, id), eq(captions.platform, parsed.data.platform), isNull(captions.deletedAt)));
  const [caption] = await db.insert(captions).values({
    postId: id, platform: parsed.data.platform, body: parsed.data.body,
    version: (latest?.version ?? 0) + 1, status: "draft", approvedAt: null,
  }).returning();
  return NextResponse.json(caption, { status: 201 });
}
