import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { addTaskActivity, readJson } from "@/lib/tasks/route-utils";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ text: z.string().trim().min(1).max(20_000) });

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, id), isNull(tasks.deletedAt))).limit(1);
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const at = now();
  await addTaskActivity(db, task.id, "comment", parsed.data.text, {}, at);
  return NextResponse.json({ ok: true, at }, { status: 201 });
}
