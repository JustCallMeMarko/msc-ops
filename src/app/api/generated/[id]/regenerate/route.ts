import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { generatedDocs } from "@/lib/db/schema";
import { generate } from "@/lib/templates/generate";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const askValues = z.record(z.string(), z.unknown()).optional().safeParse(
    await request.json().catch(() => ({})),
  );
  if (!askValues.success) return NextResponse.json({ error: askValues.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [generated] = await db.select().from(generatedDocs).where(and(
    eq(generatedDocs.id, id),
    isNull(generatedDocs.deletedAt),
  )).limit(1);
  if (!generated) return NextResponse.json({ error: "Generated document not found." }, { status: 404 });
  const result = await generate({
    templateId: generated.templateId,
    entity: { type: generated.entityType as "event" | "term" | "org", id: generated.entityId },
    askValues: { ...(generated.askValues as Record<string, unknown>), ...askValues.data },
  }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Could not regenerate the document." }));
  if ("error" in result) return NextResponse.json(result, { status: 422 });
  if (!("file" in result) || result.missing.length) return NextResponse.json(result, { status: 422 });
  return NextResponse.json({ file: result.file, generatedDoc: result.generatedDoc }, { status: 201 });
}
