import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import DOMPurify from "isomorphic-dompurify";
import mammoth from "mammoth";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { appMeta, events, files, fileLinks, generatedDocs, templates } from "@/lib/db/schema";
import { readFileBlob, storeFileBlob } from "@/lib/files/storage";
import { formatPeso } from "@/lib/finance/logic";
import { dictionaryRegistry, loadDictionarySnapshot, resolveDictionaryField, type DictionaryContext } from "./dictionary";
import { fillDocx } from "./fill-docx";
import { fillPdf } from "./fill-pdf";
import { fillXlsx, previewXlsx } from "./fill-xlsx";
import type { EntityType, GenerationEntity, TemplateStructure } from "./types";

type TemplateRow = typeof templates.$inferSelect;
type ResolvedTarget = { id: string; field: string; value: unknown; type: string };

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashCanonicalData(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function extension(format: TemplateStructure["format"]) {
  return format === "docx" ? "docx" : format === "xlsx" ? "xlsx" : "pdf";
}

function mime(format: TemplateStructure["format"]) {
  return format === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/pdf";
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "Generated document";
}

async function entityTitle(entity: GenerationEntity) {
  if (entity.title) return entity.title;
  if (entity.type === "event") {
    const { db } = await getDb();
    const [event] = await db.select({ name: events.name }).from(events)
      .where(and(eq(events.id, entity.id), isNull(events.deletedAt))).limit(1);
    return event?.name ?? "Event";
  }
  return entity.type === "term" ? "Term report" : "Organization";
}

async function fileBytes(fileId: string) {
  const { db } = await getDb();
  const [file] = await db.select().from(files).where(and(eq(files.id, fileId), isNull(files.deletedAt))).limit(1);
  if (!file) throw new Error("Template file not found.");
  return { file, bytes: await readFileBlob(await getDataDir(), file.sha256) };
}

async function resolveTargets(template: TemplateRow, entity: GenerationEntity, askValues: Record<string, unknown>) {
  const structure = template.structure as TemplateStructure;
  const mapping = template.mapping as Record<string, { field?: string; skipped?: boolean; columns?: Record<string, string> }>;
  const dictionaryContext: DictionaryContext = {
    eventId: entity.type === "event" ? entity.id : undefined,
    termStart: entity.termStart,
    termEnd: entity.termEnd,
    askValues,
    snapshot: await loadDictionarySnapshot({
      eventId: entity.type === "event" ? entity.id : undefined,
      termStart: entity.termStart,
      termEnd: entity.termEnd,
    }),
  };
  const missing: Array<{ targetId: string; label: string; field?: string }> = [];
  const values: Record<string, unknown> = {};
  const cellValues: Record<string, { value: unknown; type?: "text" | "date" | "peso" | "number" | "rows" }> = {};
  const rowColumns: Record<string, Record<string, string>> = {};
  const resolved: ResolvedTarget[] = [];
  for (const target of structure.targets) {
    const entry = mapping[target.id];
    if (entry?.skipped) continue;
    if (!entry?.field) {
      missing.push({ targetId: target.id, label: target.label });
      continue;
    }
    const value = await resolveDictionaryField(entry.field, dictionaryContext);
    if (value === undefined || value === null || value === "") {
      missing.push({ targetId: target.id, label: target.label, field: entry.field });
      continue;
    }
    const dictionaryEntry = dictionaryRegistry[entry.field as keyof typeof dictionaryRegistry];
    const fieldType = dictionaryEntry?.type ?? (entry.field.startsWith("ask.") ? "text" : "text");
    let targetValue: unknown = value;
    if (target.kind === "rows" && entry.field.startsWith("ask.") && typeof value === "string") {
      try {
        targetValue = JSON.parse(value) as unknown;
      } catch {
        missing.push({ targetId: target.id, label: target.label, field: entry.field });
        continue;
      }
      if (!Array.isArray(targetValue)) {
        missing.push({ targetId: target.id, label: target.label, field: entry.field });
        continue;
      }
    }
    values[target.id] = fieldType === "peso" && typeof targetValue === "number" ? formatPeso(targetValue) : targetValue;
    cellValues[target.id] = { value: targetValue, type: target.kind === "rows" ? "rows" : fieldType };
    if (target.kind === "rows" && dictionaryEntry?.columns) {
      const columnMap: Record<string, string> = { ...(entry.columns ?? {}) };
      for (const column of target.columns ?? []) {
        if (columnMap[String(column.index)]) continue;
        const label = column.label.toLowerCase().replace(/[^a-z0-9]/g, "");
        const match = dictionaryEntry.columns.find((candidate) =>
          [candidate.label, ...(candidate.synonyms ?? [])]
            .some((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === label),
        );
        if (match) columnMap[String(column.index)] = match.key;
      }
      rowColumns[target.id] = columnMap;
    }
    resolved.push({ id: target.id, field: entry.field, value: targetValue, type: fieldType });
  }
  return { structure, values, cellValues, rowColumns, resolved, missing };
}

async function renderTemplate(template: TemplateRow, entity: GenerationEntity, askValues: Record<string, unknown>) {
  if (!template.mappingConfirmedAt) throw new Error("Confirm the template mapping before generating a document.");
  const { file, bytes } = await fileBytes(template.fileId);
  const resolved = await resolveTargets(template, entity, askValues);
  let output: Uint8Array;
  if (template.format === "docx") output = await fillDocx(bytes, resolved.structure, resolved.values, resolved.rowColumns);
  else if (template.format === "xlsx") output = await fillXlsx(bytes, resolved.structure, resolved.cellValues, resolved.rowColumns);
  else output = await fillPdf(bytes, resolved.structure, resolved.values);
  return { ...resolved, output, sourceFile: file };
}

export async function generate(input: {
  templateId: string;
  entity: GenerationEntity;
  askValues?: Record<string, unknown>;
  packetId?: string | null;
}) {
  const { db } = await getDb();
  const [template] = await db.select().from(templates)
    .where(and(eq(templates.id, input.templateId), isNull(templates.deletedAt))).limit(1);
  if (!template || !template.active) throw new Error("Active template not found.");
  const askValues = input.askValues ?? {};
  const storedContext = askValues.__entityContext && typeof askValues.__entityContext === "object"
    ? askValues.__entityContext as { termStart?: string; termEnd?: string }
    : {};
  const entity = {
    ...input.entity,
    termStart: input.entity.termStart ?? storedContext.termStart,
    termEnd: input.entity.termEnd ?? storedContext.termEnd,
  };
  const rendered = await renderTemplate(template, entity, askValues);
  if (rendered.missing.length) return { missing: rendered.missing };
  if (!rendered.output || !rendered.sourceFile) throw new Error("The template could not be filled.");
  const entityName = await entityTitle(entity);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const originalName = safeFilename(`${template.name} - ${entityName} - ${today}.${extension(template.format as TemplateStructure["format"])}`);
  const sha256 = await storeFileBlob(await getDataDir(), rendered.output);
  const [file] = await db.insert(files).values({
    sha256,
    originalName,
    mime: mime(template.format as TemplateStructure["format"]),
    size: rendered.output.byteLength,
    kind: "generated",
    source: template.source === "builtin" ? "org" : template.source,
    version: 1,
    tags: ["generated"],
  }).returning();
  if (!file) throw new Error("Could not save the generated file.");
  const generatedEntityId = entity.type === "org" ? await organizationEntityId() : entity.id;
  await db.insert(fileLinks).values([
    { fileId: file.id, entityType: entity.type, entityId: generatedEntityId, role: "generated" },
    { fileId: file.id, entityType: "template", entityId: template.id, role: "generated_from" },
  ]);
  const [generatedDoc] = await db.insert(generatedDocs).values({
    templateId: template.id,
    templateVersion: template.version,
    fileId: file.id,
    entityType: entity.type,
    entityId: generatedEntityId,
    dataHash: hashCanonicalData(rendered.resolved),
    askValues: { ...askValues, __entityContext: { termStart: entity.termStart ?? null, termEnd: entity.termEnd ?? null } },
    packetId: input.packetId ?? null,
  }).returning();
  return { file, generatedDoc, missing: [] };
}

async function organizationEntityId() {
  const { db } = await getDb();
  const [record] = await db.select().from(appMeta).where(eq(appMeta.key, "organization_entity_id")).limit(1);
  const existing = record?.value ? String(record.value).replace(/^"|"$/g, "") : "";
  if (existing) return existing;
  const { uuidv7 } = await import("uuidv7");
  const id = uuidv7();
  await db.insert(appMeta).values({ key: "organization_entity_id", value: id }).onConflictDoNothing();
  const [saved] = await db.select().from(appMeta).where(eq(appMeta.key, "organization_entity_id")).limit(1);
  return saved ? String(saved.value).replace(/^"|"$/g, "") : id;
}

export async function isStale(generatedDoc: typeof generatedDocs.$inferSelect) {
  const { db } = await getDb();
  const [template] = await db.select().from(templates)
    .where(eq(templates.id, generatedDoc.templateId)).limit(1);
  if (!template) return true;
  const entity: GenerationEntity = {
    type: generatedDoc.entityType as EntityType,
    id: generatedDoc.entityId,
    termStart: (generatedDoc.askValues as Record<string, { termStart?: string }>).__entityContext?.termStart,
    termEnd: (generatedDoc.askValues as Record<string, { termEnd?: string }>).__entityContext?.termEnd,
  };
  const askValues = { ...(generatedDoc.askValues as Record<string, unknown>) };
  delete askValues.__entityContext;
  const result = await resolveTargets(template, entity, askValues);
  return hashCanonicalData(result.resolved) !== generatedDoc.dataHash;
}

export async function preview(input: {
  templateId: string;
  entity: GenerationEntity;
  askValues?: Record<string, unknown>;
}) {
  const { db } = await getDb();
  const [template] = await db.select().from(templates)
    .where(and(eq(templates.id, input.templateId), isNull(templates.deletedAt))).limit(1);
  if (!template) throw new Error("Template not found.");
  const rendered = await renderTemplate(template, input.entity, input.askValues ?? {});
  if (!rendered.output) throw new Error("The template preview could not be rendered.");
  if (template.format === "docx") {
    const converted = await mammoth.convertToHtml({ buffer: Buffer.from(rendered.output) });
    return {
      missing: rendered.missing,
      type: "docx",
      html: DOMPurify.sanitize(converted.value, { USE_PROFILES: { html: true } }),
      warnings: converted.messages.map((message) => message.message),
    };
  }
  if (template.format === "xlsx") {
    const { bytes } = await fileBytes(template.fileId);
    return {
      missing: rendered.missing,
      type: "xlsx",
      ...await previewXlsx(bytes, rendered.structure, rendered.cellValues, rendered.missing.map((item) => item.targetId), rendered.rowColumns),
    };
  }
  return {
    missing: rendered.missing,
    type: "pdf_form",
    data: Buffer.from(rendered.output).toString("base64"),
    mime: "application/pdf",
  };
}

export async function buildFilledPreview(templateId: string, entity: GenerationEntity, askValues: Record<string, unknown> = {}) {
  const { db } = await getDb();
  const [template] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
  if (!template) throw new Error("Template not found.");
  const rendered = await renderTemplate(template, entity, askValues);
  return {
    bytes: rendered.output,
    mime: mime(template.format as TemplateStructure["format"]),
    filename: `${safeFilename(template.name)}.${extension(template.format as TemplateStructure["format"])}`,
    missing: rendered.missing,
  };
}
