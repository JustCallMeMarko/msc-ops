import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { templates } from "@/lib/db/schema";
import { normalizeLabel } from "./mapper";
import type { TemplateMapping, TemplateRecord, TemplateStructure } from "./types";

export function labelJaccard(left: TemplateStructure, right: TemplateStructure): number {
  const labels = (structure: TemplateStructure) => new Set(structure.targets
    .flatMap((target) => [target.label, ...(target.columns ?? []).map((column) => column.label)])
    .map(normalizeLabel)
    .filter(Boolean));
  const first = labels(left);
  const second = labels(right);
  if (!first.size || !second.size) return 0;
  const shared = [...first].filter((label) => second.has(label)).length;
  return shared / new Set([...first, ...second]).size;
}

export function matchReplacementCandidates<T extends { kind: string; format: string; active: boolean; structure: TemplateStructure }>(
  structure: TemplateStructure,
  candidates: T[],
  kind?: string,
): Array<{ template: T; score: number }> {
  const seenLineages = new Set<string>();
  return candidates
    .filter((candidate) => candidate.active && candidate.format === structure.format && (!kind || candidate.kind === kind))
    .map((template) => ({ template, score: labelJaccard(structure, template.structure) }))
    .filter(({ score }) => score >= 0.6)
    .sort((left, right) => right.score - left.score)
    .filter(({ template }) => {
      const lineageId = "lineageId" in template && typeof template.lineageId === "string"
        ? template.lineageId
        : "id" in template && typeof template.id === "string" ? template.id : JSON.stringify(template.structure);
      if (seenLineages.has(lineageId)) return false;
      seenLineages.add(lineageId);
      return true;
    });
}

export async function findReplacementCandidates(structure: TemplateStructure, kind?: string) {
  const { db } = await getDb();
  const rows = await db.select().from(templates).where(and(eq(templates.active, true), isNull(templates.deletedAt)));
  return matchReplacementCandidates(structure, rows as TemplateRecord[], kind);
}

export function remapByLabel(oldTemplate: Pick<TemplateRecord, "structure" | "mapping">, newStructure: TemplateStructure): {
  mapping: TemplateMapping;
  kept: Array<{ targetId: string; label: string; field?: string }>;
  added: Array<{ targetId: string; label: string }>;
  removed: Array<{ targetId: string; label: string; field?: string }>;
} {
  const oldByLabel = new Map(oldTemplate.structure.targets.map((target) => [
    normalizeLabel(target.label),
    { target, mapping: oldTemplate.mapping[target.id] },
  ]));
  const newLabels = new Set(newStructure.targets.map((target) => normalizeLabel(target.label)));
  const mapping: TemplateMapping = {};
  const kept: Array<{ targetId: string; label: string; field?: string }> = [];
  const added: Array<{ targetId: string; label: string }> = [];
  for (const target of newStructure.targets) {
    const previous = oldByLabel.get(normalizeLabel(target.label));
    if (previous?.mapping?.field) {
      const previousColumns = new Map((previous.target.columns ?? []).flatMap((column) => {
        const field = previous.mapping?.columns?.[String(column.index)];
        return field ? [[normalizeLabel(column.label), field] as const] : [];
      }));
      const columns = Object.fromEntries((target.columns ?? []).flatMap((column) => {
        const field = previousColumns.get(normalizeLabel(column.label));
        return field ? [[String(column.index), field] as const] : [];
      }));
      mapping[target.id] = {
        ...previous.mapping,
        ...(target.columns?.length ? { columns } : {}),
      };
      kept.push({ targetId: target.id, label: target.label, field: previous.mapping.field });
    } else {
      added.push({ targetId: target.id, label: target.label });
    }
  }
  const removed = oldTemplate.structure.targets
    .filter((target) => !newLabels.has(normalizeLabel(target.label)))
    .map((target) => ({
      targetId: target.id,
      label: target.label,
      ...(oldTemplate.mapping[target.id]?.field ? { field: oldTemplate.mapping[target.id]!.field } : {}),
    }));
  return { mapping, kept, added, removed };
}
