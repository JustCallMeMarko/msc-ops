import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { networkLog } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = z.coerce.number().int().min(1).max(500)
    .catch(100)
    .parse(new URL(request.url).searchParams.get("limit") ?? 100);
  const { db } = await getDb();
  const rows = await db.select().from(networkLog).orderBy(desc(networkLog.at)).limit(limit);
  return NextResponse.json(rows);
}
