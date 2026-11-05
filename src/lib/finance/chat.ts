import type { z } from "zod";
import { financeEntrySchema } from "./schemas";
import { FINANCE_GUIDES } from "./guides";

const validStepIds = new Set(FINANCE_GUIDES.flatMap((guide) => guide.steps.map((step) => `${guide.key}:${step.key}`)));

export function stripInvalidGuideCitations(text: string): { text: string; sourceIds: string[] } {
  const sourceIds = new Set<string>();
  const cleaned = text.replace(/\[([a-z0-9_]+):([a-z0-9_]+)\]/gi, (match, guide: string, step: string) => {
    const id = `${guide}:${step}`;
    if (!validStepIds.has(id)) return "";
    sourceIds.add(id);
    return match;
  });
  return { text: cleaned, sourceIds: [...sourceIds] };
}

export function parseEntryDraft(text: string): {
  text: string;
  draft: z.infer<typeof financeEntrySchema> | null;
  invalidBlock: boolean;
} {
  const match = text.match(/```entry\s*([\s\S]*?)```/i);
  if (!match) return { text, draft: null, invalidBlock: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { text, draft: null, invalidBlock: true };
  }
  const validated = financeEntrySchema.safeParse(parsed);
  if (!validated.success) return { text, draft: null, invalidBlock: true };
  return { text: text.replace(match[0], "").trim(), draft: validated.data, invalidBlock: false };
}
