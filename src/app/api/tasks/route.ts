import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { committees, tasks } from "@/lib/db/schema";
import { toTaskFilter } from "@/lib/tasks/logic";
import { whereFromTaskFilter } from "@/lib/tasks/database";
import { addTaskActivity, listTaskRows, readJson } from "@/lib/tasks/route-utils";
import { nextCheckin, taskState } from "@/lib/tasks/logic";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]);
const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  body: z.string().max(100_000).default(""),
  committeeId: z.string().uuid().nullable().optional(),
  assigneeMemberId: z.string().uuid().nullable().optional(),
  status: statusSchema.default("todo"),
  priority: prioritySchema.default("normal"),
  progress: z.number().int().min(0).max(100).default(0),
  labels: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  dueAt: z.coerce.date().nullable().optional(),
  dueRule: z.string().max(500).nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  checkinEveryDays: z.number().int().min(1).max(365).nullable().optional(),
  nextCheckinAt: z.coerce.date().nullable().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filter = toTaskFilter(url.searchParams.get("q") ?? "");
  const currentTime = now();
  const { db } = await getDb();
  const condition = whereFromTaskFilter(filter, db, currentTime);
  const rows = await listTaskRows(db, condition);
  const view = url.searchParams.get("view") ?? "list";
  const normalized = rows.map(({ task, committee, assignee }) => ({
    ...task,
    committee,
    assignee,
    state: taskState(task, currentTime),
  }));
  if (view === "calendar") normalized.sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  else normalized.sort((a, b) => a.number - b.number);
  return NextResponse.json(normalized);
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const currentTime = now();
  const { db } = await getDb();
  let cadence = input.checkinEveryDays;
  if ((cadence === undefined || cadence === null) && input.committeeId) {
    const [committee] = await db.select({ days: committees.defaultCheckinDays })
      .from(committees).where(eq(committees.id, input.committeeId)).limit(1);
    cadence = committee?.days ?? cadence;
  }
  const everyDays = cadence ?? 3;
  const next = input.status === "done" || input.status === "cancelled"
    ? null
    : input.nextCheckinAt ?? nextCheckin({ from: currentTime, everyDays, dueAt: input.dueAt ?? null, now: currentTime });
  const [task] = await db.insert(tasks).values({
    ...input,
    checkinEveryDays: input.checkinEveryDays ?? null,
    nextCheckinAt: next,
    completedAt: input.status === "done" ? currentTime : null,
    lastCheckinAt: null,
  }).returning();
  await addTaskActivity(db, task.id, "created", `Created #${task.number}.`, {}, currentTime);
  const [row] = await listTaskRows(db, eq(tasks.id, task.id));
  return NextResponse.json({ ...row.task, committee: row.committee, assignee: row.assignee }, { status: 201 });
}
