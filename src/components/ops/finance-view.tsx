"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertIcon, DownloadIcon, InfoIcon, PlusIcon, ShieldCheckIcon } from "@primer/octicons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FilterBar } from "@/components/patterns/filter-bar";
import { Label } from "@/components/patterns/label";
import { toastUndo } from "@/components/patterns/toast-undo";
import { apiFetch } from "@/lib/api-client";
import { FINANCE_CATEGORIES, FINANCE_CATEGORY_LABELS } from "@/lib/finance/constants";
import { formatPeso, parsePeso } from "@/lib/finance/logic";
import { FINANCE_GUIDES } from "@/lib/finance/guides";

type Account = { id: string; name: string; kind: string; bankName: string | null; accountLast4: string | null; archivedAt: string | null; balanceCentavos: number };
type Action = { id: string; severity: "critical" | "warning" | "info"; title: string; detail: string; dueAt?: string; action: { guide: string; step: string } | { href: string } };
type Summary = { accounts: Account[]; totalBalanceCentavos: number; unliquidatedCentavos: number; missingReceiptCount: number; whatToDoNow: Action[]; budgets: Array<{ eventId: string; eventName: string; category: string; plannedCentavos: number; actualCentavos: number; varianceCentavos: number }>; liquidations: Array<{ eventId: string; eventName: string; dueAt: string | null; overdue: boolean; unliquidatedCentavos: number; status: string }> };
type Entry = { id: string; seq: number; accountId: string; eventId: string | null; kind: string; category: string; amountCentavos: number; occurredOn: string; counterparty: string; description: string; orNumber: string; reason: string; targetEntryId: string | null; replacesEntryId: string | null; event?: { name: string } | null; account?: { name: string } | null; runningBalanceCentavos: number; receiptCount: number; missingReceipt: boolean; hash: string };
type EventOption = { id: string; name: string; slug: string };
type EntryForm = { kind: "expense" | "income" | "transfer"; amount: string; category: string; eventId: string; accountId: string; fromAccountId: string; toAccountId: string; occurredOn: Date; description: string; orNumber: string };
type Receipt = { id: string; fileId: string; addedAt: string; file: { originalName: string; mime: string; size: number } };
type Liquidation = NonNullable<Summary["liquidations"]>[number] & { entries: Entry[] };
type Reconciliation = { reconciliation: { id: string; statementDate: string; statementBalanceCentavos: number; computedBalanceCentavos: number; note: string }; account: { id: string; name: string } };
type CorrectionForm = { amount: string; category: string; occurredOn: string; description: string; orNumber: string; reason: string };

const tabs = ["overview", "ledger", "budgets", "liquidations", "guides", "reconcile"] as const;
const tabLabels: Record<(typeof tabs)[number], string> = { overview: "Overview", ledger: "Ledger", budgets: "Budgets", liquidations: "Liquidations", guides: "Guides", reconcile: "Reconcile" };
const kindLabels: Record<string, string> = { income: "Income", expense: "Expense", transfer_in: "Transfer in", transfer_out: "Transfer out", void: "Void", restore: "Restore" };
const severityStyle = { critical: "border-destructive/40 bg-destructive/10 text-destructive", warning: "border-attention/40 bg-attention/10 text-attention", info: "border-border bg-secondary text-muted-foreground" };
const pesos = (value: number) => formatPeso(value);
const displayDay = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(new Date(value)) : "Not set";

