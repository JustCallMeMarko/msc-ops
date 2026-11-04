import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { addTaskActivity } from "@/lib/tasks/route-utils";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const currentTime = now();
  const [task] = await db.update(tasks).set({ deletedAt: null, updatedAt: currentTime })
    .where(and(eq(tasks.id, id), isNotNull(tasks.deletedAt))).returning();
  if (task) await addTaskActivity(db, task.id, "field_change", "", {
    field: "deletedAt", oldValue: "deleted", newValue: null,
  }, currentTime);
  return task ? NextResponse.json(task) : NextResponse.json({ error: "Task not found." }, { status: 404 });
}
