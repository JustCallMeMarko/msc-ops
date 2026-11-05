"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import type { GridPreviewCell } from "@/lib/templates/types";

type EventChoice = { id: string; name: string };
type Target = { id: string; label: string; kind: string; columns?: Array<{ index: number; label: string; type?: string }> };
type Grid = { name: string; rows: GridPreviewCell[][] };
type Preview = { type: string; html?: string; sheets?: Grid[]; missing: Array<{ targetId: string; label: string }> };

export function TemplateGeneration({ templateId, active, mapping, targets, initialEventId }: {
  templateId: string;
  active: boolean;
  mapping: Record<string, { field?: string; skipped?: boolean; columns?: Record<string, string> }>;
  targets: Target[];
  initialEventId?: string;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<EventChoice[]>([]);
  const [eventId, setEventId] = useState(initialEventId ?? "");
  const [askValues, setAskValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const asks = useMemo(() => targets.filter((target) => mapping[target.id]?.field?.startsWith("ask.")), [mapping, targets]);
  function rowsFor(target: Target) {
    const raw = askValues[mapping[target.id]?.field ?? ""];
    if (!raw) return [{}];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) && parsed.length && parsed.every((item) => item && typeof item === "object") ? parsed as Array<Record<string, string>> : [{}];
    } catch {
      return [{}];
    }
  }
  function setRows(target: Target, rows: Array<Record<string, string>>) {
    const field = mapping[target.id]?.field;
    if (!field) return;
    setAskValues((current) => ({ ...current, [field]: JSON.stringify(rows) }));
  }
  useEffect(() => {
    void fetch("/api/events").then((response) => response.json()).then((data: EventChoice[]) => setEvents(data)).catch(() => setEvents([]));
  }, []);

  async function loadPreview() {
    if (!eventId) return;
    setBusy(true);
    setError("");
    const response = await apiFetch(`/api/templates/${templateId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: { type: "event", id: eventId }, askValues }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setError(payload.error?.message ?? payload.message ?? "Could not preview this document."); return; }
    setPreview(payload);
  }

  async function generate() {
    if (!eventId || !preview || preview.missing.length) return;
    setBusy(true);
    setError("");
    const response = await apiFetch(`/api/templates/${templateId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: { type: "event", id: eventId }, askValues }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setError(payload.error?.message ?? payload.message ?? "Could not generate this document."); return; }
    if (payload.missing?.length) {
      setPreview((current) => current ? { ...current, missing: payload.missing } : current);
      return;
    }
    if (!payload.file?.id) { setError("The generated file is unavailable."); return; }
    toast.success("Document generated and saved to Files.");
    router.push(`/files?panel=file&id=${payload.file.id}`);
  }

  return <Card className="space-y-4 p-4">
    <div><h2 className="font-semibold">Generate document</h2><p className="text-sm text-muted-foreground">Choose an event and review the filled preview before saving.</p></div>
    <Combobox options={events.map((event) => ({ value: event.id, label: event.name }))} value={eventId} onChange={(value) => { setEventId(value); setPreview(null); }} placeholder="Choose an event…" />
    {asks.map((target) => <div key={target.id} className="space-y-2 text-sm"><span className="font-medium">{target.label}</span>{target.kind === "rows"
      ? <div className="overflow-x-auto rounded border border-border"><table className="w-full border-collapse text-xs"><thead><tr>{target.columns?.map((column) => <th key={column.index} className="border-b border-border bg-secondary/50 px-2 py-1 text-left">{column.label}</th>)}<th className="border-b border-border px-2 py-1" /></tr></thead><tbody>{rowsFor(target).map((row, rowIndex) => <tr key={rowIndex}>{target.columns?.map((column) => {
        const field = mapping[target.id]?.columns?.[String(column.index)] ?? column.label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const isDate = /date|occurred|deadline/i.test(field) || column.type === "date";
        const isPeso = /amount|peso|cost|total|price|balance/i.test(field) || column.type === "peso";
        return <td key={column.index} className="border-b border-border p-1"><Input type={isDate ? "date" : "text"} inputMode={isPeso ? "decimal" : undefined} placeholder={isPeso ? "₱0.00" : undefined} value={row[field] ?? ""} onChange={(event) => setRows(target, rowsFor(target).map((item, index) => index === rowIndex ? { ...item, [field]: event.target.value } : item))} /></td>;
      })}<td className="border-b border-border p-1"><Button type="button" size="sm" variant="ghost" onClick={() => setRows(target, rowsFor(target).filter((_, index) => index !== rowIndex))}>Remove</Button></td></tr>)}</tbody></table><Button type="button" size="sm" variant="outline" className="m-2" onClick={() => setRows(target, [...rowsFor(target), {}])}>Add row</Button></div>
      : <Input value={askValues[mapping[target.id]?.field ?? ""] ?? ""} onChange={(event) => setAskValues((current) => ({ ...current, [mapping[target.id]?.field ?? ""]: event.target.value }))} />}</div>)}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!active || !eventId || busy} onClick={() => void loadPreview()}>{busy ? "Preparing…" : "Preview"}</Button><Button disabled={!active || !preview || Boolean(preview.missing.length) || busy} onClick={() => void generate()}>{busy ? "Generating…" : "Generate & download"}</Button><Link className="inline-flex min-h-9 items-center px-2 text-sm text-primary hover:underline" href="/files">Open in Files</Link></div>
    {preview?.missing.length ? <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3"><h3 className="text-sm font-medium text-destructive">Missing fields</h3><ul className="mt-1 space-y-1 text-sm text-destructive">{preview.missing.map((item) => <li key={item.targetId}>{item.label}</li>)}</ul></div> : null}
    {preview?.type === "docx" && <article className="prose prose-sm max-h-[440px] max-w-none overflow-auto rounded-md border border-border bg-background p-4 dark:prose-invert [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1" dangerouslySetInnerHTML={{ __html: preview.html ?? "" }} />}
    {preview?.type === "xlsx" && preview.sheets?.map((sheet) => <div key={sheet.name} className="overflow-auto"><h3 className="mb-2 text-sm font-medium">{sheet.name}</h3><table className="border-collapse text-xs"><tbody>{sheet.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => cell.skip ? null : <td key={ci} colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={`max-w-48 border border-border px-2 py-1 ${cell.missing ? "bg-red-500/15 ring-1 ring-red-500" : ""}`}>{String(cell.v ?? "")}</td>)}</tr>)}</tbody></table></div>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </Card>;
}
