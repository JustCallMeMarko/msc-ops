import { and, arrayContains, eq, gte, ilike, isNull, lte, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { captionTemplates, captions, events, members, postAssets, posts } from "@/lib/db/schema";
import { canApprove, POST_PLATFORMS, POST_STATUSES, POST_TYPES } from "@/lib/creatives/logic";
import { parseQuery } from "@/lib/query";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { db } = await getDb();
  const filters = [isNull(posts.deletedAt)];
  const parsed = parseQuery(url.searchParams.get("q") ?? "");
  const qualifiers = new Map(parsed.filters.map(({ key, value }) => [key, value]));
  const value = (key: string) => url.searchParams.get(key) ?? qualifiers.get(key) ?? null;
  const type = value("type");
  const status = value("status");
  const platform = value("platform");
  const eventRef = value("event");
  const owner = value("owner");
  const from = value("from");
  const to = value("to");
  const query = parsed.text;
  if (type) filters.push(eq(posts.type, type));
  if (status) filters.push(eq(posts.status, status));
  if (platform) filters.push(arrayContains(posts.platforms, [platform]));
  if (eventRef) {
    const [event] = await db.select({ id: events.id }).from(events)
      .where(and(eq(events.slug, eventRef), isNull(events.deletedAt))).limit(1);
    if (!event) return NextResponse.json([]);
    filters.push(eq(posts.eventId, event.id));
  }
  if (owner) {
    const matches = await db.select({ id: members.id }).from(members)
      .where(and(isNull(members.deletedAt), or(ilike(members.name, `%${owner}%`), eq(members.id, owner))));
    const ids = matches.map((member) => member.id);
    filters.push(ids.length
      ? or(...ids.flatMap((id) => [eq(posts.artistMemberId, id), eq(posts.writerMemberId, id), eq(posts.reviewerMemberId, id)]))!
      : eq(posts.id, "00000000-0000-7000-8000-000000000000"));
  }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) filters.push(gte(posts.scheduledAt, new Date(`${from}T00:00:00+08:00`)));
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) filters.push(lte(posts.scheduledAt, new Date(`${to}T23:59:59.999+08:00`)));
  if (query) filters.push(or(ilike(posts.title, `%${query}%`), ilike(events.name, `%${query}%`))!);
  const rows = await db.select({ post: posts, event: events })
    .from(posts).leftJoin(events, eq(events.id, posts.eventId))
    .where(and(...filters)).orderBy(posts.scheduledAt);
  const ready = await Promise.all(rows.map(async ({ post, event }) => {
    const [assets, captionRows] = await Promise.all([
      db.select().from(postAssets).where(and(eq(postAssets.postId, post.id), isNull(postAssets.deletedAt))),
      db.select().from(captions).where(and(eq(captions.postId, post.id), isNull(captions.deletedAt))),
    ]);
    const latest = new Map<string, typeof captionRows[number]>();
    for (const caption of captionRows) if (!latest.has(caption.platform) || latest.get(caption.platform)!.version < caption.version) latest.set(caption.platform, caption);
    const approval = canApprove(post, assets, [...latest.values()]);
    return { ...post, event, canApprove: approval };
  }));
  return NextResponse.json(ready);
}

const createSchema = z.object({
  eventId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  type: z.enum(POST_TYPES),
  status: z.enum(POST_STATUSES).default("idea"),
  scheduledAt: z.coerce.date().nullable().optional(),
  platforms: z.array(z.enum(POST_PLATFORMS)).default(["facebook", "instagram"]),
  artistMemberId: z.string().uuid().nullable().optional(),
  writerMemberId: z.string().uuid().nullable().optional(),
  reviewerMemberId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const input = parsed.data;
  const [post] = await db.insert(posts).values({
    ...input,
    scheduleOverridden: Boolean(input.scheduledAt),
  }).returning();
  const [template] = await db.select().from(captionTemplates)
    .where(and(eq(captionTemplates.postType, post.type), isNull(captionTemplates.deletedAt))).limit(1);
  if (template) await db.insert(captions).values({ postId: post.id, platform: "base", body: template.body, version: 1 });
  return NextResponse.json(post, { status: 201 });
}
