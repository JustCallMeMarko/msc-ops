import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { files, templates, providers } from "@/lib/db/schema";
import { FileValidationError, validateFileContent } from "@/lib/files/validation";
import { storeFileBlob } from "@/lib/files/storage";
import { getSetting } from "@/lib/settings";
import { aiMap, heuristicMap } from "@/lib/templates/mapper";
import { extractStructure } from "@/lib/templates/structure";
import { findReplacementCandidates, remapByLabel } from "@/lib/templates/version";
import type { TemplateKind, TemplateSource, TemplateStructure } from "@/lib/templates/types";

export const dynamic = "force-dynamic";

const uploadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["activity_proposal", "par", "liquidation", "budget_proposal", "financial_statement", "guest_list", "booth_declaration", "letter_of_explanation", "turnover_certificate", "resolution", "other"]),
  source: z.enum(["sdao", "scoa", "org"]),
  replaceTemplateId: z.string().uuid().optional(),
  model: z.string().trim().min(1).max(200).optional(),
});

function templateFormat(name: string): "docx" | "xlsx" | "pdf_form" | null {
  const extension = name.toLowerCase().split(".").at(-1);
  if (extension === "docx") return "docx";
  if (extension === "xlsx" || extension === "xlsm") return "xlsx";
  if (extension === "pdf") return "pdf_form";
  return null;
}

function publicTemplate(template: typeof templates.$inferSelect) {
  return {
    id: template.id,
    lineageId: template.lineageId,
    name: template.name,
    kind: template.kind,
    source: template.source,
    format: template.format,
    fileId: template.fileId,
    version: template.version,
    previousTemplateId: template.previousTemplateId,
    active: template.active,
    structure: template.structure,
    mapping: template.mapping,
    mappingConfirmedAt: template.mappingConfirmedAt,
    warnings: template.warnings,
    createdAt: template.createdAt,
  };
}

export async function GET() {
  const { db } = await getDb();
  const rows = await db.select({ template: templates, originalName: files.originalName }).from(templates)
    .innerJoin(files, eq(files.id, templates.fileId))
    .where(isNull(templates.deletedAt))
    .orderBy(templates.kind, templates.version);
  return NextResponse.json({
    templates: rows.map(({ template, originalName }) => ({ ...publicTemplate(template), originalName })),
  });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Choose a valid template file." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a template file." }, { status: 400 });
  const parsed = uploadSchema.safeParse({
    name: form.get("name") || file.name.replace(/\.[^.]+$/, ""),
    kind: form.get("kind"),
    source: form.get("source"),
    replaceTemplateId: form.get("replaceTemplateId") || undefined,
    model: form.get("model") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const format = templateFormat(file.name);
  if (!format) return NextResponse.json({ error: "Upload a DOCX, XLSX, XLSM, or PDF template." }, { status: 415 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let validated: { bytes: Uint8Array; mime: string };
  try {
    validated = await validateFileContent(bytes, file.name);
  } catch (error) {
    const message = error instanceof FileValidationError ? error.message : "Could not validate the template file.";
    return NextResponse.json({ error: message }, { status: 415 });
  }
  let structure: TemplateStructure;
  try {
    structure = await extractStructure(validated.bytes, file.name);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read template structure." }, { status: 422 });
  }
  const { db } = await getDb();
  if (structure.unsupported === "flat_pdf") {
    const [builtin] = await db.select({ id: templates.id, name: templates.name }).from(templates).where(and(
      eq(templates.kind, parsed.data.kind),
      eq(templates.source, "builtin"),
      eq(templates.active, true),
      isNull(templates.deletedAt),
    )).limit(1);
    return NextResponse.json({
      unsupported: "flat_pdf",
      message: "This PDF isn't a fillable form. Use the built-in DOCX version instead.",
      equivalent: builtin ?? null,
    }, { status: 422 });
  }

  const candidates = await findReplacementCandidates(structure, parsed.data.kind);
  const chosen = parsed.data.replaceTemplateId
    ? candidates.find((candidate) => candidate.template.id === parsed.data.replaceTemplateId)
    : candidates[0];
  if (parsed.data.replaceTemplateId && !chosen) {
    return NextResponse.json({ error: "The selected replacement is no longer a compatible candidate." }, { status: 409 });
  }

  let model;
  let usedAI = false;
  const defaults = await getSetting("ai.defaults");
  if (defaults.chat) {
    const [provider] = await db.select().from(providers).where(and(
      eq(providers.id, defaults.chat.providerId),
      isNull(providers.deletedAt),
    )).limit(1);
    if (provider) {
      if (parsed.data.model && provider.type !== "ollama") {
        return NextResponse.json({ error: "Per-request mapping model selection is available for Ollama." }, { status: 400 });
      }
      try {
        model = await getLanguageModel(provider.id, parsed.data.model ?? defaults.chat.model);
      } catch {
        model = undefined;
      }
    }
  }
  const proposed = model ? await aiMap(structure, model) : { mapping: heuristicMap(structure), usedAI: false };
  usedAI = proposed.usedAI;
  let mapping = proposed.mapping;
  let lineageId = uuidv7();
  let previousTemplateId: string | null = null;
  let version = 1;
  let active = true;
  if (chosen) {
    const previous = chosen.template;
    const remapped = remapByLabel({
      structure: previous.structure as TemplateStructure,
      mapping: previous.mapping as Record<string, { field?: string; confidence?: number; skipped?: boolean; columns?: Record<string, string> }>,
    }, structure);
    mapping = { ...mapping, ...remapped.mapping };
    lineageId = previous.lineageId;
    previousTemplateId = previous.id;
    version = previous.version + 1;
    active = false;
  }

  const sha256 = await storeFileBlob(await getDataDir(), validated.bytes);
  const [storedFile] = await db.insert(files).values({
    sha256,
    originalName: file.name.split(/[\\/]/).at(-1)?.slice(0, 255) || "template",
    mime: validated.mime,
    size: validated.bytes.byteLength,
    kind: "template",
    source: parsed.data.source,
    tags: ["template", parsed.data.source],
  }).returning();
  if (!storedFile) return NextResponse.json({ error: "The template file could not be saved." }, { status: 500 });
  const [template] = await db.insert(templates).values({
    lineageId,
    name: parsed.data.name,
    kind: parsed.data.kind as TemplateKind,
    source: parsed.data.source as TemplateSource,
    format,
    fileId: storedFile.id,
    version,
    previousTemplateId,
    active,
    structure,
    mapping,
    mappingConfirmedAt: null,
    warnings: structure.warnings,
  }).returning();
  if (!template) return NextResponse.json({ error: "The template record could not be created." }, { status: 500 });
  return NextResponse.json({
    template: publicTemplate(template),
    candidates: candidates.map(({ template: candidate, score }) => ({ template: publicTemplate(candidate as typeof templates.$inferSelect), score })),
    remap: chosen ? remapByLabel({
      structure: chosen.template.structure as TemplateStructure,
      mapping: chosen.template.mapping as Record<string, { field?: string; confidence?: number; skipped?: boolean; columns?: Record<string, string> }>,
    }, structure) : null,
    usedAI,
  }, { status: 201 });
}
