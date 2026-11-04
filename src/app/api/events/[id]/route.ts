import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { checklistItems, events, posts, postingRules, taskActivity, tasks } from "@/lib/db/schema";
import { eventByRef, eventHolidays, eventRules } from "@/lib/events/db-utils";
import { rescheduleChecklist, type EventRecord, type ExistingChecklistItem } from "@/lib/events/logic";
import { lumaUrlSchema } from "@/lib/events/validation";
import { addTaskActivity } from "@/lib/tasks/route-utils";
import { reschedulePosts, type CreativeEvent } from "@/lib/creatives/logic";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1).max(200).optional(),
  type: z.enum(["on_campus", "off_campus", "online", "booth"]).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  venue: z.string().max(500).optional(),
  description: z.string().max(50_000).optional(),
  lumaUrl: lumaUrlSchema,
  participantTarget: z.number().int().min(0).max(1_000_000).optional(),
  participantActual: z.number().int().min(0).max(1_000_000).optional(),
  approvalStatus: z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]).optional(),
  hasFees: z.boolean().optional(),
  hasExternalGuests: z.boolean().optional(),
  isMajor: z.boolean().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"));

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const checklist = await db.select().from(checklistItems)
    .where(and(eq(checklistItems.eventId, event.id), isNull(checklistItems.deletedAt)));
  return NextResponse.json({ ...event, checklist });
}

export async function PATCH(request: Request, context: Context) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const { expectedUpdatedAt, ...input } = parsed.data;
  const { db } = await getDb();
  const current = await eventByRef(db, id);
  if (!current) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (current.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
    return NextResponse.json({ current }, { status: 409 });
  }
  const newEvent = { ...current, ...input };
  if (newEvent.endsAt <= newEvent.startsAt) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }
  const currentTime = now();
  const update: Partial<typeof events.$inferInsert> = { ...input, updatedAt: currentTime };
  if (input.approvalStatus !== undefined) {
    update.approvedAt = input.approvalStatus === "approved"
      ? (current.approvalStatus === "approved" ? current.approvedAt : currentTime)
      : null;
  }
  const [updated] = await db.update(events).set(update)
    .where(and(eq(events.id, current.id), eq(events.updatedAt, current.updatedAt), isNull(events.deletedAt))).returning();
  if (!updated) {
    return NextResponse.json({ current: await eventByRef(db, id) }, { status: 409 });
  }
  const shouldReschedule = ["startsAt", "endsAt", "type", "hasFees", "hasExternalGuests", "isMajor"]
    .some((key) => key in input);
  if (shouldReschedule) {
    const [items, rules, holidays] = await Promise.all([
      db.select().from(checklistItems).where(and(eq(checklistItems.eventId, current.id), isNull(checklistItems.deletedAt))),
      eventRules(db), eventHolidays(db),
    ]);
    const result = rescheduleChecklist(items as ExistingChecklistItem[], current as EventRecord, updated as EventRecord, rules, holidays, currentTime);
    if (result.removedIds.length) {
      for (const itemId of result.removedIds) {
        const [item] = items.filter((candidate) => candidate.id === itemId);
        if (item) {
          await db.update(checklistItems).set({ deletedAt: currentTime, updatedAt: currentTime })
            .where(and(eq(checklistItems.id, item.id), isNull(checklistItems.deletedAt)));
        }
      }
    }
    for (const item of result.items) {
      if (item.id) {
        await db.update(checklistItems).set({
          dueAt: item.dueAt, late: item.late, ruleKey: item.ruleKey,
          detail: item.detail, source: item.source, sort: item.sort, updatedAt: currentTime,
        }).where(eq(checklistItems.id, item.id));
      } else {
        await db.insert(checklistItems).values({
          eventId: current.id, phase: item.phase, title: item.title, detail: item.detail,
          ruleKey: item.ruleKey, dueAt: item.dueAt, dueOverridden: item.dueOverridden,
          late: item.late, status: item.status, source: item.source, sort: item.sort,
          taskId: item.taskId ?? null,
        });
      }
    }
    for (const linked of result.taskDueDates) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, linked.taskId)).limit(1);
      if (task && task.dueAt?.getTime() !== linked.dueAt.getTime()) {
        await db.update(tasks).set({ dueAt: linked.dueAt, updatedAt: currentTime }).where(eq(tasks.id, linked.taskId));
        await addTaskActivity(db, task.id, "field_change", "", {
          field: "dueAt", oldValue: task.dueAt, newValue: linked.dueAt, source: "event_reschedule",
        }, currentTime);
      }
    }
  }
  const cancellingNow = input.approvalStatus === "cancelled" && current.approvalStatus !== "cancelled";
  const shouldReschedulePosts = ["startsAt", "endsAt"].some((key) => key in input) || cancellingNow;
  if (shouldReschedulePosts) {
    const [eventPosts, rules] = await Promise.all([
      db.select().from(posts).where(and(eq(posts.eventId, current.id), isNull(posts.deletedAt))),
      db.select().from(postingRules).where(isNull(postingRules.deletedAt)),
    ]);
    const result = reschedulePosts(
      eventPosts,
      current as EventRecord as CreativeEvent,
      updated as EventRecord as CreativeEvent,
      rules.map((rule) => ({ ...rule, anchor: rule.anchor as "event_start" | "event_end" })),
      currentTime,
    );
    const currentPosts = new Map(eventPosts.map((post) => [post.id, post]));
    for (const post of result.posts) {
      const previous = currentPosts.get(post.id);
      if (!previous || (previous.scheduledAt?.getTime() === post.scheduledAt?.getTime() && previous.status === post.status && previous.eventId === post.eventId)) continue;
      await db.update(posts).set({
        scheduledAt: post.scheduledAt,
        status: post.status,
        eventId: post.eventId,
        updatedAt: currentTime,
      }).where(eq(posts.id, post.id));
    }
    const cancelledTaskIds: string[] = [];
    for (const taskId of result.cancelledTaskIds) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task || task.status === "done" || task.status === "cancelled") continue;
      await db.update(tasks).set({ status: "cancelled", completedAt: currentTime, updatedAt: currentTime }).where(eq(tasks.id, taskId));
      cancelledTaskIds.push(taskId);
    }
    for (const item of result.taskDueDates) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, item.taskId)).limit(1);
      if (!task) continue;
      if (task.status === "done" || task.status === "cancelled") continue;
      await db.update(tasks).set({ dueAt: item.dueAt, updatedAt: currentTime }).where(eq(tasks.id, item.taskId));
      await addTaskActivity(db, task.id, "field_change", "", { field: "dueAt", source: "post_reschedule" }, currentTime);
    }
    if (result.noticePost) await db.insert(posts).values(result.noticePost);
    if (cancellingNow && cancelledTaskIds.length) {
      await db.insert(taskActivity).values(cancelledTaskIds.map((taskId) => ({
        taskId, kind: "status_change", body: "todo → cancelled",
        meta: { source: "event_cancelled" }, at: currentTime,
      })));
    }
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const current = await eventByRef(db, id);
  if (!current) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const currentTime = now();
  const [event] = await db.update(events).set({ deletedAt: currentTime, updatedAt: currentTime })
    .where(and(eq(events.id, current.id), isNull(events.deletedAt))).returning();
  return event ? NextResponse.json({ ok: true, id: event.id }) : NextResponse.json({ error: "Event not found." }, { status: 404 });
}
