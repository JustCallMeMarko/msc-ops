import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDataDir } from "@/lib/data-dir";

export const dynamic = "force-dynamic";

export async function GET() {
  const dataDir = await getDataDir();
  if (dataDir === "memory://") return NextResponse.json([]);
  try {
    const names = await readdir(path.join(dataDir, "snapshots"));
    return NextResponse.json(names.filter((name) => name.endsWith(".tar.gz")).sort().reverse());
  } catch {
    return NextResponse.json([]);
  }
}
