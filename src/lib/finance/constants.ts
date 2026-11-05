export const FINANCE_CATEGORIES = [
  "registration_fees",
  "sponsorship",
  "fundraising",
  "merch_sales",
  "dues",
  "venue",
  "food",
  "printing",
  "tokens",
  "transportation",
  "supplies",
  "bank_fees",
  "other",
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

export const FINANCE_CATEGORY_LABELS: Record<FinanceCategory, string> = {
  registration_fees: "Registration fees",
  sponsorship: "Sponsorship",
  fundraising: "Fundraising",
  merch_sales: "Merchandise sales",
  dues: "Dues",
  venue: "Venue",
  food: "Food",
  printing: "Printing",
  tokens: "Tokens",
  transportation: "Transportation",
  supplies: "Supplies",
  bank_fees: "Bank fees",
  other: "Other",
};

export const FINANCE_KIND_LABELS = {
  income: "Income",
  expense: "Expense",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  void: "Void",
  restore: "Restore",
} as const;

export type FinanceKind = keyof typeof FINANCE_KIND_LABELS;
