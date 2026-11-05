import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { enqueueDocumentJob } from "@/lib/docs/job-queue";
import { getSettings, setSetting, settingSchemas, type SettingKey } from "@/lib/settings";

const keySet = new Set(Object.keys(settingSchemas));

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PATCH(request: Request) {
  const body = z.record(z.string(), z.unknown()).safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Expected a settings object." }, { status: 400 });
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body.data)) {
    if (!keySet.has(key)) return NextResponse.json({ error: `Unknown setting: ${key}` }, { status: 400 });
    try {
      const previousDefaults = key === "ai.defaults" ? await getSetting("ai.defaults") : null;
      result[key] = await setSetting(key as SettingKey, value);
      if (key === "ai.defaults" && previousDefaults) {
        const nextDefaults = settingSchemas["ai.defaults"].parse(result[key]);
        if (JSON.stringify(previousDefaults.embedding) !== JSON.stringify(nextDefaults.embedding) && nextDefaults.embedding) {
          const { db } = await getDb();
          const active = await db.select().from(documents).where(and(eq(documents.active, true), isNull(documents.deletedAt), eq(documents.status, "ready")));
          for (const document of active) {
            await db.update(documents).set({ status: "embedding", progress: 0, updatedAt: new Date() }).where(eq(documents.id, document.id));
            await enqueueDocumentJob(await getDb(), document.id, "embed");
          }
        }
      }
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : "Invalid setting value.",
      }, { status: 400 });
    }
  }
  return NextResponse.json(result);
}
