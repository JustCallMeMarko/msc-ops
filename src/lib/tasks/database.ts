import { and, arrayContains, gte, gt, ilike, inArray, isNull, lt, lte, notInArray, or, type SQL } from "drizzle-orm";
import { committees, members, tasks } from "@/lib/db/schema";
import type { DrizzleDb } from "@/lib/db/client";
import type { TaskFilter } from "@/lib/tasks/logic";

const closedStatuses = ["done", "cancelled"];

function dueBoundary(value: string, now: Date): { op: "<" | ">"; date: Date; relative: boolean } | undefined {
  const relative = /^(\d+)d$/i.exec(value);
  if (relative) return { op: "<", date: new Date(now.getTime() + Number(relative[1]) * 86_400_000), relative: true };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+08:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : { op: ">", date, relative: false };
}

export function whereFromTaskFilter(filter: TaskFilter, db: DrizzleDb, now: Date): SQL | undefined {
  const conditions: SQL[] = [isNull(tasks.deletedAt)];
  if (filter.committees.length) {
    conditions.push(inArray(tasks.committeeId, db.select({ id: committees.id }).from(committees)
      .where(and(isNull(committees.deletedAt), inArray(committees.slug, filter.committees)))));
  }
  if (filter.assignees.length) {
    conditions.push(inArray(tasks.assigneeMemberId, db.select({ id: members.id }).from(members)
      .where(and(isNull(members.deletedAt), or(...filter.assignees.map((name) => ilike(members.name, `%${name}%`)))))));
  }
  if (filter.statuses.length) conditions.push(inArray(tasks.status, filter.statuses));
  if (filter.priorities.length) conditions.push(inArray(tasks.priority, filter.priorities));
  for (const label of filter.labels) conditions.push(arrayContains(tasks.labels, [label]));
  for (const item of filter.due) {
    const boundary = dueBoundary(item.value, now);
    if (!boundary) continue;
    const direction = item.op === "<" ? "lt" : "gt";
    if (item.op === "<" && boundary.relative) {
      conditions.push(and(gte(tasks.dueAt, now), lt(tasks.dueAt, boundary.date))!);
    } else {
      conditions.push(direction === "lt" ? lt(tasks.dueAt, boundary.date) : gt(tasks.dueAt, boundary.date));
    }
  }
  for (const state of filter.states) {
    if (state === "closed") conditions.push(inArray(tasks.status, closedStatuses));
    if (state === "open") conditions.push(notInArray(tasks.status, closedStatuses));
    if (state === "overdue") conditions.push(and(notInArray(tasks.status, closedStatuses), lt(tasks.dueAt, now), or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, now)))!);
    if (state === "checkin") conditions.push(and(notInArray(tasks.status, closedStatuses), lte(tasks.nextCheckinAt, now), or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, now)))!);
  }
  if (filter.text) {
    const term = `%${filter.text}%`;
    conditions.push(or(ilike(tasks.title, term), ilike(tasks.body, term))!);
  }
  return and(...conditions);
}
