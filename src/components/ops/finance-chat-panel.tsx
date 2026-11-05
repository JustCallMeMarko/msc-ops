"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { parseEntryDraft } from "@/lib/finance/chat";
import { ManualCitation } from "@/components/docs/manual-citation";

type Source = { id: string; guide: string; step: string; citation: { page: number; section: string } | null };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };
type FinanceDraft = { accountId: string; eventId: string | null; kind: string; category: string; amountCentavos: number; occurredOn: string; description: string; orNumber: string; counterparty?: string };

export function FinanceChatPanel({ initialPrompt = "" }: { initialPrompt?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialPrompt);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState("");
  useEffect(() => { void fetch("/api/settings").then((response) => response.json()).then((settings: Record<string, { chat?: unknown }>) => setConfigured(Boolean(settings["ai.defaults"]?.chat))).catch(() => setConfigured(false)); }, []);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy || !configured) return;
    const next = [...messages, { role: "user" as const, content: input.trim() }];
    setMessages(next); setInput(""); setBusy(true);
    try {
      const response = await apiFetch("/api/finance/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: threadId || undefined, messages: next.map(({ role, content }) => ({ role, content })) }) });
      if (!response.ok || !response.body) {
        const problem = await response.json().catch(() => ({})) as { error?: string };
        toast.error(problem.error ?? "Finance chat is unavailable.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; let answer = ""; let sources: Source[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as { type: string; text?: string; sources?: Source[]; error?: string; threadId?: string };
          if (event.type === "thread" && event.threadId) setThreadId(event.threadId);
          if (event.type === "text") answer += event.text ?? "";
          if (event.type === "sources") sources = event.sources ?? [];
          if (event.type === "error") throw new Error(event.error);
          setMessages([...next, { role: "assistant", content: answer, sources }]);
        }
      }
      setMessages([...next, { role: "assistant", content: answer, sources }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Finance chat failed.");
    } finally { setBusy(false); }
  }
  async function confirmDraft(draft: FinanceDraft) {
    const response = await apiFetch("/api/finance/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    if (!response.ok) return toast.error("The entry draft could not be saved.");
    toast.success("Entry added to the ledger.");
  }
  return <section className="flex h-full min-h-0 flex-col">
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      {configured === false && <p className="rounded-md border border-attention/40 bg-attention/10 p-3 text-sm">Configure a chat model in Settings → AI to use Finance chat.</p>}
      {!messages.length && configured && <p className="text-sm text-muted-foreground">Ask what to do next, how to liquidate an event, or what the RSO manual requires.</p>}
      {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`rounded-md p-3 text-sm ${message.role === "user" ? "bg-secondary break-words whitespace-pre-wrap" : "border border-border bg-background"}`}>
        {message.role === "assistant" ? (() => {
          const parsed = parseEntryDraft(message.content);
          return <><p className="whitespace-pre-wrap">{parsed.text}</p>{parsed.invalidBlock && <p className="mt-2 text-xs text-muted-foreground">The suggested entry block was invalid and is shown as text.</p>}
            {parsed.draft && <EntryDraft draft={parsed.draft as FinanceDraft} onConfirm={confirmDraft} />}
            {message.sources?.length ? <div className="mt-3 border-t border-border pt-2"><p className="text-xs font-semibold">Sources</p>{message.sources.map((source) => <p key={source.id} className="mt-1 text-xs text-muted-foreground">{source.guide} · {source.step} {source.citation ? <ManualCitation page={source.citation.page} query={source.step} label={`RSO p.${source.citation.page} §${source.citation.section}`} /> : " · Org practice"}</p>)}</div> : <p className="mt-2 text-xs text-muted-foreground">Sources: no guide steps cited.</p>}
          </>;
        })() : message.content}
      </article>)}
    </div>
    <form onSubmit={(event) => void send(event)} className="mt-3 flex gap-2 border-t border-border pt-3"><Input disabled={!configured || busy} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Finance…" /><Button disabled={!configured || busy || !input.trim()}>Send</Button></form>
  </section>;
}

function EntryDraft({ draft, onConfirm }: { draft: FinanceDraft; onConfirm: (draft: FinanceDraft) => void }) {
  const [value, setValue] = useState(draft);
  return <div className="mt-3 space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3"><p className="font-medium">Draft ledger entry</p><div className="grid grid-cols-2 gap-2"><Input aria-label="Draft amount in centavos" type="number" value={value.amountCentavos} onChange={(event) => setValue({ ...value, amountCentavos: Number(event.target.value) })} /><Input aria-label="Draft description" value={value.description} onChange={(event) => setValue({ ...value, description: event.target.value })} /></div><Button size="sm" disabled={!value.accountId || value.amountCentavos <= 0} onClick={() => onConfirm(value)}>Confirm entry</Button></div>;
}
