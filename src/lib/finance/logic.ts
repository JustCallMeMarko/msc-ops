import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { FINANCE_CATEGORIES, FINANCE_CATEGORY_LABELS, type FinanceCategory, type FinanceKind } from "./constants";
import { FINANCE_GUIDES } from "./guides";

export type LedgerEntry = {
  id: string;
  seq: number;
  accountId: string;
  eventId: string | null;
  kind: FinanceKind;
  category: FinanceCategory;
  amountCentavos: number;
  occurredOn: string;
  targetEntryId: string | null;
  replacesEntryId: string | null;
};

export function parsePeso(value: string): number | null {
  const normalized = value.trim().replace(/^(?:₱|PHP)\s*/i, "").trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.replaceAll(",", "").split(".");
  const centavos = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return centavos <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(centavos) : null;
}

export function formatPeso(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) throw new TypeError("Centavos must be a safe integer.");
  const amount = BigInt(centavos);
  const negative = amount < BigInt(0);
  const absolute = negative ? -amount : amount;
  const whole = (absolute / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (absolute % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}₱${whole}.${fraction}`;
}

function amountSign(kind: FinanceKind): number {
  if (kind === "income" || kind === "transfer_in") return 1;
  if (kind === "expense" || kind === "transfer_out") return -1;
  return 0;
}

export function effectiveEntries<T extends LedgerEntry>(entries: readonly T[]): T[] {
  const restoredVoidIds = new Set(entries.filter((entry) => entry.kind === "restore" && entry.targetEntryId).map((entry) => entry.targetEntryId));
  const voidedEntryIds = new Set(entries
    .filter((entry) => entry.kind === "void" && !restoredVoidIds.has(entry.id))
    .map((entry) => entry.targetEntryId)
    .filter((id): id is string => Boolean(id)));
  const replacedEntryIds = new Set(entries.map((entry) => entry.replacesEntryId).filter((id): id is string => Boolean(id)));
  return entries.filter((entry) =>
    amountSign(entry.kind) !== 0 && !voidedEntryIds.has(entry.id) && !replacedEntryIds.has(entry.id),
  );
}

export function accountBalances(entries: readonly LedgerEntry[]): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const entry of effectiveEntries(entries)) {
    balances[entry.accountId] = (balances[entry.accountId] ?? 0) + amountSign(entry.kind) * entry.amountCentavos;
  }
  return balances;
}

export function runningBalance(entries: readonly LedgerEntry[]): Array<{ entry: LedgerEntry; balanceCentavos: number }> {
  const effectiveIds = new Set(effectiveEntries(entries).map((entry) => entry.id));
  const balances: Record<string, number> = {};
  return [...entries].sort((a, b) => a.seq - b.seq).map((entry) => {
    if (effectiveIds.has(entry.id)) {
      balances[entry.accountId] = (balances[entry.accountId] ?? 0) + amountSign(entry.kind) * entry.amountCentavos;
    }
    return { entry, balanceCentavos: balances[entry.accountId] ?? 0 };
  });
}

export type EventTotal = { eventId: string; incomeCentavos: number; expenseCentavos: number; netCentavos: number };

export function eventTotals(entries: readonly LedgerEntry[]): Record<string, EventTotal> {
  const totals: Record<string, EventTotal> = {};
  for (const entry of effectiveEntries(entries)) {
    if (!entry.eventId || (entry.kind !== "income" && entry.kind !== "expense")) continue;
    const total = totals[entry.eventId] ??= { eventId: entry.eventId, incomeCentavos: 0, expenseCentavos: 0, netCentavos: 0 };
    if (entry.kind === "income") total.incomeCentavos += entry.amountCentavos;
    else total.expenseCentavos += entry.amountCentavos;
    total.netCentavos = total.incomeCentavos - total.expenseCentavos;
  }
  return totals;
}

export type BudgetLine = { category: FinanceCategory; plannedCentavos: number; note?: string };
export type BudgetVariance = {
  category: FinanceCategory;
  plannedCentavos: number;
  actualCentavos: number;
  varianceCentavos: number;
};

export function budgetVsActual(budgets: readonly BudgetLine[], entries: readonly LedgerEntry[]): BudgetVariance[] {
  const actuals: Partial<Record<FinanceCategory, number>> = {};
  for (const entry of effectiveEntries(entries)) {
    if (entry.kind === "expense") actuals[entry.category] = (actuals[entry.category] ?? 0) + entry.amountCentavos;
  }
  const planned = new Map(budgets.map((line) => [line.category, line.plannedCentavos]));
  const categories = new Set<FinanceCategory>([...planned.keys(), ...Object.keys(actuals) as FinanceCategory[]]);
  return [...categories].sort().map((category) => {
    const plannedCentavos = planned.get(category) ?? 0;
    const actualCentavos = actuals[category] ?? 0;
    return { category, plannedCentavos, actualCentavos, varianceCentavos: plannedCentavos - actualCentavos };
  });
}

export function missingReceipts<T extends LedgerEntry>(entries: readonly T[], activeReceiptEntryIds: ReadonlySet<string>): T[] {
  return effectiveEntries(entries).filter((entry) => entry.kind === "expense" && !activeReceiptEntryIds.has(entry.id));
}

export type Liquidation = {
  status: "open" | "submitted" | "approved";
  entryIds?: readonly string[];
};

export type LiquidationResult = {
  eventId: string;
  unliquidatedCentavos: number;
  dueAt: string | null;
  overdue: boolean;
};

export function liquidationState(
  event: { id: string },
  entries: readonly LedgerEntry[],
  liquidation: Liquidation | null | undefined,
  checklist: readonly { eventId: string; ruleKey?: string | null; title?: string; dueAt?: Date | string | null }[],
  now = new Date(),
): LiquidationResult {
  const itemIds = new Set(liquidation?.entryIds ?? []);
  const expenses = effectiveEntries(entries).filter((entry) => entry.eventId === event.id && entry.kind === "expense" && !itemIds.has(entry.id));
  const dueItem = checklist.find((item) => item.eventId === event.id && (item.ruleKey === "liquidation" || item.title?.toLowerCase().includes("liquidation")));
  const dueAt = dueItem?.dueAt ? (dueItem.dueAt instanceof Date ? dueItem.dueAt.toISOString() : dueItem.dueAt) : null;
  return {
    eventId: event.id,
    unliquidatedCentavos: expenses.reduce((sum, entry) => sum + entry.amountCentavos, 0),
    dueAt,
    overdue: Boolean(dueAt && liquidation?.status !== "approved" && expenses.length && new Date(dueAt).getTime() < now.getTime()),
  };
}

export type FinanceAction = { guide: string; step: string } | { href: string };
export type FinanceActionItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  dueAt?: string;
  action: FinanceAction;
};

export type FinanceState = {
  accounts: Array<{ id: string; name: string; kind: "bank" | "cash" | "ewallet"; archivedAt?: Date | string | null; balanceCentavos?: number }>;
  liquidations: Array<{ eventId: string; eventName: string; status?: string; unliquidatedCentavos: number; dueAt: string | null; overdue: boolean }>;
  missingReceiptCount: number;
  auditDate?: string | null;
  events: Array<{ id: string; name: string; hasFee?: boolean }>;
  guideProgress: Array<{ guideKey: string; stepKey: string; doneAt?: Date | string | null }>;
  reconciliations: Array<{ accountId: string; statementDate: string }>;
  budgets: Array<{ eventId: string; eventName: string; category: FinanceCategory; plannedCentavos: number; actualCentavos: number }>;
};

const severityRank = { critical: 0, warning: 1, info: 2 } as const;

function daysFrom(now: Date, date: string): number {
  return differenceInCalendarDays(parseISO(date.slice(0, 10)), new Date(format(now, "yyyy-MM-dd")));
}

function relativeDate(days: number): string {
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "today";
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

export function whatToDoNow(state: FinanceState, now = new Date()): FinanceActionItem[] {
  const items: FinanceActionItem[] = [];
  const activeAccounts = state.accounts.filter((account) => !account.archivedAt);
  const bankAccounts = activeAccounts.filter((account) => account.kind === "bank");
  if (!bankAccounts.length) {
    items.push({
      id: "finance-bank-account",
      severity: "warning",
      title: "No bank account yet: start the bank account guide",
      detail: "Set up the organization account and required signatories.",
      action: { guide: "bank_account", step: "prepare" },
    });
  }

  for (const liquidation of state.liquidations) {
    if (!liquidation.unliquidatedCentavos || !liquidation.dueAt || liquidation.status === "approved") continue;
    const days = daysFrom(now, liquidation.dueAt);
    if (days < 0) {
      items.push({
        id: `liquidation-overdue-${liquidation.eventId}`,
        severity: "critical",
        title: `${liquidation.eventName} liquidation is overdue`,
        detail: `${formatPeso(liquidation.unliquidatedCentavos)} remains unliquidated; ${relativeDate(days)}.`,
        dueAt: liquidation.dueAt,
        action: { href: `/finance?tab=liquidations&event=${liquidation.eventId}` },
      });
    } else if (days <= 5) {
      items.push({
        id: `liquidation-due-${liquidation.eventId}`,
        severity: "warning",
        title: `${liquidation.eventName} has ${formatPeso(liquidation.unliquidatedCentavos)} unliquidated`,
        detail: `Due ${relativeDate(days)}.`,
        dueAt: liquidation.dueAt,
        action: { href: `/finance?tab=liquidations&event=${liquidation.eventId}` },
      });
    }
  }

  if (state.missingReceiptCount > 0) {
    const days = state.auditDate ? daysFrom(now, state.auditDate) : null;
    const auditSoon = days !== null && days <= 14;
    items.push({
      id: "finance-missing-receipts",
      severity: auditSoon ? "critical" : "warning",
      title: auditSoon ? `Audit ${relativeDate(days)}: ${state.missingReceiptCount} receipts missing` : `${state.missingReceiptCount} receipts missing`,
      detail: "Attach receipts to the affected expense entries.",
      ...(state.auditDate ? { dueAt: state.auditDate } : {}),
      action: { href: "/finance?tab=ledger&q=is%3Amissing-receipt" },
    });
  }

  const fundraisingGuide = FINANCE_GUIDES.find((guide) => guide.key === "fundraising_approval");
  for (const event of state.events.filter((row) => row.hasFee)) {
    const allDone = fundraisingGuide?.steps.every((step) =>
      state.guideProgress.some((progress) => progress.guideKey === fundraisingGuide.key && progress.stepKey === step.key && progress.doneAt),
    ) ?? false;
    if (!allDone) {
      items.push({
        id: `fundraising-guide-${event.id}`,
        severity: "warning",
        title: `${event.name} charges a fee`,
        detail: "Review the fundraising approval guide and fee records.",
        action: { guide: "fundraising_approval", step: "approval" },
      });
    }
  }

  for (const account of bankAccounts) {
    const latest = state.reconciliations
      .filter((reconciliation) => reconciliation.accountId === account.id)
      .sort((a, b) => b.statementDate.localeCompare(a.statementDate))[0];
    if (!latest || daysFrom(now, latest.statementDate) > 30) {
      items.push({
        id: `reconcile-${account.id}`,
        severity: "info",
        title: `Reconcile ${account.name}`,
        detail: "No bank reconciliation in the last 30 days.",
        action: { href: `/finance?tab=reconcile&account=${account.id}` },
      });
    }
  }

  for (const account of activeAccounts.filter((row) => (row.balanceCentavos ?? 0) < 0)) {
    items.push({
      id: `negative-balance-${account.id}`,
      severity: "critical",
      title: `${account.name} has a negative balance`,
      detail: `Balance: ${formatPeso(account.balanceCentavos ?? 0)}.`,
      action: { href: "/finance?tab=ledger" },
    });
  }

  const budgetOverages = new Map<string, { eventName: string; amountCentavos: number; categories: Set<FinanceCategory> }>();
  for (const budget of state.budgets.filter((row) => row.actualCentavos > row.plannedCentavos)) {
    const overage = budgetOverages.get(budget.eventId) ?? {
      eventName: budget.eventName,
      amountCentavos: 0,
      categories: new Set<FinanceCategory>(),
    };
    overage.amountCentavos += budget.actualCentavos - budget.plannedCentavos;
    overage.categories.add(budget.category);
    budgetOverages.set(budget.eventId, overage);
  }
  for (const [eventId, overage] of budgetOverages) {
    const categories = FINANCE_CATEGORIES
      .filter((category) => overage.categories.has(category))
      .map((category) => FINANCE_CATEGORY_LABELS[category].toLowerCase());
    items.push({
      id: `budget-over-${eventId}`,
      severity: "info",
      title: `${overage.eventName} is ${formatPeso(overage.amountCentavos)} over budget (${categories.join(", ")})`,
      detail: "Review the event budget and actual expenses by category.",
      action: { href: `/finance?tab=budgets&event=${eventId}` },
    });
  }

  return items.sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity]
    || (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity)
    || a.title.localeCompare(b.title),
  );
}

export function isFinanceCategory(value: string): value is FinanceCategory {
  return (FINANCE_CATEGORIES as readonly string[]).includes(value);
}
