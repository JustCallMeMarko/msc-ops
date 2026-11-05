import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { addTaskActivity, readJson } from "@/lib/tasks/route-utils";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ until: z.coerce.date() });

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success || parsed.data.until <= now()) {
    return NextResponse.json({ error: "Choose a future snooze date." }, { status: 400 });
  }
  const { db } = await getDb();
  const currentTime = now();
  const [task] = await db.update(tasks)
    .set({ snoozedUntil: parsed.data.until, updatedAt: currentTime })
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id, updatedAt: tasks.updatedAt });
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  await addTaskActivity(db, task.id, "snooze", "", { until: parsed.data.until }, currentTime);
  return NextResponse.json({ ok: true, until: parsed.data.until, updatedAt: task.updatedAt });
}
