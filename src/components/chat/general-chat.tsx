"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, PaperAirplaneIcon, UploadIcon, XIcon } from "@primer/octicons-react";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parsePeso } from "@/lib/finance/logic";

type Citation = { n: number; documentId: string; page: number; title?: string; text?: string; auto?: boolean };
type Best = { documentId: string; page: number; title?: string; headingPath?: string; text?: string } | null;
type ChatActionCard = { type: string; [key: string]: unknown };
type Message = { role: string; content: string; citations?: Citation[]; bestMatch?: Best; action?: ChatActionCard };
type UploadCard = { type: string; fileId?: string; filename?: string; documentKind?: string; candidates?: Array<{ id: string; name: string; kind: string; version: number }>; message: string };

export function GeneralChat({ compact = false, scopeRef = null }: { compact?: boolean; scopeRef?: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [threads, setThreads] = useState<Array<{ id: string; title: string }>>([]);
  const [threadQuery, setThreadQuery] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadCard, setUploadCard] = useState<UploadCard | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [accountId, setAccountId] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()));
  const [receiptDescription, setReceiptDescription] = useState("");

  const loadThreads = useCallback(async () => {
    const response = await fetch(`/api/chat${threadQuery ? `?q=${encodeURIComponent(threadQuery)}` : ""}`);
    const payload = await response.json().catch(() => ({ threads: [] }));
    setThreads(payload.threads ?? []);
  }, [threadQuery]);
  const loadThread = useCallback(async (id: string) => {
    const response = await fetch(`/api/chat?threadId=${id}`);
    const payload = await response.json().catch(() => ({ messages: [] }));
    if (response.ok) { setThreadId(id); setMessages(payload.messages ?? []); }
  }, []);
  useEffect(() => {
    let current = true;
    void fetch(`/api/chat${threadQuery ? `?q=${encodeURIComponent(threadQuery)}` : ""}`)
      .then((response) => response.json())
      .then((payload) => { if (current) setThreads(payload.threads ?? []); })
      .catch(() => { if (current) setThreads([]); });
    return () => { current = false; };
  }, [threadQuery]);
  useEffect(() => {
    if (uploadCard?.type !== "receipt") return;
    void fetch("/api/finance/accounts").then((response) => response.json()).then((rows: Array<{ id: string; name: string; archivedAt?: string | null }>) => {
      const active = rows.filter((account) => !account.archivedAt);
      setAccounts(active);
      setAccountId((current) => current || active[0]?.id || "");
    }).catch(() => setAccounts([]));
  }, [uploadCard]);

  async function sendMessage(value = text) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    setText("");
    const currentId = threadId;
    const optimistic: Message[] = [...messages, { role: "user", content: value }, { role: "assistant", content: "" }];
    setMessages(optimistic);
    const response = await apiFetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: currentId ?? undefined, message: value, scopeRef }),
    });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Chat could not start.");
      setMessages(messages);
      setBusy(false);
      return;
    }
    const assistant: Message = { role: "assistant", content: "" };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const process = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        if (event.type === "thread") {
          const newId = String(event.threadId);
          setThreadId(newId);
          if (!currentId) void loadThreads();
          if (event.bestMatch && typeof event.bestMatch === "object") {
            const bestPayload = event.bestMatch as Best;
            assistant.bestMatch = bestPayload;
          }
        } else if (event.type === "text") assistant.content += String(event.text ?? "");
        else if (event.type === "replace") assistant.content = String(event.text ?? "");
        else if (event.type === "sources") assistant.citations = (event.sources as Citation[] | undefined) ?? [];
        else if (event.type === "action") assistant.action = event.action as ChatActionCard;
        else if (event.type === "action_fallback") assistant.action = { type: "unresolved", message: "I couldn’t create a valid action. You can do this manually.", href: event.href };
        else if (event.type === "error") setError(String(event.error ?? "The response was interrupted."));
        setMessages([...optimistic.slice(0, -1), { ...assistant }]);
      } catch { /* Ignore malformed stream frames. */ }
    };
    while (true) {
      const { value: chunk, done } = await reader.read();
      buffer += decoder.decode(chunk, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(process);
      if (done) break;
    }
    if (buffer) process(buffer);
    setBusy(false);
    void loadThreads();
  }

  async function upload(next: File) {
    setUploadFile(next);
    setUploadCard(null);
    const form = new FormData();
    form.append("file", next);
    form.append("kind", "other");
    const response = await apiFetch("/api/files", { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error ?? "Upload failed."); return; }
    const classified = await apiFetch("/api/chat/upload", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: payload.file?.id ?? payload.id }),
    });
    const result = await classified.json().catch(() => ({}));
    if (!classified.ok) { setError(result.error ?? "Could not classify this file."); return; }
    setUploadCard(result);
  }

  async function confirmUpload() {
    if (!uploadCard || !uploadFile) return;
    if (uploadCard.type === "pdf_document") {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("kind", uploadCard.documentKind ?? "reference");
      form.append("title", uploadCard.filename ?? uploadFile.name);
      const response = await apiFetch("/api/documents", { method: "POST", body: form });
      if (!response.ok) { setError("Could not add the document to the library."); return; }
      setUploadCard(null); setUploadFile(null); setError("");
    } else if (uploadCard.type === "template") {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("name", uploadFile.name.replace(/\.[^.]+$/, ""));
      form.append("kind", uploadCard.candidates?.[0]?.kind ?? "other");
      form.append("source", "org");
      const response = await apiFetch("/api/templates", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error?.message ?? "Could not add template."); return; }
      router.push(`/templates/${payload.template.id}`);
      setUploadCard(null); setUploadFile(null);
    } else if (uploadCard.type === "receipt") {
      const amountCentavos = parsePeso(receiptAmount);
      if (!uploadCard.fileId || !accountId || amountCentavos === null || amountCentavos <= 0) {
        setError("Choose an account and enter a valid receipt amount.");
        return;
      }
      const response = await apiFetch("/api/finance/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          eventId: null,
          kind: "expense",
          category: "other",
          amountCentavos,
          occurredOn: receiptDate,
          description: receiptDescription || "Receipt uploaded in chat",
        }),
      });
      const entry = await response.json().catch(() => ({}));
      if (!response.ok) { setError("Could not create the receipt draft."); return; }
      const receiptResponse = await apiFetch(`/api/finance/entries/${entry.id}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: uploadCard.fileId }),
      });
      if (!receiptResponse.ok) { setError("The ledger entry was created, but the receipt could not be attached."); return; }
      setUploadCard(null);
      setUploadFile(null);
      setError("");
      router.push("/finance?tab=ledger");
    }
  }

  async function confirmAction(action: ChatActionCard) {
    if (action.type === "generate_doc") {
      const template = action.template as { id: string } | undefined;
      const entity = action.entity as { type: string; id: string; title?: string } | undefined;
      if (!template || !entity) return;
      const response = await apiFetch(`/api/templates/${template.id}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setError(result.missing ? `Missing fields: ${result.missing.map((item: { label: string }) => item.label).join(", ")}` : result.error ?? "Could not generate file.");
      else setError("Generated file saved. Open Files to review it.");
    } else if (action.type === "edit_deadline_rule") {
      const response = await apiFetch(`/api/deadline-rules/${action.ruleId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offsetDays: action.after }),
      });
      if (!response.ok) setError("Could not update the deadline rule.");
      else setError("Deadline rule updated.");
    } else if (action.type === "draft_ledger_entry") {
      const response = await apiFetch("/api/finance/entries", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action.entry),
      });
      if (!response.ok) setError("Could not create the ledger entry.");
      else setError("Ledger entry added.");
    } else if (action.type === "map_template") {
      router.push(`/templates`);
    }
  }
  function updateAction(index: number, action: ChatActionCard | null) {
    setMessages((current) => current.map((message, messageIndex) => messageIndex === index ? { ...message, action: action ?? undefined } : message));
  }
  function chooseAction(action: ChatActionCard, choice: { id: string; name?: string; label?: string; before?: number }) {
    const next: ChatActionCard = { ...action, needsSelection: false };
    if (action.type === "generate_doc") {
      const template = action.template as { id: string; name: string } | undefined;
      next.entity = { type: "event", id: choice.id, title: choice.name ?? choice.label ?? "Event" };
      next.change = `Create ${template?.name ?? "document"} for ${choice.name ?? choice.label ?? "event"}`;
    } else if (action.type === "edit_deadline_rule") {
      next.ruleId = choice.id;
      next.label = choice.label ?? choice.name;
      next.before = choice.before;
    } else if (action.type === "draft_ledger_entry") {
      const draft = action.draft as Record<string, unknown> | undefined;
      if (draft) {
        const entry = { ...draft };
        delete entry.eventRef;
        next.entry = { ...entry, accountId: action.accountId, eventId: choice.id };
      }
      next.accountName = "Selected account";
      next.eventName = choice.name ?? null;
    }
    return next;
  }

  return <div className={`flex min-h-0 ${compact ? "h-full flex-col" : "h-[calc(100vh-8rem)] gap-4"}`}>
    {!compact && <aside className="w-64 shrink-0 space-y-3 overflow-y-auto border-r border-border pr-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Conversations</h2><Button size="sm" variant="outline" onClick={() => { setThreadId(null); setMessages([]); }}>New chat</Button></div>
      <Input aria-label="Search conversations" placeholder="Search conversations…" value={threadQuery} onChange={(event) => setThreadQuery(event.target.value)} />
      {threads.map((thread) => <button key={thread.id} onClick={() => void loadThread(thread.id)} className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary ${threadId === thread.id ? "bg-secondary" : ""}`}>{thread.title}</button>)}
    </aside>}
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto py-2">
        {messages.length === 0 && <div className="mx-auto mt-12 max-w-lg text-center"><h2 className="text-xl font-semibold">What should we move forward?</h2><p className="mt-2 text-sm text-muted-foreground">Ask about the CBL, RSO Manual, events, finance, or templates.</p></div>}
        {messages.map((message, index) => <article key={`${index}-${message.role}`} className={message.role === "user" ? "ml-auto max-w-[90%] rounded-lg bg-secondary p-3 text-sm" : "max-w-full space-y-3 text-sm"}>
          {message.role === "assistant" && message.bestMatch && <Card className="border-primary/30 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best match</p><p className="mt-1 font-medium">{message.bestMatch.headingPath || message.bestMatch.title} · p.{message.bestMatch.page}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{message.bestMatch.text}</p><Link className="mt-2 inline-block text-xs text-primary underline" href={`/cbl/${message.bestMatch.documentId}?p=${message.bestMatch.page}&hl=${encodeURIComponent(message.bestMatch.text ?? "")}`}>Show in PDF</Link></Card>}
          {message.content && <p className="whitespace-pre-wrap leading-6">{message.content}</p>}
          {message.citations?.length ? <div className="flex flex-wrap gap-1">{message.citations.map((citation, ci) => <Link key={`${citation.n}-${ci}`} title={citation.auto ? "Matched automatically" : citation.title ?? "Open cited passage"} className={`rounded-full border px-2 py-0.5 text-xs ${citation.auto ? "border-muted bg-muted/50 text-muted-foreground" : "border-primary/30 bg-primary/10 text-primary"}`} href={`/cbl/${citation.documentId}?p=${citation.page}&hl=${encodeURIComponent(citation.text ?? "")}`}>[{citation.n}]</Link>)}</div> : null}
          {message.action && <ActionCard action={message.action} onConfirm={() => void confirmAction(message.action!)} onChoose={(choice) => updateAction(index, chooseAction(message.action!, choice))} onDismiss={() => updateAction(index, null)} />}
        </article>)}
        {uploadCard && <Card className="space-y-3 border-primary/30 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{uploadCard.message}</p><p className="mt-1 text-xs text-muted-foreground">{uploadCard.filename}</p></div><button aria-label="Dismiss upload" onClick={() => setUploadCard(null)}><XIcon size={16} /></button></div>
          {uploadCard.type === "template" && uploadCard.candidates?.map((candidate) => <p key={candidate.id} className="text-sm">Possible replacement: {candidate.name} (v{candidate.version})</p>)}
          {uploadCard.type === "receipt" && <div className="grid gap-2 sm:grid-cols-2"><Combobox options={accounts.map((account) => ({ value: account.id, label: account.name }))} value={accountId} onChange={setAccountId} placeholder="Choose account…" /><Input aria-label="Receipt amount" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} placeholder="₱ amount" /><Input aria-label="Receipt date" type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /><Textarea aria-label="Receipt description" value={receiptDescription} onChange={(event) => setReceiptDescription(event.target.value)} placeholder="Description" /></div>}
          <Button size="sm" disabled={uploadCard.type === "receipt" && (!accountId || !parsePeso(receiptAmount) || !uploadCard.fileId)} onClick={() => void confirmUpload()}>{uploadCard.type === "receipt" ? "Confirm ledger draft" : "Confirm and continue"}</Button></Card>}
      </div>
      {error && <p role="status" className="my-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 rounded-lg border border-border bg-card p-2" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const dropped = event.dataTransfer.files[0]; if (dropped) void upload(dropped); }}>
        <Textarea aria-label="Message" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Ask or give a task…" className="min-h-16 w-full resize-y bg-transparent p-2 text-sm outline-none" />
        <div className="flex items-center justify-between"><div><input ref={fileRef} className="hidden" type="file" onChange={(event) => { const next = event.target.files?.[0]; if (next) void upload(next); }} /><Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}><UploadIcon size={15} /> Attach</Button><span className="ml-2 text-xs text-muted-foreground">Drop a file to review it</span></div><Button size="sm" disabled={busy || !text.trim()} onClick={() => void sendMessage()}><PaperAirplaneIcon size={14} /> Send</Button></div>
      </div>
    </section>
  </div>;
}

