import { z } from "zod";
import { FINANCE_CATEGORIES } from "./constants";

export const financeAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["bank", "cash", "ewallet"]),
  bankName: z.string().trim().max(120).nullable().optional(),
  accountLast4: z.string().regex(/^\d{4}$/).nullable().optional(),
  openedAt: z.string().date().nullable().optional(),
  signatoryMemberIds: z.array(z.string().uuid()).max(10).default([]),
});

export const financeEntrySchema = z.object({
  accountId: z.string().uuid(),
  eventId: z.string().uuid().nullable().default(null),
  kind: z.enum(["income", "expense"]),
  category: z.enum(FINANCE_CATEGORIES),
  amountCentavos: z.number().int().positive().safe(),
  occurredOn: z.string().date(),
  counterparty: z.string().max(200).default(""),
  description: z.string().trim().max(2000).default(""),
  orNumber: z.string().trim().max(120).default(""),
  approvedByMemberId: z.string().uuid().nullable().default(null),
});

export const financeTransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  eventId: z.string().uuid().nullable().default(null),
  amountCentavos: z.number().int().positive().safe(),
  occurredOn: z.string().date(),
  description: z.string().trim().max(2000).default(""),
  orNumber: z.string().trim().max(120).default(""),
});

export const financeCorrectionSchema = financeEntrySchema.extend({
  reason: z.string().trim().min(1).max(2000),
});

export const financeReasonSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export const budgetLineSchema = z.object({
  eventId: z.string().uuid(),
  category: z.enum(FINANCE_CATEGORIES),
  plannedCentavos: z.number().int().nonnegative().safe(),
  note: z.string().max(2000).default(""),
});

export const reconciliationSchema = z.object({
  accountId: z.string().uuid(),
  statementDate: z.string().date(),
  statementBalanceCentavos: z.number().int().safe(),
  note: z.string().max(2000).default(""),
});

export const guideProgressSchema = z.object({
  guideKey: z.string().min(1).max(80),
  stepKey: z.string().min(1).max(80),
  done: z.boolean(),
  note: z.string().max(2000).default(""),
});
