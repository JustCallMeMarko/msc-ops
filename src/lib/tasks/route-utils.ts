import { and, eq, type SQL } from "drizzle-orm";
import { now } from "@/lib/clock";
import type { DrizzleDb } from "@/lib/db/client";
import { committees, members, taskActivity, tasks } from "@/lib/db/schema";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function listTaskRows(db: DrizzleDb, condition?: SQL) {
  return db.select({ task: tasks, committee: committees, assignee: members })
    .from(tasks)
    .leftJoin(committees, eq(tasks.committeeId, committees.id))
    .leftJoin(members, eq(tasks.assigneeMemberId, members.id))
    .where(and(condition));
}

export async function getTaskRow(db: DrizzleDb, taskId: string) {
  const [row] = await db.select({ task: tasks, committee: committees, assignee: members })
    .from(tasks)
    .leftJoin(committees, eq(tasks.committeeId, committees.id))
    .leftJoin(members, eq(tasks.assigneeMemberId, members.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row;
}

export async function addTaskActivity(
  db: DrizzleDb,
  taskId: string,
  kind: string,
  body = "",
  meta: Record<string, unknown> = {},
  at = now(),
) {
  await db.insert(taskActivity).values({ taskId, kind, body, meta, at });
}
