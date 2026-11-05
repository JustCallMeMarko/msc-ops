import { NextResponse } from "next/server";
import { z } from "zod";
import { generate } from "@/lib/templates/generate";
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
  try {
    const result = await generate({
      templateId: id,
      entity: parsed.data.entity as GenerationEntity,
      askValues: parsed.data.askValues,
    });
    if (!("file" in result) || result.missing.length) return NextResponse.json(result, { status: 422 });
    return NextResponse.json({
      file: result.file,
      generatedDoc: result.generatedDoc,
      href: result.file ? `/api/files/${result.file.id}/content` : null,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate the document." }, { status: 422 });
  }
}
