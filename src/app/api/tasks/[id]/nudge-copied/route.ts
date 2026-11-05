import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { addTaskActivity } from "@/lib/tasks/route-utils";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, id), isNull(tasks.deletedAt))).limit(1);
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  await addTaskActivity(db, task.id, "nudge_copied", "", {}, now());
  return NextResponse.json({ ok: true });
}
