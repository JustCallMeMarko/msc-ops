import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDataDir } from "@/lib/data-dir";
import { restoreSnapshot } from "@/lib/db/client";

export async function POST(request: Request) {
  const parsed = z.object({ file: z.string().regex(/^snapshot-[\dTZ.-]+\.tar\.gz$/) })
    .safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid snapshot file." }, { status: 400 });
  const dataDir = await getDataDir();
  if (dataDir === "memory://") return NextResponse.json({ error: "Snapshots are unavailable in memory mode." }, { status: 400 });
  try {
    await restoreSnapshot(path.join(dataDir, "snapshots", parsed.data.file));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Snapshot could not be restored." }, { status: 500 });
  }
}
