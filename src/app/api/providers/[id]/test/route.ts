import { NextResponse } from "next/server";
import { listModels, mapProviderError } from "@/lib/ai/providers";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json({ ok: true, models: await listModels(id) });
  } catch (error) {
    return NextResponse.json({ ok: false, models: [], error: mapProviderError(error) });
  }
}
