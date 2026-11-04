import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { checklistItems, tasks } from "@/lib/db/schema";
import { eventByRef } from "@/lib/events/db-utils";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const rows = await db.select({ item: checklistItems, taskNumber: tasks.number }).from(checklistItems)
    .leftJoin(tasks, eq(tasks.id, checklistItems.taskId))
    .where(and(eq(checklistItems.eventId, event.id), isNull(checklistItems.deletedAt)))
    .orderBy(asc(checklistItems.sort));
  return NextResponse.json(rows.map(({ item, taskNumber }) => ({ ...item, taskNumber })));
}
