import { TZDate } from "@date-fns/tz";
import { format, startOfMonth, startOfWeek } from "date-fns";
import { inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { committees, taskActivity, tasks } from "@/lib/db/schema";
import { MANILA_TIME_ZONE } from "@/lib/tasks/logic";

export const dynamic = "force-dynamic";

export async function GET() {
  const currentTime = now();
  const { db } = await getDb();
  const committeeRows = await db.select().from(committees).where(isNull(committees.deletedAt)).orderBy(committees.name);
  const taskRows = await db.select().from(tasks).where(isNull(tasks.deletedAt));
  const activeTasks = taskRows.filter((task) => task.status !== "done" && task.status !== "cancelled");
  const monthStart = startOfMonth(new TZDate(currentTime, MANILA_TIME_ZONE));
  const activities = await db.select().from(taskActivity)
    .where(inArray(taskActivity.kind, ["checkin_reply", "nudge_copied"]))
    .orderBy(taskActivity.at);
  const weekStart = startOfWeek(new TZDate(currentTime, MANILA_TIME_ZONE), { weekStartsOn: 1 });
  const firstDay = new TZDate(weekStart, MANILA_TIME_ZONE);
  firstDay.setDate(firstDay.getDate() - 77);
  firstDay.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 84 }, (_, index) => {
    const date = new TZDate(firstDay, MANILA_TIME_ZONE);
    date.setDate(date.getDate() + index);
    return { date: format(date, "yyyy-MM-dd"), count: 0 };
  });
  const recentReplies = activities.filter((activity) => activity.kind === "checkin_reply" && activity.at >= firstDay);
  const result = committeeRows.map((committee) => {
    const ownTasks = taskRows.filter((task) => task.committeeId === committee.id);
    const done = ownTasks.filter((task) => task.status === "done" && task.completedAt && task.completedAt >= monthStart).length;
    const completedWithDue = ownTasks.filter((task) => task.status === "done" && task.dueAt && task.completedAt);
    const onTime = completedWithDue.filter((task) => task.completedAt! <= task.dueAt!).length;
    const taskIds = new Set(ownTasks.map((task) => task.id));
    const daily = days.map((day) => ({
      ...day,
      count: recentReplies.filter((activity) => activity.kind === "checkin_reply"
        && taskIds.has(activity.taskId)
        && format(new TZDate(activity.at, MANILA_TIME_ZONE), "yyyy-MM-dd") === day.date).length,
    }));
    const replyDurations: number[] = [];
    const nudges = new Map<string, Date>();
    for (const activity of activities) {
      if (!taskIds.has(activity.taskId)) continue;
      if (activity.kind === "nudge_copied") nudges.set(activity.taskId, activity.at);
      else if (activity.kind === "checkin_reply" && nudges.has(activity.taskId)) {
        replyDurations.push(Math.max(0, activity.at.getTime() - nudges.get(activity.taskId)!.getTime()) / 86_400_000);
        nudges.delete(activity.taskId);
      }
    }
    return {
      committee,
      counts: {
        open: ownTasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length,
        overdue: ownTasks.filter((task) => task.dueAt && task.dueAt < currentTime && task.status !== "done" && task.status !== "cancelled").length,
        doneThisMonth: done,
        onTimeRate: completedWithDue.length ? Math.round((onTime / completedWithDue.length) * 100) : null,
      },
      heatmap: daily,
      averageReplyDays: replyDurations.length
        ? replyDurations.reduce((sum, value) => sum + value, 0) / replyDurations.length
        : null,
    };
  });
  return NextResponse.json({
    committees: result,
    totals: { open: activeTasks.length },
    slowestToReply: result.filter((item) => item.averageReplyDays !== null)
      .sort((a, b) => (b.averageReplyDays ?? 0) - (a.averageReplyDays ?? 0))
      .slice(0, 5)
      .map(({ committee, averageReplyDays }) => ({ committee, averageReplyDays })),
  });
}
