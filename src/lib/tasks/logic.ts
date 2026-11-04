import { TZDate } from "@date-fns/tz";
import { addDays, differenceInCalendarDays, format, getDay, isBefore, isAfter } from "date-fns";
import { parseQuery, type ParsedQuery } from "@/lib/query";
import { plural } from "@/lib/utils";

export const MANILA_TIME_ZONE = "Asia/Manila";
export const DEFAULT_NUDGE_TEMPLATE = 'Hi {first_name}! Quick check on "{title}" ({due}). How\'s it going, any blockers? 🙏';

function manilaDate(date: Date): TZDate {
  return new TZDate(date, MANILA_TIME_ZONE);
}

function atNine(date: Date): Date {
  const zoned = manilaDate(date);
  zoned.setHours(9, 0, 0, 0);
  return zoned;
}

function nextWorkingDay(date: Date): Date {
  const day = getDay(date);
  return day === 6 ? addDays(date, 2) : day === 0 ? addDays(date, 1) : date;
}

function previousWorkingDay(date: Date): Date {
  const day = getDay(date);
  return day === 6 ? addDays(date, -1) : day === 0 ? addDays(date, -2) : date;
}

function nextNineAfter(now: Date): Date {
  const todayNine = atNine(now);
  const result = isAfter(todayNine, now) ? todayNine : atNine(addDays(todayNine, 1));
  return atNine(nextWorkingDay(result));
}

export function nextCheckin({
  from,
  everyDays,
  dueAt,
  now,
}: {
  from: Date;
  everyDays: number;
  dueAt: Date | null;
  now: Date;
}): Date {
  const minimum = nextNineAfter(now);
  let result = atNine(addDays(manilaDate(from), Math.max(1, everyDays)));
  result = atNine(nextWorkingDay(result));

  if (dueAt && isAfter(dueAt, now)) {
    const dayBeforeDue = atNine(previousWorkingDay(atNine(addDays(manilaDate(dueAt), -1))));
    if (isAfter(result, dayBeforeDue)) result = dayBeforeDue;
  }
  if (isBefore(result, minimum)) result = minimum;
  return new Date(result);
}

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskState = "done" | "snoozed" | "checkin_due" | "overdue" | "due_soon" | "ok";

export type TaskForState = {
  status: TaskStatus | string;
  dueAt: Date | null;
  nextCheckinAt: Date | null;
  snoozedUntil: Date | null;
};

export function taskState(task: TaskForState, now: Date): TaskState {
  if (task.status === "done" || task.status === "cancelled") return "done";
  if (task.snoozedUntil && isAfter(task.snoozedUntil, now)) return "snoozed";
  if (task.dueAt && isBefore(task.dueAt, now)) return "overdue";
  if (task.nextCheckinAt && !isAfter(task.nextCheckinAt, now)) return "checkin_due";
  if (task.dueAt && differenceInCalendarDays(manilaDate(task.dueAt), manilaDate(now)) <= 3) return "due_soon";
  return "ok";
}

export type NudgeTask = { number: number; title: string; dueAt: Date | null };
export type NudgeMember = { name: string } | null | undefined;
export type NudgeCommittee = { name: string } | null | undefined;

function dueLabel(dueAt: Date | null, now: Date): { due: string; daysLeft: string } {
  if (!dueAt) return { due: "no deadline", daysLeft: "no deadline" };
  const due = format(manilaDate(dueAt), "EEE, MMM d");
  const days = differenceInCalendarDays(manilaDate(dueAt), manilaDate(now));
  return { due, daysLeft: days < 0 ? `${plural(Math.abs(days), "day")} overdue` : plural(days, "day") };
}

export function buildNudge(
  task: NudgeTask,
  member: NudgeMember,
  _committee: NudgeCommittee,
  template = DEFAULT_NUDGE_TEMPLATE,
  now = new Date(),
): string {
  const firstName = member?.name.trim().split(/\s+/)[0] || "there";
  const { due, daysLeft } = dueLabel(task.dueAt, now);
  const values: Record<string, string> = {
    first_name: firstName,
    title: task.title,
    due,
    days_left: daysLeft,
    task_ref: `#${task.number}`,
  };
  return template.replace(/\{(first_name|title|due|days_left|task_ref)\}/g, (_match, key: string) => values[key]);
}

export type DigestTask = NudgeTask & {
  status: string;
  assignee?: { name: string } | null;
};

export function buildDigest(committee: NudgeCommittee, tasks: DigestTask[], now: Date): string {
  const open = tasks
    .filter((task) => task.status !== "done" && task.status !== "cancelled")
    .sort((a, b) => (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER));
  if (!open.length) return "No open tasks 🎉";
  const greeting = `Good morning, ${committee?.name ?? "team"}!`;
  const lines = open.map((task) => {
    const isOverdue = Boolean(task.dueAt && isBefore(task.dueAt, now));
    const due = task.dueAt ? `due ${format(manilaDate(task.dueAt), "EEE MMM d")}` : "no deadline";
    const left = task.dueAt
      ? ` (${isOverdue ? "⚠ overdue" : `in ${differenceInCalendarDays(manilaDate(task.dueAt), manilaDate(now))}d`})`
      : "";
    const assignee = task.assignee?.name ? ` — @${task.assignee.name}` : "";
    return `• #${task.number} ${task.title} — ${due}${left}${assignee}`;
  });
  return [greeting, "", ...lines, "", "Please share an update on each task when you can. Thank you!"].join("\n");
}

export type TaskFilter = {
  committees: string[];
  assignees: string[];
  statuses: string[];
  priorities: string[];
  labels: string[];
  due: Array<{ op: "<" | ">"; value: string }>;
  states: Array<"overdue" | "checkin" | "open" | "closed">;
  text: string;
};

export function toTaskFilter(query: string | ParsedQuery): TaskFilter {
  const parsed = typeof query === "string" ? parseQuery(query) : query;
  const filter: TaskFilter = {
    committees: [], assignees: [], statuses: [], priorities: [], labels: [], due: [], states: [], text: parsed.text,
  };
  for (const { key, op, value } of parsed.filters) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (key === "committee") filter.committees.push(normalized.toLowerCase());
    else if (key === "assignee") filter.assignees.push(normalized);
    else if (key === "status" && ["todo", "in_progress", "blocked", "done", "cancelled"].includes(normalized)) filter.statuses.push(normalized);
    else if (key === "priority" && ["low", "normal", "high", "urgent"].includes(normalized)) filter.priorities.push(normalized);
    else if (key === "label") filter.labels.push(normalized);
    else if (key === "due" && (op === "<" || op === ">")) filter.due.push({ op, value: normalized });
    else if (key === "is" && ["overdue", "checkin", "open", "closed"].includes(normalized)) filter.states.push(normalized as TaskFilter["states"][number]);
  }
  return filter;
}
