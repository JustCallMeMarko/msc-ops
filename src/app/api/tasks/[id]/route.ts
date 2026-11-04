import { and, asc, eq, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { committees, taskActivity, tasks } from "@/lib/db/schema";
import { nextCheckin, taskState } from "@/lib/tasks/logic";
import { addTaskActivity, getTaskRow, readJson } from "@/lib/tasks/route-utils";

type Context = { params: Promise<{ id: string }> };

const statusSchema = z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]);
const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const dateField = z.coerce.date().nullable().optional();
const patchSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  title: z.string().trim().min(1).max(500).optional(),
  body: z.string().max(100_000).optional(),
  committeeId: z.string().uuid().nullable().optional(),
  assigneeMemberId: z.string().uuid().nullable().optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  dueAt: dateField,
  dueRule: z.string().max(500).nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  checkinEveryDays: z.number().int().min(1).max(365).nullable().optional(),
  nextCheckinAt: dateField,
  lastCheckinAt: dateField,
  snoozedUntil: dateField,
}).refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"));

function taskCondition(id: string): SQL {
  const numericId = Number(id);
  return Number.isInteger(numericId) && numericId > 0 ? eq(tasks.number, numericId) : eq(tasks.id, id);
}

async function findCurrent(db: Awaited<ReturnType<typeof getDb>>["db"], id: string) {
  const [row] = await db.select().from(tasks).where(taskCondition(id)).limit(1);
  return row;
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [task] = await db.select().from(tasks).where(taskCondition(id)).limit(1);
  if (!task || task.deletedAt) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const row = await getTaskRow(db, task.id);
  const activity = await db.select().from(taskActivity).where(eq(taskActivity.taskId, task.id)).orderBy(asc(taskActivity.at));
  return NextResponse.json({ ...task, committee: row?.committee ?? null, assignee: row?.assignee ?? null, activity, state: taskState(task, now()) });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { expectedUpdatedAt, ...input } = parsed.data;
  const { db } = await getDb();
  const current = await findCurrent(db, id);
  if (!current || current.deletedAt) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  if (current.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
    return NextResponse.json({ current }, { status: 409 });
  }
  const currentTime = now();
  const changes: Partial<typeof tasks.$inferInsert> = { ...input, updatedAt: currentTime };
  if (input.status === "done" && current.status !== "done") {
    changes.completedAt = currentTime;
    changes.nextCheckinAt = null;
    changes.lastCheckinAt = null;
    changes.snoozedUntil = null;
  } else if (input.status && input.status !== "done" && (current.status === "done" || current.status === "cancelled")) {
    let cadence = input.checkinEveryDays ?? current.checkinEveryDays;
    if (cadence === null || cadence === undefined) {
      const [committee] = current.committeeId
        ? await db.select({ days: committees.defaultCheckinDays }).from(committees).where(eq(committees.id, current.committeeId)).limit(1)
        : [];
      cadence = committee?.days ?? 3;
    }
    changes.completedAt = null;
    changes.nextCheckinAt = nextCheckin({
      from: currentTime,
      everyDays: cadence,
      dueAt: input.dueAt ?? current.dueAt,
      now: currentTime,
    });
  }
  const [updated] = await db.update(tasks)
    .set(changes)
    .where(and(eq(tasks.id, current.id), eq(tasks.updatedAt, current.updatedAt)))
    .returning();
  if (!updated) {
    const latest = await findCurrent(db, id);
    return NextResponse.json({ current: latest }, { status: 409 });
  }
  for (const [key, value] of Object.entries(changes)) {
    if (key === "updatedAt") continue;
    const oldValue = current[key as keyof typeof current];
    if (JSON.stringify(oldValue) === JSON.stringify(value)) continue;
    await addTaskActivity(db, current.id, key === "status" ? "status_change" : "field_change", "", {
      field: key, oldValue, newValue: value,
    }, currentTime);
  }
  const row = await getTaskRow(db, current.id);
  return NextResponse.json({ ...row.task, committee: row.committee, assignee: row.assignee });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const current = await findCurrent(db, id);
  if (!current || current.deletedAt) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const currentTime = now();
  const [task] = await db.update(tasks).set({ deletedAt: currentTime, updatedAt: currentTime })
    .where(eq(tasks.id, current.id)).returning();
  await addTaskActivity(db, task.id, "field_change", "", { field: "deletedAt", oldValue: null, newValue: currentTime }, currentTime);
  return NextResponse.json({ ok: true, id: task.id });
}
