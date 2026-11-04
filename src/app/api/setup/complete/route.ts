import { NextResponse } from "next/server";
import { z } from "zod";
import { setSetting } from "@/lib/settings";

export async function POST(request: Request) {
  const payload = z.object({ completed: z.literal(true) }).safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ error: "Invalid setup completion request." }, { status: 400 });
  await setSetting("setup.completed", true);
  return NextResponse.json({ ok: true });
}
