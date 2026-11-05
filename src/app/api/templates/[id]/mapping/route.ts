import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { templates } from "@/lib/db/schema";
import { dictionaryRegistry } from "@/lib/templates/dictionary";
import { DICTIONARY_KEYS } from "@/lib/templates/dictionary";
import { getSetting } from "@/lib/settings";
import type { TemplateStructure } from "@/lib/templates/types";

type Context = { params: Promise<{ id: string }> };
const fieldSchema = z.union([
  z.enum(DICTIONARY_KEYS),
  z.string().regex(/^ask\.[a-z0-9_]{1,60}$/),
]);
const columnFieldSchema = z.string().refine((value) => /^ask\.[a-z0-9_]{1,60}$/.test(value)
  || Object.values(dictionaryRegistry).some((entry) => entry.columns?.some((column) => column.key === value)), "Unknown repeating-column field");
const mappingSchema = z.record(z.string(), z.object({
  field: fieldSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  skipped: z.boolean().optional(),
  columns: z.record(z.string(), columnFieldSchema).optional(),
}).refine((value) => Boolean(value.field) !== Boolean(value.skipped), "Map a field or explicitly leave it empty."));

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [template] = await db.select().from(templates).where(and(eq(templates.id, id), isNull(templates.deletedAt))).limit(1);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  const defaults = await getSetting("ai.defaults");
  const [previous] = template.previousTemplateId
    ? await db.select().from(templates).where(eq(templates.id, template.previousTemplateId)).limit(1)
    : [];
  return NextResponse.json({
    template,
    previous: previous ?? null,
    noAIConfigured: !defaults.chat,
    dictionary: DICTIONARY_KEYS.map((key) => {
      const entry = dictionaryRegistry[key];
      return { key, label: entry.label, type: entry.type, synonyms: entry.synonyms, columns: entry.columns ?? [] };
    }),
  });
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  const body = z.object({ mapping: mappingSchema }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [template] = await db.select().from(templates).where(and(eq(templates.id, id), isNull(templates.deletedAt))).limit(1);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  const structure = template.structure as TemplateStructure;
  const targetIds = new Set(structure.targets.map((target) => target.id));
  const suppliedIds = new Set(Object.keys(body.data.mapping));
  const invalid = [...suppliedIds].filter((targetId) => !targetIds.has(targetId));
  const missing = structure.targets.filter((target) => !suppliedIds.has(target.id)).map((target) => target.id);
  if (invalid.length || missing.length) {
    return NextResponse.json({ error: "Map or explicitly skip every target.", invalid, missing }, { status: 400 });
  }
  const [updated] = await db.update(templates).set({
    mapping: body.data.mapping,
    mappingConfirmedAt: new Date(),
    active: template.previousTemplateId ? template.active : true,
    updatedAt: new Date(),
  }).where(eq(templates.id, id)).returning();
  return NextResponse.json({ template: updated });
}
