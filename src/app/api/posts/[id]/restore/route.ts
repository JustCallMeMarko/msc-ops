import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [post] = await db.update(posts).set({ deletedAt: null, updatedAt: now() })
    .where(and(eq(posts.id, id), isNotNull(posts.deletedAt))).returning();
  return post ? NextResponse.json(post) : NextResponse.json({ error: "Post not found." }, { status: 404 });
}
