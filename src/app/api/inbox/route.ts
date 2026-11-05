import { addDays, differenceInCalendarDays, isSameDay } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { and, eq, gte, inArray, isNull, lte, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { captions, checklistItems, events, posts, tasks } from "@/lib/db/schema";
import { lateParWarning } from "@/lib/events/logic";
import { MANILA_TIME_ZONE, taskState } from "@/lib/tasks/logic";
import { listTaskRows } from "@/lib/tasks/route-utils";
import { plural } from "@/lib/utils";
import { getFinanceSnapshot } from "@/lib/finance/db-utils";

export const dynamic = "force-dynamic";

const groups = ["checkin_due", "overdue", "due_today", "due_this_week", "event_deadlines", "late_par", "posts_due", "finance"] as const;

export async function GET() {
  const currentTime = now();
  const { db } = await getDb();
  const rows = await listTaskRows(db, and(isNull(tasks.deletedAt), notInArray(tasks.status, ["done", "cancelled"])));
  const output: Record<(typeof groups)[number], unknown[]> = {
    checkin_due: [], overdue: [], due_today: [], due_this_week: [], event_deadlines: [], late_par: [], posts_due: [], finance: [],
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
  const deadlineLimit = addDays(new TZDate(currentTime, MANILA_TIME_ZONE), 7);
  const deadlineRows = await db.select({ item: checklistItems, event: events }).from(checklistItems)
    .innerJoin(events, eq(events.id, checklistItems.eventId))
    .where(and(
      eq(checklistItems.status, "open"), isNull(checklistItems.deletedAt), isNull(events.deletedAt),
      lte(checklistItems.dueAt, deadlineLimit),
    ));
  output.event_deadlines = deadlineRows
    .sort((a, b) => a.item.dueAt.getTime() - b.item.dueAt.getTime())
    .map(({ item, event }) => ({ ...item, event, late: item.dueAt < currentTime }));
  const parEvents = new Map<string, typeof events.$inferSelect & { checklistItems: typeof checklistItems.$inferSelect[] }>();
  for (const { item, event } of deadlineRows) {
    const bundle = parEvents.get(event.id) ?? { ...event, checklistItems: [] };
    bundle.checklistItems.push(item);
    parEvents.set(event.id, bundle);
  }
  output.late_par = lateParWarning([...parEvents.values()], currentTime).map((event) => ({
    ...event,
    checklistItem: event.checklistItems.find((item) => item.ruleKey === "par"),
  }));
  const dayStart = new TZDate(currentTime, MANILA_TIME_ZONE);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);
  const duePosts = await db.select({ post: posts, event: events }).from(posts)
    .leftJoin(events, eq(events.id, posts.eventId))
    .where(and(
      isNull(posts.deletedAt), notInArray(posts.status, ["posted", "cancelled"]),
      gte(posts.scheduledAt, new Date(dayStart)), lte(posts.scheduledAt, new Date(dayEnd)),
    ));
  const duePostCaptions = duePosts.length
    ? await db.select().from(captions).where(and(
      isNull(captions.deletedAt),
      inArray(captions.postId, duePosts.map(({ post }) => post.id)),
    )).orderBy(captions.version)
    : [];
  output.posts_due = duePosts.map(({ post, event }) => {
    const rows = duePostCaptions.filter((caption) => caption.postId === post.id);
    const base = rows.filter((caption) => caption.platform === "base").at(-1);
    const firstPlatform = rows.filter((caption) => post.platforms.includes(caption.platform)).at(-1);
    return { ...post, event, caption: base?.body ?? firstPlatform?.body ?? "" };
  });
  output.finance = (await getFinanceSnapshot()).whatToDoNow
    .filter((item) => item.severity === "critical" || item.severity === "warning");
  return NextResponse.json(output);
}
