import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { checklistItems, committees, tasks } from "@/lib/db/schema";
import { nextCheckin } from "@/lib/tasks/logic";
import { addTaskActivity } from "@/lib/tasks/route-utils";
import { eventByRef, eventHolidays, eventRules } from "@/lib/events/db-utils";
import { computeDeadline, generateChecklist, type EventRecord } from "@/lib/events/logic";

type Context = { params: Promise<{ id: string; itemId: string }> };
const patchSchema = z.object({
  status: z.enum(["open", "done", "na"]).optional(),
  dueAt: z.coerce.date().optional(),
  resetDueAt: z.boolean().optional(),
}).refine((value) => value.status !== undefined || value.dueAt !== undefined || value.resetDueAt === true);

export async function PATCH(request: Request, context: Context) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, itemId } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const [item] = await db.select().from(checklistItems)
    .where(and(eq(checklistItems.id, itemId), eq(checklistItems.eventId, event.id), isNull(checklistItems.deletedAt))).limit(1);
  if (!item) return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });
  const currentTime = now();
  const { status, dueAt, resetDueAt } = parsed.data;
  const update: Partial<typeof checklistItems.$inferInsert> = { updatedAt: currentTime };
  if (status) update.status = status;
  if (dueAt) {
    update.dueAt = dueAt;
    update.dueOverridden = true;
    update.late = dueAt < currentTime;
  } else if (resetDueAt) {
    const [rules, holidays] = await Promise.all([eventRules(db), eventHolidays(db)]);
    const rule = rules.find((entry) => entry.key === item.ruleKey);
    const template = generateChecklist(event as EventRecord, rules, holidays, currentTime)
      .find((entry) => entry.phase === item.phase && entry.title === item.title);
    if (rule) {
      const result = computeDeadline(rule, event as EventRecord, holidays, currentTime);
      update.dueAt = result.dueAt;
      update.late = result.late;
    } else if (template) {
      update.dueAt = template.dueAt;
      update.late = template.late;
    }
    update.dueOverridden = false;
  }
  const [updated] = await db.update(checklistItems).set(update)
    .where(and(eq(checklistItems.id, item.id), isNull(checklistItems.deletedAt))).returning();
  if (item.taskId && (status === "done" || status === "na")) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, item.taskId)).limit(1);
    const taskStatus = status === "done" ? "done" : "cancelled";
    if (task && task.status !== taskStatus) {
      await db.update(tasks).set({
        status: taskStatus, progress: status === "done" ? 100 : task.progress,
        completedAt: status === "done" ? currentTime : null,
        nextCheckinAt: null, lastCheckinAt: null, snoozedUntil: null, updatedAt: currentTime,
      }).where(eq(tasks.id, task.id));
      await addTaskActivity(db, task.id, "status_change", "", { field: "status", oldValue: task.status, newValue: taskStatus }, currentTime);
    }
  } else if (item.taskId && status === "open") {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, item.taskId)).limit(1);
    if (task && (task.status === "done" || task.status === "cancelled")) {
      const [committee] = task.committeeId
        ? await db.select({ cadence: committees.defaultCheckinDays }).from(committees).where(eq(committees.id, task.committeeId)).limit(1)
        : [];
      const cadence = task.checkinEveryDays ?? committee?.cadence ?? 3;
      await db.update(tasks).set({
        status: "todo", completedAt: null, progress: 0, updatedAt: currentTime,
        nextCheckinAt: nextCheckin({ from: currentTime, everyDays: cadence, dueAt: task.dueAt, now: currentTime }),
      }).where(eq(tasks.id, task.id));
      await addTaskActivity(db, task.id, "status_change", "", { field: "status", oldValue: task.status, newValue: "todo" }, currentTime);
    }
  }
  if (item.taskId && (dueAt || resetDueAt)) {
    const newDueAt = updated.dueAt;
    if (newDueAt) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, item.taskId)).limit(1);
      if (task && task.dueAt?.getTime() !== newDueAt.getTime()) {
        await db.update(tasks).set({ dueAt: newDueAt, updatedAt: currentTime }).where(eq(tasks.id, item.taskId));
        await addTaskActivity(db, task.id, "field_change", "", {
          field: "dueAt", oldValue: task.dueAt, newValue: newDueAt, source: "checklist_due_date",
        }, currentTime);
      }
    }
  }
  return NextResponse.json(updated);
}
