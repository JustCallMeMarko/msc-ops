import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { AlreadyRunningError, getDb } from "@/lib/db/client";
import { getSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db } = await getDb();
    const result = await db.execute(sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
    const pgvector = String((result.rows[0] as { extversion?: string } | undefined)?.extversion ?? "unknown");
    const version = await db.execute(sql`SELECT value FROM app_meta WHERE key = 'schema_version'`);
    const schemaVersion = (version.rows[0] as { value?: unknown } | undefined)?.value ?? "1";
    const setupCompleted = await getSetting("setup.completed");
    return NextResponse.json({
      status: "ok",
      pgvector,
      schemaVersion: String(schemaVersion).replaceAll('"', ""),
      setupCompleted,
    });
  } catch (error) {
    return NextResponse.json({
      status: error instanceof AlreadyRunningError ? "already_running" : "db_error",
      pgvector: "unknown",
      schemaVersion: "unknown",
      setupCompleted: false,
    }, { status: error instanceof AlreadyRunningError ? 409 : 503 });
  }
}
