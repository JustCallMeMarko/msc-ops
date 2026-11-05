import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { DICTIONARY_KEYS, dictionaryRegistry } from "./dictionary";
import type { TemplateMapping, TemplateStructure } from "./types";

const tokens = (value: string) => new Set(
  value.toLocaleLowerCase("en").replace(/[._-]/g, " ").match(/[a-z0-9]+/g) ?? [],
);

export function normalizeLabel(value: string): string {
  return [...tokens(value)].sort().join(" ");
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / new Set([...left, ...right]).size;
}

function fieldScore(label: string, field: (typeof DICTIONARY_KEYS)[number]): number {
  const entry = dictionaryRegistry[field];
  const left = tokens(label);
  const names = [
    entry.label,
    ...entry.synonyms,
    ...(entry.columns ?? []).flatMap((column) => [column.label, ...(column.synonyms ?? [])]),
  ];
  return Math.max(...names.map((name) => jaccard(left, tokens(name))));
}

function targetFieldScore(
  target: TemplateStructure["targets"][number],
  field: (typeof DICTIONARY_KEYS)[number],
): number {
  const entry = dictionaryRegistry[field];
  if ((target.kind === "rows") !== (entry.type === "rows")) return 0;
  const columnScore = Math.max(0, ...(target.columns ?? []).flatMap((column) =>
    (entry.columns ?? []).flatMap((dictionaryColumn) =>
      [dictionaryColumn.label, ...(dictionaryColumn.synonyms ?? [])]
        .map((name) => jaccard(tokens(column.label), tokens(name))),
    ),
  ));
  return Math.max(fieldScore(target.label, field), columnScore);
}

export function heuristicMap(structure: TemplateStructure): TemplateMapping {
  const mapping: TemplateMapping = {};
  for (const target of structure.targets) {
    let bestField: string | undefined;
    let confidence = 0;
    for (const key of DICTIONARY_KEYS) {
      const score = targetFieldScore(target, key);
      if (score > confidence) {
        confidence = score;
        bestField = key;
      }
    }
    mapping[target.id] = confidence >= 0.5 && bestField
      ? { field: bestField, confidence: Number(confidence.toFixed(3)) }
      : { confidence: Number(confidence.toFixed(3)) };
  }
  return mapping;
}

const dynamicField = z.string().regex(/^ask\.[a-z0-9_]{1,60}$/);
const validField = z.union([z.enum(DICTIONARY_KEYS), dynamicField]);

function responseSchema(targetIds: string[]) {
  return z.record(z.string(), z.unknown()).transform((record) => {
    const result: Record<string, string> = {};
    for (const [id, value] of Object.entries(record)) {
      if (!targetIds.includes(id) || typeof value !== "string") continue;
      const parsed = validField.safeParse(value);
      if (parsed.success) result[id] = parsed.data;
    }
    return result;
  });
}

function parseMapping(text: string, targetIds: string[]): Record<string, string> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const validated = responseSchema(targetIds).safeParse(parsed);
  return validated.success ? validated.data : null;
}

export function buildMappingPrompt(structure: TemplateStructure): string {
  const targets = structure.targets.map((target) => ({
    id: target.id,
    label: target.label,
    kind: target.kind,
    columns: target.columns?.map(({ index, label }) => ({ index, label })),
  }));
  return [
    "You are a JSON mapping function. Map each target ID to the closest field key from the supplied dictionary.",
    "Return exactly one valid JSON object, with target IDs as keys and one exact dictionary key string as each value.",
    "Do not return Markdown, prose, labels, explanations, nested objects, or keys that are not target IDs.",
    "Omit targets that cannot be mapped confidently. Return {} if none can be mapped.",
    "Match target kinds to dictionary types. A rows target must use a rows field; compare its columns with the dictionary columns.",
    `Dictionary: ${JSON.stringify(DICTIONARY_KEYS.map((key) => ({
      key,
      label: dictionaryRegistry[key].label,
      type: dictionaryRegistry[key].type,
      columns: dictionaryRegistry[key].columns?.map(({ key: columnKey, label, type }) => ({ key: columnKey, label, type })),
    })))}`,
    `Targets: ${JSON.stringify(targets)}`,
  ].join("\n");
}

export async function aiMap(
  structure: TemplateStructure,
  model?: LanguageModel,
): Promise<{ mapping: TemplateMapping; usedAI: boolean }> {
  const fallback = heuristicMap(structure);
  if (!model) return { mapping: fallback, usedAI: false };
  const targetIds = structure.targets.map((target) => target.id);
  const prompt = buildMappingPrompt(structure);
  let proposed: Record<string, string> | null = null;
  for (let attempt = 0; attempt < 2 && !proposed; attempt += 1) {
    try {
      const result = await generateText({
        model,
        prompt: attempt ? `${prompt}\nReturn only a valid JSON object in the required format.` : prompt,
        output: Output.object({ schema: z.record(z.string(), z.string()), name: "TemplateMapping" }),
        maxRetries: 0,
      });
      proposed = parseMapping(JSON.stringify(result.output), targetIds);
    } catch {
      if (attempt === 1) break;
    }
  }
  if (!proposed) return { mapping: fallback, usedAI: false };
  for (const [targetId, field] of Object.entries(proposed)) {
    fallback[targetId] = { field, confidence: 1 };
  }
  return { mapping: fallback, usedAI: true };
}
