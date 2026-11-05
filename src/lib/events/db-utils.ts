import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db/client";
import { deadlineRules, events, holidays } from "@/lib/db/schema";

export async function eventByRef(db: DrizzleDb, ref: string) {
  const condition = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(ref) ? eq(events.id, ref) : eq(events.slug, ref);
  const [event] = await db.select().from(events).where(and(condition, isNull(events.deletedAt))).limit(1);
  return event;
}

export async function eventRules(db: DrizzleDb) {
  return db.select().from(deadlineRules).where(isNull(deadlineRules.deletedAt));
}

export async function eventHolidays(db: DrizzleDb) {
  return db.select().from(holidays).where(isNull(holidays.deletedAt));
}