function ActionCard({ action, onConfirm, onChoose, onDismiss }: { action: ChatActionCard; onConfirm: () => void; onChoose: (choice: { id: string; name?: string; label?: string; before?: number }) => void; onDismiss: () => void }) {
  if (action.type === "unresolved") return <Card className="p-3"><p>{String(action.message)}</p><Link className="mt-2 inline-block text-primary underline" href={String(action.href ?? "/templates")}>Do this manually →</Link></Card>;
  if (action.needsSelection) return <Card className="space-y-2 p-3"><p className="font-medium">Choose the matching record before continuing.</p>{(action.choices as Array<{ id: string; name?: string; label?: string; before?: number }>).map((choice) => <Button key={choice.id} variant="outline" size="sm" onClick={() => onChoose(choice)}>{choice.name ?? choice.label}</Button>)}<Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button></Card>;
  const detail = action.type === "generate_doc" ? String(action.change ?? "Generate a document")
    : action.type === "edit_deadline_rule" ? `${String(action.label)}: ${String(action.before)} days → ${String(action.after)} days`
      : action.type === "draft_ledger_entry" ? `Draft ${String((action.entry as { kind?: string })?.kind)} for ${String(action.accountName)}`
        : `Map ${String(action.filename)} as a template`;
  return <Card className="space-y-3 border-primary/30 p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposed action</p><p className="mt-1 font-medium">{detail}</p></div><div className="flex gap-2"><Button size="sm" onClick={onConfirm}><CheckIcon size={14} /> Confirm</Button><Button size="sm" variant="outline" onClick={onDismiss}>Dismiss</Button></div></Card>;
}
