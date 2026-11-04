import { asc, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { announcementTemplates } from "@/lib/db/schema";

export async function GET() {
  const { db } = await getDb();
  const templates = await db.select().from(announcementTemplates)
    .where(isNull(announcementTemplates.deletedAt)).orderBy(asc(announcementTemplates.name));
  return NextResponse.json(templates);
}
