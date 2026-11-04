import { NextResponse } from "next/server";
import { withPurpose } from "@/lib/net/safe-fetch";

export const dynamic = "force-dynamic";

async function probe(url: string): Promise<boolean> {
  try {
    const response = await withPurpose("provider-detect")(url, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const [ollama, lmstudio] = await Promise.all([
    probe("http://127.0.0.1:11434/api/tags"),
    probe("http://127.0.0.1:1234/v1/models"),
  ]);
  return NextResponse.json({ ollama, lmstudio });
}
