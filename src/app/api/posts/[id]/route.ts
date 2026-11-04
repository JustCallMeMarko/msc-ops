import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { captions, files, postActivity, postAssets, posts, tasks } from "@/lib/db/schema";
import { canApprove, POST_PLATFORMS, POST_STATUSES } from "@/lib/creatives/logic";
import { eventByRef } from "@/lib/events/db-utils";
import { MANILA_TIME_ZONE } from "@/lib/tasks/logic";
import { TZDate } from "@date-fns/tz";

type Context = { params: Promise<{ id: string }> };
const patchSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  title: z.string().trim().min(1).max(300).optional(),
  eventId: z.string().uuid().nullable().optional(),
  type: z.enum(["poster", "save_the_date", "registration_open", "speaker_reveal", "countdown", "day_of", "highlight", "thank_you", "reschedule_notice", "general"]).optional(),
  status: z.enum(POST_STATUSES).optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  scheduleOverridden: z.boolean().optional(),
  platforms: z.array(z.enum(POST_PLATFORMS)).optional(),
  artistMemberId: z.string().uuid().nullable().optional(),
  writerMemberId: z.string().uuid().nullable().optional(),
  reviewerMemberId: z.string().uuid().nullable().optional(),
  brandChecked: z.boolean().optional(),
  postUrls: z.record(z.string(), z.string().url()).optional(),
  analytics: z.record(z.string(), z.object({ reach: z.number().int().min(0).optional(), reactions: z.number().int().min(0).optional(), comments: z.number().int().min(0).optional(), shares: z.number().int().min(0).optional() })).optional(),
});

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [post] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const [event, postCaptions, assets, activity] = await Promise.all([
    post.eventId ? eventByRef(db, post.eventId) : null,
    db.select().from(captions).where(and(eq(captions.postId, post.id), isNull(captions.deletedAt))).orderBy(captions.version),
    db.select({ asset: postAssets, file: files }).from(postAssets)
      .innerJoin(files, eq(files.id, postAssets.fileId))
      .where(and(eq(postAssets.postId, post.id), isNull(postAssets.deletedAt), isNull(files.deletedAt))),
    db.select().from(postActivity).where(and(eq(postActivity.postId, post.id), isNull(postActivity.deletedAt))).orderBy(postActivity.at),
  ]);
  const latest = new Map<string, typeof postCaptions[number]>();
  for (const caption of postCaptions) if (!latest.has(caption.platform) || latest.get(caption.platform)!.version < caption.version) latest.set(caption.platform, caption);
  const approval = canApprove(post, assets.map(({ asset }) => asset), [...latest.values()]);
  return NextResponse.json({ ...post, event, captions: postCaptions, assets: assets.map(({ asset, file }) => ({ ...asset, file })), activity, approval });
}

export async function PATCH(request: Request, context: Context) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const { expectedUpdatedAt, ...input } = parsed.data;
  const { db } = await getDb();
  const [current] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!current) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (current.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
    return NextResponse.json({ current }, { status: 409 });
  }
  if (input.status === "approved") {
    const [assets, captionRows] = await Promise.all([
      db.select().from(postAssets).where(and(eq(postAssets.postId, id), isNull(postAssets.deletedAt))),
      db.select().from(captions).where(and(eq(captions.postId, id), isNull(captions.deletedAt))),
    ]);
    const latest = new Map<string, typeof captionRows[number]>();
    for (const caption of captionRows) {
      if (!latest.has(caption.platform) || latest.get(caption.platform)!.version < caption.version) latest.set(caption.platform, caption);
    }
    const result = canApprove(current, assets, [...latest.values()]);
    if (!result.ok) return NextResponse.json({ error: "Post is not ready for approval.", missing: result.missing }, { status: 422 });
  }
  const currentTime = now();
  const update: Partial<typeof posts.$inferInsert> = { ...input, updatedAt: currentTime };
  if (input.scheduledAt !== undefined && input.scheduleOverridden === undefined) update.scheduleOverridden = true;
  if (input.status === "posted" && !current.postedAt) update.postedAt = currentTime;
  const [updated] = await db.update(posts).set(update)
    .where(and(eq(posts.id, id), eq(posts.updatedAt, current.updatedAt), isNull(posts.deletedAt))).returning();
  if (!updated) return NextResponse.json({ current: (await db.select().from(posts).where(eq(posts.id, id)).limit(1))[0] }, { status: 409 });
  if (input.scheduledAt && input.scheduledAt.getTime() !== current.scheduledAt?.getTime()) {
    for (const taskId of [current.artworkTaskId, current.captionTaskId]) {
      if (!taskId) continue;
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task) continue;
      const daysBefore = taskId === current.artworkTaskId ? 3 : 2;
      const dueDay = new TZDate(input.scheduledAt, MANILA_TIME_ZONE);
      dueDay.setDate(dueDay.getDate() - daysBefore);
      dueDay.setHours(17, 0, 0, 0);
      await db.update(tasks).set({ dueAt: new Date(dueDay), updatedAt: currentTime }).where(eq(tasks.id, taskId));
    }
  }
  if (input.status && input.status !== current.status) {
    await db.insert(postActivity).values({
      postId: current.id, kind: "status_change", body: `${current.status} → ${input.status}`,
      meta: { oldValue: current.status, newValue: input.status }, at: currentTime,
    });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const currentTime = now();
  const [removed] = await db.update(posts).set({ deletedAt: currentTime, updatedAt: currentTime })
    .where(and(eq(posts.id, id), isNull(posts.deletedAt))).returning({ id: posts.id });
  return removed ? NextResponse.json({ ok: true, id }) : NextResponse.json({ error: "Post not found." }, { status: 404 });
}
