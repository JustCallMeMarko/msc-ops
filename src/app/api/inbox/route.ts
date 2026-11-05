import { differenceInCalendarDays, isSameDay } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { and, isNull, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { MANILA_TIME_ZONE, taskState } from "@/lib/tasks/logic";
import { listTaskRows } from "@/lib/tasks/route-utils";
import { plural } from "@/lib/utils";

export const dynamic = "force-dynamic";

const groups = ["checkin_due", "overdue", "due_today", "due_this_week"] as const;

export async function GET() {
  const currentTime = now();
  const { db } = await getDb();
  const rows = await listTaskRows(db, and(isNull(tasks.deletedAt), notInArray(tasks.status, ["done", "cancelled"])));
  const output: Record<(typeof groups)[number], unknown[]> = {
    checkin_due: [], overdue: [], due_today: [], due_this_week: [],
  };
  for (const { task, committee, assignee } of rows) {
    const state = taskState(task, currentTime);
    let group: (typeof groups)[number] | undefined;
    if (state === "checkin_due") group = "checkin_due";
    else if (state === "overdue") group = "overdue";
    else if (task.dueAt && isSameDay(new TZDate(task.dueAt, MANILA_TIME_ZONE), new TZDate(currentTime, MANILA_TIME_ZONE))) group = "due_today";
    else if (task.dueAt && differenceInCalendarDays(new TZDate(task.dueAt, MANILA_TIME_ZONE), new TZDate(currentTime, MANILA_TIME_ZONE)) <= 7 && task.dueAt > currentTime) group = "due_this_week";
    if (!group || (task.snoozedUntil && task.snoozedUntil > currentTime)) continue;
    const lastUpdate = task.lastCheckinAt ?? task.createdAt;
    const quietDays = Math.max(0, differenceInCalendarDays(new TZDate(currentTime, MANILA_TIME_ZONE), new TZDate(lastUpdate, MANILA_TIME_ZONE)));
    const reason = group === "checkin_due" ? `No update for ${plural(quietDays, "day")}`
      : group === "overdue" ? "Past due"
        : group === "due_today" ? "Due today" : "Due this week";
    output[group].push({ ...task, committee, assignee, reason });
  }
  for (const group of groups) {
    output[group].sort((a, b) => {
      const first = a as { dueAt: Date | null; nextCheckinAt: Date | null };
      const second = b as { dueAt: Date | null; nextCheckinAt: Date | null };
      return (first.dueAt?.getTime() ?? first.nextCheckinAt?.getTime() ?? Infinity)
        - (second.dueAt?.getTime() ?? second.nextCheckinAt?.getTime() ?? Infinity);
    });
  }
  return NextResponse.json(output);
}
