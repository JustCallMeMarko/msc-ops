import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { committees, members, taskActivity, tasks } from "@/lib/db/schema";
import { now } from "@/lib/clock";
import { readJson } from "@/lib/tasks/route-utils";

export const dynamic = "force-dynamic";

const colorSchema = z.enum(["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  color: colorSchema.default("blue"),
  description: z.string().max(2000).default(""),
  headMemberId: z.string().uuid().nullable().optional(),
  defaultCheckinDays: z.number().int().min(1).max(365).default(3),
});

export async function GET() {
  const { db } = await getDb();
  const rows = await db.select().from(committees).where(isNull(committees.deletedAt)).orderBy(committees.name);
  const currentTime = now();
  const enriched = await Promise.all(rows.map(async (committee) => {
    const committeeTasks = await db.select().from(tasks).where(
      and(
        eq(tasks.committeeId, committee.id),
        isNull(tasks.deletedAt),
      ),
    );
    const [head] = committee.headMemberId
      ? await db.select().from(members).where(eq(members.id, committee.headMemberId)).limit(1)
      : [];
    const [lastReply] = committeeTasks.length
      ? await db.select({ at: taskActivity.at, body: taskActivity.body })
        .from(taskActivity)
        .where(and(inArray(taskActivity.taskId, committeeTasks.map((task) => task.id)), eq(taskActivity.kind, "checkin_reply")))
        .orderBy(desc(taskActivity.at))
        .limit(1)
      : [];
    return {
      ...committee,
      headMember: head ? { id: head.id, name: head.name, role: head.role } : null,
      lastReply: lastReply ?? null,
      counts: {
        open: committeeTasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length,
        overdue: committeeTasks.filter((task) => task.dueAt && task.dueAt < currentTime && task.status !== "done" && task.status !== "cancelled").length,
        checkinsDue: committeeTasks.filter((task) => task.nextCheckinAt && task.nextCheckinAt <= currentTime && task.status !== "done" && task.status !== "cancelled").length,
      },
    };
  }));
  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const { db } = await getDb();
    const [committee] = await db.insert(committees).values(parsed.data).returning();
    return NextResponse.json(committee, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A committee with that slug already exists." }, { status: 409 });
  }
}
