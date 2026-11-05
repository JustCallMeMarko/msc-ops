import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { committees, tasks } from "@/lib/db/schema";
import { nextCheckin } from "@/lib/tasks/logic";
import { addTaskActivity, readJson } from "@/lib/tasks/route-utils";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  text: z.string().trim().min(1).max(20_000),
  status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!task || task.deletedAt) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const currentTime = now();
  const status = parsed.data.status ?? task.status;
  let cadence = task.checkinEveryDays;
  if (cadence === null && task.committeeId) {
    const [committee] = await db.select({ days: committees.defaultCheckinDays })
      .from(committees).where(eq(committees.id, task.committeeId)).limit(1);
    cadence = committee?.days ?? null;
  }
  const next = status === "done" || status === "cancelled"
    ? null
    : nextCheckin({ from: currentTime, everyDays: cadence ?? 3, dueAt: task.dueAt, now: currentTime });
  const changes: Partial<typeof tasks.$inferInsert> = {
    lastCheckinAt: currentTime,
    nextCheckinAt: next,
    updatedAt: currentTime,
  };
  if (parsed.data.status !== undefined) {
    changes.status = status;
    changes.completedAt = status === "done" ? currentTime : null;
  }
  if (parsed.data.progress !== undefined) changes.progress = parsed.data.progress;
  const [updated] = await db.update(tasks).set(changes).where(eq(tasks.id, task.id)).returning();
  await addTaskActivity(db, task.id, "checkin_reply", parsed.data.text, {}, currentTime);
  for (const field of ["status", "progress"] as const) {
    if (changes[field] !== undefined && changes[field] !== task[field]) {
      await addTaskActivity(db, task.id, field === "status" ? "status_change" : "field_change", "", {
        field, oldValue: task[field], newValue: changes[field],
      }, currentTime);
    }
  }
  if (next?.getTime() !== task.nextCheckinAt?.getTime()) {
    await addTaskActivity(db, task.id, "field_change", "", {
      field: "nextCheckinAt", oldValue: task.nextCheckinAt, newValue: next,
    }, currentTime);
  }
  return NextResponse.json(updated);
}