export function FinanceView() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedTab = params.get("tab") as (typeof tabs)[number] | null;
  const tab = selectedTab && tabs.includes(selectedTab) ? selectedTab : "overview";
  const selectedGuideKey = params.get("guide") ?? "";
  const selectedStepKey = params.get("step") ?? "";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [progress, setProgress] = useState<Array<{ guideKey: string; stepKey: string; doneAt: string | null }>>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [relatedEntries, setRelatedEntries] = useState<Entry[]>([]);
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [computedBalanceCentavos, setComputedBalanceCentavos] = useState<number | null>(null);
  const [entryForm, setEntryForm] = useState<EntryForm>({ kind: "expense", amount: "", category: "other", eventId: "", accountId: "", fromAccountId: "", toAccountId: "", occurredOn: new Date(), description: "", orNumber: "" });
  const [showAllActions, setShowAllActions] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [restoreReason, setRestoreReason] = useState("");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correction, setCorrection] = useState<CorrectionForm>({ amount: "", category: "other", occurredOn: "", description: "", orNumber: "", reason: "" });
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [reconcile, setReconcile] = useState({ accountId: "", date: new Date(), amount: "", note: "" });
  const [budget, setBudget] = useState({ eventId: "", category: "other", amount: "", note: "" });
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const query = params.get("q") ?? "";

  useEffect(() => {
    if (!selectedGuideKey || !selectedStepKey) return;
    document.getElementById(`finance-guide-step-${selectedGuideKey}-${selectedStepKey}`)?.scrollIntoView({ block: "center" });
  }, [selectedGuideKey, selectedStepKey]);

  const load = useCallback(async () => {
    const [summaryResponse, entriesResponse, eventResponse, progressResponse, liquidationsResponse, reconciliationsResponse] = await Promise.all([
      fetch("/api/finance/summary"),
      fetch(`/api/finance/entries?q=${encodeURIComponent(query)}`),
      fetch("/api/events"),
      fetch("/api/finance/guide-progress"),
      fetch("/api/finance/liquidations"),
      fetch("/api/finance/reconciliations"),
    ]);
    if (summaryResponse.ok) {
      const next = await summaryResponse.json() as Summary;
      const activeAccounts = next.accounts.filter((account) => !account.archivedAt);
      const defaultFromAccountId = activeAccounts.find((account) => account.kind === "bank")?.id || activeAccounts[0]?.id || "";
      setSummary(next);
      setEntryForm((current) => ({
        ...current,
        accountId: current.accountId || activeAccounts[0]?.id || "",
        fromAccountId: current.fromAccountId || defaultFromAccountId,
        toAccountId: current.toAccountId || activeAccounts.find((account) => account.id !== defaultFromAccountId)?.id || "",
      }));
    }
    if (entriesResponse.ok) setEntries(await entriesResponse.json() as Entry[]);
    if (eventResponse.ok) setEvents(await eventResponse.json() as EventOption[]);
    if (progressResponse.ok) setProgress(await progressResponse.json());
    if (liquidationsResponse.ok) setLiquidations(await liquidationsResponse.json() as Liquidation[]);
    if (reconciliationsResponse.ok) setReconciliations(await reconciliationsResponse.json() as Reconciliation[]);
    setLoading(false);
  }, [query]);
  useEffect(() => { void load(); }, [load]);
  const activeEntry = entries.find((entry) => entry.id === params.get("id"));
  useEffect(() => {
    if (!activeEntry) {
      setReceipts([]);
      setRelatedEntries([]);
      return;
    }
    setVoidReason("");
    setRestoreReason("");
    setCorrectionOpen(false);
    setCorrection({
      amount: formatPeso(activeEntry.amountCentavos),
      category: activeEntry.category,
      occurredOn: activeEntry.occurredOn,
      description: activeEntry.description,
      orNumber: activeEntry.orNumber,
      reason: "",
    });
    void Promise.all([
      fetch(`/api/finance/entries/${activeEntry.id}/receipts`).then((response) => response.ok ? response.json() as Promise<Receipt[]> : []),
      fetch("/api/finance/entries?q=is%3Avoided").then((response) => response.ok ? response.json() as Promise<Entry[]> : []),
    ]).then(([nextReceipts, voidedEntries]) => {
      setReceipts(nextReceipts);
      const all = new Map([...entries, ...voidedEntries].map((entry) => [entry.id, entry]));
      const relatedIds = new Set([activeEntry.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const entry of all.values()) {
          if ((entry.targetEntryId && relatedIds.has(entry.targetEntryId))
            || (entry.replacesEntryId && relatedIds.has(entry.replacesEntryId))
            || (relatedIds.has(entry.id) && (entry.targetEntryId || entry.replacesEntryId))) {
            if (!relatedIds.has(entry.id)) {
              relatedIds.add(entry.id);
              changed = true;
            }
            if (entry.targetEntryId && !relatedIds.has(entry.targetEntryId)) {
              relatedIds.add(entry.targetEntryId);
              changed = true;
            }
            if (entry.replacesEntryId && !relatedIds.has(entry.replacesEntryId)) {
              relatedIds.add(entry.replacesEntryId);
              changed = true;
            }
          }
        }
      }
      setRelatedEntries(Array.from(all.values()).filter((entry) => relatedIds.has(entry.id) && entry.id !== activeEntry.id).sort((a, b) => a.seq - b.seq));
    }).catch(() => {
      setReceipts([]);
      setRelatedEntries([]);
    });
  }, [activeEntry, entries]);

  useEffect(() => {
    if (!reconcile.accountId) {
      setComputedBalanceCentavos(null);
      return;
    }
    const statementDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(reconcile.date);
    void fetch(`/api/finance/reconciliations?accountId=${encodeURIComponent(reconcile.accountId)}&statementDate=${statementDate}`)
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { computedBalanceCentavos: number };
        setComputedBalanceCentavos(result.computedBalanceCentavos);
      })
      .catch(() => setComputedBalanceCentavos(null));
  }, [reconcile.accountId, reconcile.date]);
  const statementBalanceCentavos = parsePeso(reconcile.amount);
  const reconciliationDifference = statementBalanceCentavos !== null && computedBalanceCentavos !== null
    ? statementBalanceCentavos - computedBalanceCentavos
    : null;
  const activeVoid = activeEntry && relatedEntries.find((entry) =>
    entry.kind === "void"
    && entry.targetEntryId === activeEntry.id
    && !relatedEntries.some((candidate) => candidate.kind === "restore" && candidate.targetEntryId === entry.id),
  );
  const replacementExists = Boolean(activeEntry && relatedEntries.some((entry) => entry.replacesEntryId === activeEntry.id));
  const restoreTarget = activeEntry?.kind === "void"
    ? relatedEntries.some((entry) => entry.kind === "restore" && entry.targetEntryId === activeEntry.id) ? null : activeEntry
    : activeVoid && !replacementExists ? activeVoid : null;
  // eslint-disable-next-line react-hooks/incompatible-library -- Virtual ledger rows avoid rendering the full audit history.
  const virtualizer = useVirtualizer({ count: entries.length, getScrollElement: () => listRef.current, estimateSize: () => 52, overscan: 10 });

  function setTab(nextTab: string) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", nextTab);
    next.delete("panel");
    router.replace(`/finance?${next}`);
  }

  async function addEntry(event: React.FormEvent) {
    event.preventDefault();
    const amountCentavos = parsePeso(entryForm.amount);
    const isTransfer = entryForm.kind === "transfer";
    if (
      amountCentavos === null
      || amountCentavos <= 0
      || (isTransfer
        ? !entryForm.fromAccountId || !entryForm.toAccountId || entryForm.fromAccountId === entryForm.toAccountId
        : !entryForm.accountId)
    ) return;
    const occurredOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(entryForm.occurredOn);
    const response = await apiFetch(isTransfer ? "/api/finance/transfers" : "/api/finance/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isTransfer
        ? {
          fromAccountId: entryForm.fromAccountId,
          toAccountId: entryForm.toAccountId,
          eventId: entryForm.eventId || null,
          amountCentavos,
          occurredOn,
          description: entryForm.description,
          orNumber: entryForm.orNumber,
        }
        : {
          accountId: entryForm.accountId,
          eventId: entryForm.eventId || null,
          kind: entryForm.kind,
          category: entryForm.category,
          amountCentavos,
          occurredOn,
          description: entryForm.description,
          orNumber: entryForm.orNumber,
        }),
    });
    if (!response.ok) return toast.error("Could not add this entry.");
    const saved = isTransfer ? await response.json() as { entries: Entry[] } : null;
    const entry = saved ? saved.entries.find((item) => item.kind === "transfer_in") ?? saved.entries[0] : await response.json() as Entry;
    if (!entry) return toast.error("Transfer was saved, but its entries could not be loaded.");
    if (receipt) {
      const form = new FormData();
      form.set("file", receipt); form.set("kind", "receipt"); form.set("entityType", "ledger_entry"); form.set("entityId", entry.id); form.set("role", "receipt");
      const upload = await apiFetch("/api/files", { method: "POST", body: form });
      if (upload.ok) {
        const file = await upload.json() as { id: string };
        await apiFetch(`/api/finance/entries/${entry.id}/receipts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: file.id }) });
      } else toast.error("Entry saved, but receipt upload failed.");
    }
    setReceipt(null);
    setEntryForm((current) => ({ ...current, amount: "", description: "", orNumber: "" }));
    toast.success(isTransfer ? "Account transfer added." : "Ledger entry added.");
    await load();
  }

  async function voidEntry(entry: Entry) {
    const response = await apiFetch(`/api/finance/entries/${entry.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: voidReason }) });
    if (!response.ok) return toast.error("Could not void entry.");
    setVoidReason("");
    toastUndo("Void appended.", () => {
      void apiFetch(`/api/finance/entries/${entry.id}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Undo previous void" }) }).then(load);
    });
    await load();
  }

  async function restoreEntry(entry: Entry) {
    const response = await apiFetch(`/api/finance/entries/${entry.id}/restore`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: restoreReason }),
    });
    if (!response.ok) return toast.error("Could not restore this entry.");
    setRestoreReason("");
    toast.success("Restore appended to the ledger.");
    await load();
  }

  async function correctEntry(event: React.FormEvent, entry: Entry) {
    event.preventDefault();
    const amountCentavos = parsePeso(correction.amount);
    if (amountCentavos === null || amountCentavos <= 0 || !correction.reason.trim()) return;
    const response = await apiFetch(`/api/finance/entries/${entry.id}/correct`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: entry.accountId,
        eventId: entry.eventId,
        kind: entry.kind,
        category: correction.category,
        amountCentavos,
        occurredOn: correction.occurredOn,
        counterparty: entry.counterparty,
        description: correction.description,
        orNumber: correction.orNumber,
        approvedByMemberId: null,
        reason: correction.reason,
      }),
    });
    if (!response.ok) return toast.error("Could not correct this entry.");
    const result = await response.json() as { replacementEntry: Entry };
    setCorrectionOpen(false);
    toast.success("Correction appended to the ledger.");
    await load();
    router.replace(`/finance?tab=ledger&panel=entry&id=${result.replacementEntry.id}`);
  }

  async function attachReceipt(entry: Entry, file: File) {
    setReceiptUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "receipt");
    form.set("entityType", "ledger_entry");
    form.set("entityId", entry.id);
    form.set("role", "receipt");
    const upload = await apiFetch("/api/files", { method: "POST", body: form });
    if (!upload.ok) {
      setReceiptUploading(false);
      return toast.error("Could not upload receipt.");
    }
    const uploaded = await upload.json() as { id: string };
    const attached = await apiFetch(`/api/finance/entries/${entry.id}/receipts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: uploaded.id }),
    });
    setReceiptUploading(false);
    if (!attached.ok) return toast.error("Receipt uploaded but could not be attached.");
    toast.success("Receipt attached.");
    const receiptResponse = await fetch(`/api/finance/entries/${entry.id}/receipts`);
    if (receiptResponse.ok) setReceipts(await receiptResponse.json() as Receipt[]);
    await load();
  }

  async function removeReceipt(entry: Entry, receipt: Receipt) {
    const response = await apiFetch(`/api/finance/entries/${entry.id}/receipts`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptId: receipt.id }),
    });
    if (!response.ok) return toast.error("Could not remove receipt.");
    toastUndo("Receipt removed.", () => {
      void apiFetch(`/api/finance/entries/${entry.id}/receipts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: receipt.fileId }),
      }).then(async () => {
        const receiptResponse = await fetch(`/api/finance/entries/${entry.id}/receipts`);
        if (receiptResponse.ok) setReceipts(await receiptResponse.json() as Receipt[]);
        await load();
      });
    });
    const receiptResponse = await fetch(`/api/finance/entries/${entry.id}/receipts`);
    if (receiptResponse.ok) setReceipts(await receiptResponse.json() as Receipt[]);
    await load();
  }

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault();
    const plannedCentavos = parsePeso(budget.amount);
    if (!plannedCentavos || !budget.eventId) return;
    const response = await apiFetch("/api/finance/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: budget.eventId, category: budget.category, plannedCentavos, note: budget.note }) });
    if (!response.ok) return toast.error("Could not save budget line.");
    setBudget((current) => ({ ...current, amount: "", note: "" }));
    await load();
  }

  async function saveReconciliation(event: React.FormEvent) {
    event.preventDefault();
    const statementBalanceCentavos = parsePeso(reconcile.amount);
    if (statementBalanceCentavos === null || !reconcile.accountId) return;
    const statementDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(reconcile.date);
    const response = await apiFetch("/api/finance/reconciliations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: reconcile.accountId, statementDate, statementBalanceCentavos, note: reconcile.note }) });
    if (!response.ok) return toast.error("Could not save reconciliation.");
    toast.success("Reconciliation saved.");
    await load();
  }

  async function toggleStep(guideKey: string, stepKey: string, done: boolean) {
    const response = await apiFetch("/api/finance/guide-progress", {
      method: done ? "PUT" : "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guideKey, stepKey, done, note: "" }),
    });
    if (!response.ok) return toast.error("Could not update guide progress.");
    await load();
  }

  const isTransfer = entryForm.kind === "transfer";
  const parsedEntryAmount = parsePeso(entryForm.amount);
  const validEntry = Boolean(
    parsedEntryAmount !== null
    && parsedEntryAmount > 0
    && (isTransfer
      ? entryForm.fromAccountId && entryForm.toAccountId && entryForm.fromAccountId !== entryForm.toAccountId
      : entryForm.accountId && entryForm.category),
  );
  return <main className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Finance</h1><p className="text-sm text-muted-foreground">Next steps, auditable ledger, and RSO manual guides.</p></div>
      {tab === "ledger" && <div className="flex flex-wrap gap-2"><a className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-secondary" href="/api/finance/export?format=xlsx"><DownloadIcon size={14} />XLSX</a><a className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary" href="/api/finance/export?format=csv">CSV</a><a className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary" href="/api/finance/export?format=xlsx&receipts=1">Receipts ZIP</a></div>}
    </header>
    <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Finance tabs">{tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`border-b-2 px-3 py-2 text-sm ${tab === item ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tabLabels[item]}</button>)}</nav>
    {loading && !summary ? <div className="space-y-3" aria-label="Loading Finance">{[0, 1, 2].map((n) => <div key={n} className="h-20 animate-pulse rounded-md bg-secondary" />)}</div> : null}

    {tab === "overview" && summary && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)]">
      <section className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">What to do now</h2>
        {summary.whatToDoNow.length ? (showAllActions ? summary.whatToDoNow : summary.whatToDoNow.slice(0, 5)).map((item) => {
          const action = item.action;
          const href = "guide" in action ? `/finance?tab=guides&guide=${action.guide}&step=${action.step}` : action.href;
          return <article key={item.id} className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${severityStyle[item.severity]}`}>
          {item.severity === "info" ? <InfoIcon size={16} className="shrink-0" /> : <AlertIcon size={16} className="shrink-0" />}
          <div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><p className="text-sm opacity-80">{item.detail}</p></div>
          <Link className="inline-flex h-8 items-center rounded-md border border-current px-3 text-xs font-medium" href={href}>{"guide" in action ? "Open guide" : "Open"}</Link>
        </article>;
        }) : <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">Nothing urgent. Check the ledger and reconcile on schedule.</p>}
        {summary.whatToDoNow.length > 5 && <Button type="button" size="sm" variant="ghost" onClick={() => setShowAllActions((current) => !current)}>{showAllActions ? "Show fewer" : `Show ${summary.whatToDoNow.length - 5} more`}</Button>}
      </section>
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">{summary.accounts.map((account) => <article key={account.id} className="rounded-md border border-border bg-card p-4"><div className="flex justify-between gap-2"><span className="font-medium">{account.name}</span><Label color={account.archivedAt ? "gray" : account.kind === "bank" ? "blue" : "green"}>{account.archivedAt ? "Archived" : account.kind === "ewallet" ? "E-wallet" : account.kind[0].toUpperCase() + account.kind.slice(1)}</Label></div><p className="mono mt-3 text-xl font-semibold">{pesos(account.balanceCentavos)}</p><p className="mt-1 text-xs text-muted-foreground">{account.bankName ?? ""}{account.accountLast4 ? ` · •••• ${account.accountLast4}` : ""}</p></article>)}</section>
        {!summary.accounts.length && <AccountForm onSaved={load} />}
        <form onSubmit={(event) => void addEntry(event)} className="space-y-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold">Quick add</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="col-span-full inline-flex w-fit rounded-md border border-border p-1">
              {(["expense", "income", "transfer"] as const).map((kind) => <Button key={kind} type="button" size="sm" variant={entryForm.kind === kind ? "default" : "ghost"} onClick={() => setEntryForm((current) => ({ ...current, kind }))}>{kind === "expense" ? "Expense" : kind === "income" ? "Income" : "Transfer"}</Button>)}
            </div>
            <Input aria-label="Amount in pesos" inputMode="decimal" value={entryForm.amount} onChange={(event) => setEntryForm({ ...entryForm, amount: event.target.value })} onBlur={() => { const parsed = parsePeso(entryForm.amount); if (parsed !== null) setEntryForm({ ...entryForm, amount: formatPeso(parsed) }); }} placeholder="₱ 0.00" className="mono min-w-0" />
            {!isTransfer && <CategorySelect value={entryForm.category} onChange={(category) => setEntryForm({ ...entryForm, category })} />}
            <Combobox options={events.map((event) => ({ value: event.id, label: event.name }))} value={entryForm.eventId} onChange={(eventId) => setEntryForm({ ...entryForm, eventId })} placeholder="Event (optional)" buttonClassName="w-full" />
            {isTransfer ? <div className="col-span-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <div className="min-w-0 space-y-1"><span className="block text-xs text-muted-foreground">From account</span><Combobox options={summary.accounts.filter((account) => !account.archivedAt).map((account) => ({ value: account.id, label: account.name }))} value={entryForm.fromAccountId} onChange={(fromAccountId) => setEntryForm({ ...entryForm, fromAccountId })} placeholder="Choose account" buttonClassName="w-full" /></div>
              <span aria-hidden="true" className="text-muted-foreground">→</span>
              <div className="min-w-0 space-y-1"><span className="block text-xs text-muted-foreground">To account</span><Combobox options={summary.accounts.filter((account) => !account.archivedAt).map((account) => ({ value: account.id, label: account.name }))} value={entryForm.toAccountId} onChange={(toAccountId) => setEntryForm({ ...entryForm, toAccountId })} placeholder="Choose account" buttonClassName="w-full" /></div>
            </div> : <Combobox options={summary.accounts.filter((account) => !account.archivedAt).map((account) => ({ value: account.id, label: account.name }))} value={entryForm.accountId} onChange={(accountId) => setEntryForm({ ...entryForm, accountId })} placeholder="Account" buttonClassName="w-full" />}
            <DatePicker value={entryForm.occurredOn} onChange={(occurredOn) => occurredOn && setEntryForm({ ...entryForm, occurredOn })} ariaLabel="Transaction date" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input aria-label="Description" value={entryForm.description} onChange={(event) => setEntryForm({ ...entryForm, description: event.target.value })} placeholder="Description" className="sm:col-span-2" />
            <Input aria-label="OR number" value={entryForm.orNumber} onChange={(event) => setEntryForm({ ...entryForm, orNumber: event.target.value })} placeholder="OR #" />
            <label className="flex min-h-9 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground focus-within:ring-2 focus-within:ring-ring"><input type="file" accept="image/*,application/pdf" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} className="sr-only" /><span className="min-w-0 truncate">{receipt?.name ?? "Receipt (optional)"}</span></label>
            <Button disabled={!validEntry} className="sm:col-span-2"><PlusIcon size={14} />{isTransfer ? "Add transfer" : "Add entry"}</Button>
          </div>
        </form>
      </div>
    </div>}

    {tab === "ledger" && <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><div className="min-w-64 flex-1"><FilterBar placeholder={'account:"China Bank" event:past-career-forum category:food is:missing-receipt from:2026-01-01'} /></div><span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-1 text-xs text-success"><ShieldCheckIcon size={13} />Chain verified</span></div>
      <div ref={listRef} className="h-[60vh] overflow-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[1220px] text-left text-xs"><thead className="sticky top-0 z-10 bg-secondary text-muted-foreground"><tr>{["Seq", "Date", "Kind", "Category", "Account", "Event", "Description", "OR#", "Amount", "Account balance", "Receipt"].map((item) => <th key={item} className="p-3 font-medium">{item}</th>)}</tr></thead>
          <tbody style={{ height: virtualizer.getTotalSize(), position: "relative" }}>{virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
            return <tr key={entry.id} onClick={() => router.push(`/finance?tab=ledger&panel=entry&id=${entry.id}`)} className={`absolute left-0 right-0 cursor-pointer border-b border-border hover:bg-secondary/60 ${["void", "restore"].includes(entry.kind) ? "text-muted-foreground line-through" : ""}`} style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}>
              <td className="mono p-3">#{entry.seq}</td><td className="p-3">{displayDay(entry.occurredOn)}</td><td className="p-3"><Label color={entry.kind === "income" ? "green" : entry.kind === "expense" ? "red" : "gray"}>{kindLabels[entry.kind] ?? entry.kind}</Label></td>
              <td className="p-3">{FINANCE_CATEGORY_LABELS[entry.category as keyof typeof FINANCE_CATEGORY_LABELS] ?? entry.category}</td><td className="max-w-[180px] truncate p-3">{entry.account?.name ?? "—"}</td><td className="max-w-[180px] truncate p-3">{entry.event?.name ?? "—"}</td><td className="max-w-[250px] truncate p-3">{entry.description || entry.counterparty}{entry.reason ? ` · ${entry.reason}` : ""}</td><td className="mono p-3">{entry.orNumber || "—"}</td>
              <td className={`mono p-3 text-right ${entry.kind === "income" ? "text-success" : entry.kind === "expense" ? "text-destructive" : ""}`}>{pesos(entry.amountCentavos)}</td><td className="mono p-3 text-right">{pesos(entry.runningBalanceCentavos)}</td>
              <td className="p-3">{entry.receiptCount ? <span className="text-success">Receipt</span> : entry.kind === "expense" ? <Label color="yellow">Missing receipt</Label> : "—"}</td>
            </tr>;
          })}</tbody>
        </table>
        {!entries.length && <p className="p-8 text-center text-sm text-muted-foreground">No ledger entries match this query.</p>}
      </div>
      {params.get("panel") === "entry" && activeEntry && <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Entry #{activeEntry.seq}</h2><Button variant="ghost" size="sm" onClick={() => router.push("/finance?tab=ledger")}>Close</Button></div>
        <dl className="mt-5 space-y-3 text-sm">{[["Date", displayDay(activeEntry.occurredOn)], ["Kind", kindLabels[activeEntry.kind] ?? activeEntry.kind], ["Category", FINANCE_CATEGORY_LABELS[activeEntry.category as keyof typeof FINANCE_CATEGORY_LABELS]], ["Account", activeEntry.account?.name], ["Event", activeEntry.event?.name ?? "—"], ["Amount", pesos(activeEntry.amountCentavos)], ["Description", activeEntry.description], ["OR#", activeEntry.orNumber || "—"], ["Hash", activeEntry.hash]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>
        <section className="mt-5 space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Receipts</h3>
          {receipts.map((item) => <div key={item.id} className="space-y-2 rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2"><a href={`/api/files/${item.fileId}/content`} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm text-primary underline">{item.file.originalName}</a><Button type="button" size="sm" variant="ghost" onClick={() => void removeReceipt(activeEntry, item)}>Remove</Button></div>
            {item.file.mime.startsWith("image/") && <Image src={`/api/files/${item.fileId}/content`} alt={item.file.originalName} width={640} height={448} unoptimized className="max-h-56 w-full rounded object-contain" />}
            {item.file.mime === "application/pdf" && <iframe src={`/api/files/${item.fileId}/content`} title={`Receipt ${item.file.originalName}`} className="h-56 w-full rounded border border-border bg-white" />}
          </div>)}
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) void attachReceipt(activeEntry, file);
            }}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-border bg-background p-4 text-center text-sm text-muted-foreground hover:bg-secondary/50"
          >
            <span>{receiptUploading ? "Uploading receipt…" : "Drop a receipt here or choose a file"}</span>
            <span className="text-xs">Images or PDF · uploads are linked to this ledger entry</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              disabled={receiptUploading}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void attachReceipt(activeEntry, file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </section>
        <section className="mt-5 space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Related ledger entries</h3>
          {relatedEntries.length ? <ul className="space-y-2">{relatedEntries.map((entry) => <li key={entry.id}><Link className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-2 text-xs hover:bg-secondary" href={`/finance?tab=ledger&q=is%3Avoided&panel=entry&id=${entry.id}`}><span>#{entry.seq} · {kindLabels[entry.kind] ?? entry.kind}{entry.reason ? ` · ${entry.reason}` : ""}</span><span className="mono shrink-0">{pesos(entry.amountCentavos)}</span></Link></li>)}</ul> : <p className="text-xs text-muted-foreground">No void, restore, or correction records are linked yet.</p>}
        </section>
        {["income", "expense"].includes(activeEntry.kind) && !activeVoid && <div className="mt-5 space-y-2 border-t border-border pt-4"><label className="text-xs text-muted-foreground">Reason for void</label><Textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Why should this entry be voided?" /><Button variant="outline" disabled={!voidReason.trim()} onClick={() => void voidEntry(activeEntry)}>Append void record</Button></div>}
        {restoreTarget && <div className="mt-5 space-y-2 border-t border-border pt-4"><label className="text-xs text-muted-foreground">Reason for restore</label><Textarea value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} placeholder="Why should this entry be restored?" /><Button variant="outline" disabled={!restoreReason.trim()} onClick={() => void restoreEntry(restoreTarget)}>Append restore record</Button></div>}
        {["income", "expense"].includes(activeEntry.kind) && !activeVoid && <section className="mt-5 border-t border-border pt-4">
          {!correctionOpen ? <Button type="button" variant="outline" onClick={() => setCorrectionOpen(true)}>Correct entry</Button> : <form onSubmit={(event) => void correctEntry(event, activeEntry)} className="space-y-3">
            <h3 className="text-sm font-semibold">Append correction</h3>
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="Corrected amount" value={correction.amount} onChange={(event) => setCorrection({ ...correction, amount: event.target.value })} placeholder="₱ amount" />
              <CategorySelect value={correction.category} onChange={(category) => setCorrection({ ...correction, category })} />
              <Input aria-label="Corrected date" type="date" value={correction.occurredOn} onChange={(event) => setCorrection({ ...correction, occurredOn: event.target.value })} />
              <Input aria-label="Corrected OR number" value={correction.orNumber} onChange={(event) => setCorrection({ ...correction, orNumber: event.target.value })} placeholder="OR #" />
            </div>
            <Input aria-label="Corrected description" value={correction.description} onChange={(event) => setCorrection({ ...correction, description: event.target.value })} placeholder="Description" />
            <Textarea aria-label="Correction reason" value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })} placeholder="Reason for correction" />
            <div className="flex gap-2"><Button disabled={!correction.reason.trim() || !parsePeso(correction.amount) || !correction.occurredOn}>Append correction</Button><Button type="button" variant="ghost" onClick={() => setCorrectionOpen(false)}>Cancel</Button></div>
          </form>}
        </section>}
        <p className="mt-5 text-xs text-muted-foreground">Entries are append-only; corrections create linked void and replacement records.</p>
      </aside>}
    </div>}

    {tab === "budgets" && <section className="space-y-4">
      <form onSubmit={(event) => void saveBudget(event)} className="grid gap-2 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_1fr_150px_1fr_auto]">
        <Combobox options={events.map((event) => ({ value: event.id, label: event.name }))} value={budget.eventId} onChange={(eventId) => setBudget({ ...budget, eventId })} placeholder="Choose event" />
        <CategorySelect value={budget.category} onChange={(category) => setBudget({ ...budget, category })} />
        <Input aria-label="Planned amount" value={budget.amount} onChange={(event) => setBudget({ ...budget, amount: event.target.value })} placeholder="₱ planned" />
        <Input aria-label="Budget note" value={budget.note} onChange={(event) => setBudget({ ...budget, note: event.target.value })} placeholder="Note" />
        <Button disabled={!budget.eventId || !parsePeso(budget.amount)}><PlusIcon size={14} />Add line</Button>
      </form>
      <div className="grid gap-3 md:grid-cols-2">{events.map((event) => {
        const lines = summary?.budgets.filter((line) => line.eventId === event.id) ?? [];
        if (!lines.length) return null;
        return <article key={event.id} className="rounded-md border border-border bg-card p-4"><h2 className="mb-3 font-semibold">{event.name}</h2>{lines.map((line) => <div key={line.category} className="border-t border-border py-2"><div className="flex justify-between gap-2 text-sm"><span>{FINANCE_CATEGORY_LABELS[line.category as keyof typeof FINANCE_CATEGORY_LABELS]}</span><span className="mono">{pesos(line.actualCentavos)} / {pesos(line.plannedCentavos)}</span></div><div className="mt-2 h-2 rounded bg-secondary"><div className={`h-full rounded ${line.varianceCentavos < 0 ? "bg-destructive" : "bg-success"}`} style={{ width: `${Math.min(100, line.plannedCentavos ? Math.round(line.actualCentavos * 100 / line.plannedCentavos) : 100)}%` }} /></div></div>)}</article>;
      })}</div>
    </section>}

    {tab === "liquidations" && <section className="grid gap-3 md:grid-cols-2">{liquidations.map((item) => <article key={item.eventId} className="rounded-md border border-border bg-card p-4"><div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{item.eventName}</h2><Label color={item.overdue ? "red" : item.status === "approved" ? "green" : "yellow"}>{item.overdue ? "Overdue" : item.status === "approved" ? "Approved" : item.status[0].toUpperCase() + item.status.slice(1)}</Label></div><p className="mt-2 text-sm text-muted-foreground">Due {displayDay(item.dueAt)} · {pesos(item.unliquidatedCentavos)} unliquidated</p>
      <div className="mt-3 border-t border-border pt-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Included entries</h3>{item.entries.length ? <ul className="mt-2 space-y-1">{item.entries.map((entry) => <li key={entry.id} className="flex justify-between gap-3 text-xs"><span className="min-w-0 truncate">#{entry.seq} · {entry.description || FINANCE_CATEGORY_LABELS[entry.category as keyof typeof FINANCE_CATEGORY_LABELS]}</span><span className="mono shrink-0">{pesos(entry.amountCentavos)}</span></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No submitted snapshot yet.</p>}</div>
      <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={item.status === "approved"} onClick={() => void apiFetch(`/api/finance/liquidations/${item.eventId}/submit`, { method: "POST" }).then(load)}>Mark submitted</Button><Button size="sm" variant="outline" disabled={item.status !== "submitted"} onClick={() => void apiFetch(`/api/finance/liquidations/${item.eventId}/approve`, { method: "POST" }).then(load)}>Approved by SCOA</Button><Button size="sm" variant="ghost" onClick={() => void apiFetch(`/api/finance/liquidations/${item.eventId}/reopen`, { method: "POST" }).then(load)}>Reopen</Button></div></article>)}</section>}

    {tab === "guides" && <section className="grid gap-3 lg:grid-cols-2">{FINANCE_GUIDES.map((guide) => {
      const done = guide.steps.filter((step) => progress.some((row) => row.guideKey === guide.key && row.stepKey === step.key && row.doneAt)).length;
      const selected = selectedGuideKey === guide.key;
      return <article key={guide.key} className={`rounded-md border border-border bg-card p-4 ${selected ? "lg:col-span-2" : ""}`}><button type="button" onClick={() => router.replace(`/finance?tab=guides&guide=${guide.key}`)} className="flex w-full items-start justify-between gap-3 text-left"><div><h2 className="font-semibold">{guide.title}</h2><p className="mt-1 text-sm text-muted-foreground">{guide.summary}</p></div><span className="mono text-xs">{done}/{guide.steps.length}</span></button>
        {selected && <ol className="mt-4 space-y-3">{guide.steps.map((step) => {
          const checked = progress.some((row) => row.guideKey === guide.key && row.stepKey === step.key && row.doneAt);
          const focused = selectedStepKey === step.key;
          return <li id={`finance-guide-step-${guide.key}-${step.key}`} key={step.key} className={`flex gap-3 border-t border-border pt-3 ${focused ? "rounded-md bg-primary/5 px-3" : ""}`}><input aria-label={`Complete ${step.title}`} type="checkbox" checked={Boolean(checked)} onChange={(event) => void toggleStep(guide.key, step.key, event.target.checked)} /><div><h3 className="font-medium">{step.title}</h3><p className="mt-1 text-sm">{step.detail}</p><p className="mt-1 text-xs text-muted-foreground">Why: {step.why}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="inline-flex rounded-full border border-border bg-secondary px-2 py-1 text-xs">{step.citation ? `RSO p.${step.citation.page} · ${step.citation.section}` : "Org practice"}</span><Button type="button" size="sm" variant="outline" onClick={() => {
            const prompt = `How do I complete "${step.title}" for "${guide.title}"? Please cite [${guide.key}:${step.key}].`;
            router.push(`/finance?tab=guides&guide=${guide.key}&step=${step.key}&panel=finance-chat&ask=${encodeURIComponent(prompt)}`);
          }}>Ask AI about this step</Button></div></div></li>;
        })}</ol>}
      </article>;
    })}</section>}

    {tab === "reconcile" && <div className="space-y-4">
      <form onSubmit={(event) => void saveReconciliation(event)} className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-2">
        <Combobox options={(summary?.accounts ?? []).filter((account) => !account.archivedAt).map((account) => ({ value: account.id, label: account.name }))} value={reconcile.accountId} onChange={(accountId) => setReconcile({ ...reconcile, accountId })} placeholder="Choose account" />
        <DatePicker value={reconcile.date} onChange={(date) => date && setReconcile({ ...reconcile, date })} ariaLabel="Statement date" />
        <Input aria-label="Statement balance" value={reconcile.amount} onChange={(event) => setReconcile({ ...reconcile, amount: event.target.value })} placeholder="Statement balance" />
        <Input aria-label="Reconciliation note" value={reconcile.note} onChange={(event) => setReconcile({ ...reconcile, note: event.target.value })} placeholder="Note" />
        <Button disabled={!reconcile.accountId || parsePeso(reconcile.amount) === null}>Save reconciliation</Button>
      </form>
      {computedBalanceCentavos !== null && <section className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-2">
        <div><p className="text-xs text-muted-foreground">Computed ledger balance · {displayDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(reconcile.date))}</p><p className="mono mt-1 text-xl font-semibold">{pesos(computedBalanceCentavos)}</p></div>
        <div><p className="text-xs text-muted-foreground">Difference · statement minus ledger</p><p className={`mono mt-1 text-xl font-semibold ${reconciliationDifference === 0 ? "text-success" : reconciliationDifference === null ? "text-muted-foreground" : "text-destructive"}`}>{reconciliationDifference === null ? "Enter statement balance" : `${reconciliationDifference > 0 ? "+" : reconciliationDifference < 0 ? "−" : ""}${pesos(Math.abs(reconciliationDifference))}`}</p></div>
      </section>}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Reconciliation history</h2>
        {reconciliations.length ? [...reconciliations].reverse().map(({ reconciliation: row, account }) => {
          const difference = row.statementBalanceCentavos - row.computedBalanceCentavos;
          return <article key={row.id} className="grid gap-2 rounded-md border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div><h3 className="font-medium">{account.name}</h3><p className="text-xs text-muted-foreground">{displayDay(row.statementDate)}{row.note ? ` · ${row.note}` : ""}</p></div>
            <div><p className="text-xs text-muted-foreground">Statement / ledger</p><p className="mono text-sm">{pesos(row.statementBalanceCentavos)} / {pesos(row.computedBalanceCentavos)}</p></div>
            <div className={`mono text-sm font-medium ${difference === 0 ? "text-success" : "text-destructive"}`}>{difference > 0 ? "+" : difference < 0 ? "−" : ""}{pesos(Math.abs(difference))}</div>
          </article>;
        }) : <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">No reconciliations recorded yet.</p>}
      </section>
    </div>}
  </main>;
}

function CategorySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="w-44"><span>{FINANCE_CATEGORY_LABELS[value as keyof typeof FINANCE_CATEGORY_LABELS]}</span></SelectTrigger><SelectContent>{FINANCE_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{FINANCE_CATEGORY_LABELS[category]}</SelectItem>)}</SelectContent></Select>;
}

function AccountForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("China Bank");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const response = await apiFetch("/api/finance/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, bankName, kind: "bank", signatoryMemberIds: [] }) });
    if (!response.ok) return toast.error("Could not add bank account.");
    onSaved();
  }
  return <form onSubmit={(event) => void create(event)} className="flex flex-wrap gap-2 rounded-md border border-border bg-card p-4"><h2 className="w-full font-semibold">Add an account</h2><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Account name" /><Input value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Bank name" /><Button disabled={!name.trim()}><PlusIcon size={14} />Add bank account</Button></form>;
}
