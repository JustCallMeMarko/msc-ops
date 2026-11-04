import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { checklistItems, committees, tasks } from "@/lib/db/schema";
import { nextCheckin } from "@/lib/tasks/logic";
import { addTaskActivity } from "@/lib/tasks/route-utils";
import { eventByRef } from "@/lib/events/db-utils";

type Context = { params: Promise<{ id: string; itemId: string }> };
const assignSchema = z.object({
  committeeId: z.string().uuid(),
  assigneeMemberId: z.string().uuid().optional(),
});

export async function POST(request: Request, context: Context) {
  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, itemId } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const [item] = await db.select().from(checklistItems)
    .where(and(eq(checklistItems.id, itemId), eq(checklistItems.eventId, event.id), isNull(checklistItems.deletedAt))).limit(1);
  if (!item) return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });
  if (item.taskId) return NextResponse.json({ error: "This checklist item is already assigned.", taskId: item.taskId }, { status: 409 });
  const [committee] = await db.select().from(committees)
    .where(and(eq(committees.id, parsed.data.committeeId), isNull(committees.deletedAt))).limit(1);
  if (!committee) return NextResponse.json({ error: "Committee not found." }, { status: 404 });
  const currentTime = now();
  const [task] = await db.insert(tasks).values({
    title: item.title,
    body: `Event checklist for ${event.name}.\n\nSource: ${item.source}`,
    committeeId: committee.id,
    assigneeMemberId: parsed.data.assigneeMemberId ?? null,
    status: "todo",
    priority: "normal",
    progress: 0,
    labels: ["event"],
    dueAt: item.dueAt,
    dueRule: item.ruleKey ? `${item.ruleKey} · ${item.source}` : item.source,
    eventId: event.id,
    nextCheckinAt: nextCheckin({ from: currentTime, everyDays: committee.defaultCheckinDays, dueAt: item.dueAt, now: currentTime }),
  }).returning();
  await db.update(checklistItems).set({ taskId: task.id, updatedAt: currentTime }).where(eq(checklistItems.id, item.id));
  await addTaskActivity(db, task.id, "created", "", { source: "event_checklist", checklistItemId: item.id }, currentTime);
  return NextResponse.json({ ...task, checklistItemId: item.id }, { status: 201 });
}
