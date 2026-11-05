import { NextResponse } from "next/server";
import { z } from "zod";
import { preview } from "@/lib/templates/generate";
import type { GenerationEntity } from "@/lib/templates/types";

type Context = { params: Promise<{ id: string }> };
const requestSchema = z.object({
  entity: z.object({
    type: z.enum(["event", "term", "org"]),
    id: z.string().uuid(),
    title: z.string().optional(),
    termStart: z.string().date().optional(),
    termEnd: z.string().date().optional(),
  }),
  askValues: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const entity = parsed.data.entity as GenerationEntity;
  try {
    const result = await preview({ templateId: id, entity, askValues: parsed.data.askValues });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not preview this template." }, { status: 422 });
  }
}
