import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db/client";
import { captionTemplates, captions, committees, events, posts, postingRules, tasks } from "@/lib/db/schema";
import { now } from "@/lib/clock";
import { generatePostSchedule, type CreativeEvent } from "./logic";
import { addTaskActivity } from "@/lib/tasks/route-utils";

export async function generatePostsForEvent(db: DrizzleDb, event: CreativeEvent, currentTime = now()) {
  const [rules, committeeRows, existing] = await Promise.all([
    db.select().from(postingRules).where(and(isNull(postingRules.deletedAt), eq(postingRules.enabled, true))),
    db.select({ id: committees.id, slug: committees.slug, defaultCheckinDays: committees.defaultCheckinDays })
      .from(committees).where(isNull(committees.deletedAt)),
    db.select({ ruleKey: posts.ruleKey }).from(posts)
      .where(and(eq(posts.eventId, event.id), isNull(posts.deletedAt))),
  ]);
  const existingKeys = new Set(existing.flatMap((post) => post.ruleKey ? [post.ruleKey] : []));
  const generated = generatePostSchedule(
    event,
    rules.map((rule) => ({ ...rule, anchor: rule.anchor as "event_start" | "event_end" })),
    committeeRows,
    currentTime,
  );
  const created: typeof posts.$inferSelect[] = [];
  for (const candidate of generated) {
    if (existingKeys.has(candidate.ruleKey)) continue;
    const [post] = await db.insert(posts).values({
      eventId: candidate.eventId,
      title: candidate.title,
      type: candidate.type,
      status: candidate.status,
      scheduledAt: candidate.scheduledAt,
      platforms: candidate.platforms,
      artistMemberId: candidate.artistMemberId,
      writerMemberId: candidate.writerMemberId,
      reviewerMemberId: candidate.reviewerMemberId,
      brandChecked: candidate.brandChecked,
      ruleKey: candidate.ruleKey,
      scheduleOverridden: candidate.scheduleOverridden,
    }).returning();
    const [artworkTask] = await db.insert(tasks).values({
      title: candidate.artworkTask.title,
      body: candidate.artworkTask.body,
      committeeId: candidate.artworkTask.committeeId,
      status: candidate.artworkTask.status,
      priority: candidate.artworkTask.priority,
      progress: candidate.artworkTask.progress,
      dueAt: candidate.artworkTask.dueAt,
      eventId: candidate.artworkTask.eventId,
      checkinEveryDays: candidate.artworkTask.checkinEveryDays,
      nextCheckinAt: candidate.artworkTask.nextCheckinAt,
    }).returning();
    const [captionTask] = await db.insert(tasks).values({
      title: candidate.captionTask.title,
      body: candidate.captionTask.body,
      committeeId: candidate.captionTask.committeeId,
      status: candidate.captionTask.status,
      priority: candidate.captionTask.priority,
      progress: candidate.captionTask.progress,
      dueAt: candidate.captionTask.dueAt,
      eventId: candidate.captionTask.eventId,
      checkinEveryDays: candidate.captionTask.checkinEveryDays,
      nextCheckinAt: candidate.captionTask.nextCheckinAt,
    }).returning();
    await Promise.all([
      addTaskActivity(db, artworkTask.id, "created", "", { source: "post_schedule", postId: post.id }, currentTime),
      addTaskActivity(db, captionTask.id, "created", "", { source: "post_schedule", postId: post.id }, currentTime),
      db.update(posts).set({ artworkTaskId: artworkTask.id, captionTaskId: captionTask.id })
        .where(eq(posts.id, post.id)),
    ]);
    const [template] = await db.select().from(captionTemplates)
      .where(and(eq(captionTemplates.postType, candidate.type), isNull(captionTemplates.deletedAt))).limit(1);
    if (template) {
      await db.insert(captions).values({ postId: post.id, platform: "base", body: template.body, version: 1 });
    }
    created.push({ ...post, artworkTaskId: artworkTask.id, captionTaskId: captionTask.id });
    existingKeys.add(candidate.ruleKey);
  }
  return created;
}

export async function eventByPostRef(db: DrizzleDb, ref: string) {
  const [event] = await db.select().from(events).where(and(eq(events.id, ref), isNull(events.deletedAt))).limit(1);
  return event;
}

export async function activePostIds(db: DrizzleDb, ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: posts.id }).from(posts)
    .where(and(inArray(posts.id, ids), isNull(posts.deletedAt)));
}
