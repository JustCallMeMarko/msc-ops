import { NextResponse } from "next/server";
import { z } from "zod";
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
      result[key] = await setSetting(key as SettingKey, value);
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : "Invalid setting value.",
      }, { status: 400 });
    }
  }
  return NextResponse.json(result);
}
