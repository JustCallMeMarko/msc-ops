"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import { FINANCE_CATEGORIES, FINANCE_CATEGORY_LABELS } from "@/lib/finance/constants";
import { formatPeso, parsePeso } from "@/lib/finance/logic";

type EventFinance = {
  event: { id: string; name: string };
  entries: Array<{ id: string; seq: number; kind: string; category: string; amountCentavos: number; occurredOn: string; description: string; orNumber: string }>;
  budgets: Array<{ category: string; plannedCentavos: number; actualCentavos: number; varianceCentavos: number }>;
  totals: { incomeCentavos: number; expenseCentavos: number; netCentavos: number };
  liquidation?: { dueAt: string | null; overdue: boolean; unliquidatedCentavos: number; status: string };
};

export function EventFinancePanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<EventFinance | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  async function load() {
    const [response, accountResponse] = await Promise.all([fetch(`/api/finance/events/${eventId}`), fetch("/api/finance/accounts")]);
    if (response.ok) setData(await response.json());
    if (accountResponse.ok) {
      const rows = await accountResponse.json() as Array<{ id: string; name: string; archivedAt: string | null }>;
      setAccounts(rows.filter((row) => !row.archivedAt));
      if (!accountId) setAccountId(rows.find((row) => !row.archivedAt)?.id ?? "");
    }
  }
  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetch(`/api/finance/events/${eventId}`), fetch("/api/finance/accounts")]).then(async ([response, accountResponse]) => {
      if (response.ok) {
        const next = await response.json() as EventFinance;
        if (!cancelled) setData(next);
      }
      if (accountResponse.ok) {
        const rows = await accountResponse.json() as Array<{ id: string; name: string; archivedAt: string | null }>;
        if (!cancelled) {
          setAccounts(rows.filter((row) => !row.archivedAt));
          setAccountId((current) => current || rows.find((row) => !row.archivedAt)?.id || "");
        }
      }
    });
    return () => { cancelled = true; };
  }, [eventId]);
  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    const amountCentavos = parsePeso(amount);
    if (!data || !accountId || !amountCentavos) return;
    const response = await apiFetch("/api/finance/entries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, eventId: data.event.id, kind: "expense", category, amountCentavos, occurredOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()), description }),
    });
    if (!response.ok) return toast.error("Could not add event expense.");
    setAmount(""); setDescription(""); await load(); toast.success("Expense added.");
  }
  if (!data) return <div className="h-48 animate-pulse rounded-md bg-secondary" aria-label="Loading event finance" />;
  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">{[["Income", data.totals.incomeCentavos], ["Expenses", data.totals.expenseCentavos], ["Net", data.totals.netCentavos]].map(([label, value]) => <article key={String(label)} className="rounded-md border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mono mt-1 text-lg font-semibold">{formatPeso(Number(value))}</p></article>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-md border border-border bg-card p-4"><h2 className="font-semibold">Budget vs actual</h2>{data.budgets.length ? data.budgets.map((line) => <p key={line.category} className="flex justify-between border-t border-border py-2 text-sm"><span>{FINANCE_CATEGORY_LABELS[line.category as keyof typeof FINANCE_CATEGORY_LABELS]}</span><span className="mono">{formatPeso(line.actualCentavos)} / {formatPeso(line.plannedCentavos)}</span></p>) : <p className="mt-2 text-sm text-muted-foreground">No budget lines yet.</p>}<Link className="mt-3 inline-flex text-sm text-primary hover:underline" href="/finance?tab=budgets">Open budgets</Link></section>
      <section className="rounded-md border border-border bg-card p-4"><h2 className="font-semibold">Liquidation</h2><p className="mt-2 text-sm">Due {data.liquidation?.dueAt ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(new Date(data.liquidation.dueAt)) : "Not scheduled"}</p><p className="mono mt-1 text-sm">{formatPeso(data.liquidation?.unliquidatedCentavos ?? 0)} unliquidated {data.liquidation?.overdue ? "· overdue" : ""}</p><Link className="mt-3 inline-flex text-sm text-primary hover:underline" href="/finance?tab=liquidations">Open liquidations</Link></section>
    </div>
    <form onSubmit={(event) => void addExpense(event)} className="space-y-3 rounded-md border border-border bg-card p-4"><h2 className="font-semibold">Add expense</h2><div className="flex flex-wrap gap-2"><Select value={accountId} onValueChange={setAccountId}><SelectTrigger aria-label="Finance account" className="w-52"><span>{accounts.find((account) => account.id === accountId)?.name ?? "Choose account"}</span></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select><Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Expense category" className="w-48"><span>{FINANCE_CATEGORY_LABELS[category as keyof typeof FINANCE_CATEGORY_LABELS]}</span></SelectTrigger><SelectContent>{FINANCE_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{FINANCE_CATEGORY_LABELS[item]}</SelectItem>)}</SelectContent></Select><Input aria-label="Expense amount" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="₱ amount" className="w-40" /></div><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" /><Button disabled={!accountId || !parsePeso(amount)}>Add expense</Button></form>
    <section className="rounded-md border border-border bg-card p-4"><h2 className="font-semibold">Event ledger</h2><div className="mt-2 divide-y divide-border">{data.entries.map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>#{entry.seq} · {entry.occurredOn} · {FINANCE_CATEGORY_LABELS[entry.category as keyof typeof FINANCE_CATEGORY_LABELS]} · {entry.description}</span><span className="mono">{formatPeso(entry.amountCentavos)}</span></div>)}</div></section>
  </section>;
}
