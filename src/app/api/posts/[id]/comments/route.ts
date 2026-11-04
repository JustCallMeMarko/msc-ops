import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { postActivity, posts } from "@/lib/db/schema";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = z.object({ text: z.string().trim().min(1).max(20_000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const { db } = await getDb();
  const [post] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const [activity] = await db.insert(postActivity).values({ postId: id, kind: "comment", body: parsed.data.text, at: now() }).returning();
  return NextResponse.json(activity, { status: 201 });
}
