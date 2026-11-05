import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { financeEntrySchema } from "@/lib/finance/schemas";
import { TEMPLATE_KINDS } from "@/lib/templates/types";

const entrySuggestionSchema = z.object({
  accountId: z.string().uuid().optional(),
  eventRef: z.string().trim().max(160).optional(),
  kind: z.enum(["income", "expense", "transfer_out", "transfer_in"]),
  category: z.enum(["registration_fees", "sponsorship", "fundraising", "merch_sales", "dues", "venue", "food", "printing", "tokens", "transportation", "supplies", "bank_fees", "other"]),
  amountCentavos: z.number().int().positive(),
  occurredOn: z.string().date(),
  counterparty: z.string().max(200).optional(),
  description: z.string().max(2000),
  orNumber: z.string().max(120).optional(),
});

export const chatActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generate_doc"),
    templateKind: z.enum(TEMPLATE_KINDS),
    eventRef: z.string().trim().max(160).optional(),
  }),
  z.object({
    type: z.literal("edit_deadline_rule"),
    ruleRef: z.string().trim().min(1).max(160),
    days: z.number().int().min(-3650).max(3650),
  }),
  z.object({
    type: z.literal("draft_ledger_entry"),
    entry: entrySuggestionSchema,
  }),
  z.object({
    type: z.literal("map_template"),
    fileId: z.string().uuid(),
    replaceTemplateId: z.string().uuid().optional(),
  }),
]);

const actionProposalSchema = z.object({
  action: chatActionSchema.nullable(),
});

export type ChatAction = z.infer<typeof chatActionSchema>;

function parseJson(text: string): unknown | undefined {
  const cleaned = text.trim().replace(/^```(?:action|json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return undefined;
  }
}

export function parseChatAction(text: string) {
  const block = text.match(/```action\s*([\s\S]*?)```/i);
  if (!block) return { action: null, invalid: false, text };
  const parsed = parseJson(block[1] ?? "");
  const validated = chatActionSchema.safeParse(parsed);
  return {
    action: validated.success ? validated.data : null,
    invalid: !validated.success,
    text: text.replace(block[0], "").trim(),
  };
}

export async function proposeChatAction(model: LanguageModel, question: string, context: string) {
  const prompt = [
    "Requests to make, create, prepare, or generate a named document are explicit generate_doc actions.",
    "Do not return null for a document-generation request when a matching template appears in Context.",
    "Return exactly one JSON object with one property named action. Its value is null or one action object; never use an action type as a property key.",
    "For generate_doc, use this exact shape: {\"action\":{\"type\":\"generate_doc\",\"templateKind\":\"<allowed kind>\",\"eventRef\":\"<exact event name>\"}}.",
    "Use the exact matching event name from Context for eventRef.",
    "Other supported action objects:",
    `generate_doc templateKind values: ${TEMPLATE_KINDS.join(", ")}`,
    "{\"type\":\"edit_deadline_rule\",\"ruleRef\":\"<exact rule name>\",\"days\":<integer>}",
    "{\"type\":\"draft_ledger_entry\",\"entry\":<finance entry fields>}",
    "{\"type\":\"map_template\",\"fileId\":\"<uploaded file UUID>\",\"replaceTemplateId\":\"<template UUID, optional>\"}",
    "For no requested action, return {\"action\":null}. Do not include Markdown, prose, explanations, or other properties.",
    `Context: ${context}`,
    `User request: ${question}`,
  ].join("\n\n");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateText({
        model,
        prompt: attempt ? `${prompt}\n\nReturn only a valid JSON object matching the schema.` : prompt,
        output: Output.object({ schema: actionProposalSchema, name: "ChatActionProposal" }),
        maxRetries: 0,
      });
      const parsed = actionProposalSchema.safeParse(result.output);
      if (parsed.success) return { action: parsed.data.action, invalid: false };
    } catch {
      if (attempt === 1) return { action: null, invalid: true };
    }
  }
  return { action: null, invalid: true };
}

export function validateLedgerSuggestion(value: unknown) {
  return financeEntrySchema.safeParse(value);
}
