"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, XIcon } from "@primer/octicons-react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { TemplateGeneration } from "@/components/templates/template-generation";

type Target = { id: string; label: string; kind: string; columns?: Array<{ index: number; label: string }> };
type MappingValue = { field?: string; confidence?: number; skipped?: boolean; columns?: Record<string, string> };
type DictionaryField = { key: string; label: string; type: string; synonyms: string[]; columns?: Array<{ key: string; label: string; type: string; synonyms?: string[] }> };
type TemplateInfo = { id: string; name: string; kind: string; format: string; fileId: string; version: number; active: boolean; previousTemplateId: string | null; mappingConfirmedAt: string | null; structure: { targets: Target[] }; mapping: Record<string, MappingValue> };
type FilePreview = { type: string; html?: string; sheets?: Array<{ name: string; rows: unknown[][] }> };

function askKey(label: string) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 56);
  return `ask.${slug || "field"}`;
}

export function TemplateMapping({ id }: { id: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [previous, setPrevious] = useState<TemplateInfo | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryField[]>([]);
  const [noAIConfigured, setNoAIConfigured] = useState(false);
  const [mapping, setMapping] = useState<Record<string, MappingValue>>({});
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void fetch(`/api/templates/${id}/mapping`).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load template.");
      const previewResponse = await fetch(`/api/files/${payload.template.fileId}/preview`);
      const filePreview = await previewResponse.json().catch(() => null);
      if (!current) return;
      setTemplate(payload.template);
      setPrevious(payload.previous);
      setDictionary(payload.dictionary);
      setNoAIConfigured(Boolean(payload.noAIConfigured));
      setMapping(payload.template.mapping ?? {});
      setPreview(filePreview);
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : "Could not load template.");
    });
    return () => { current = false; };
  }, [id]);

  const targets = template?.structure.targets ?? [];
  const visible = onlyUnmapped ? targets.filter((target) => !mapping[target.id]?.field && !mapping[target.id]?.skipped) : targets;
  const options = useMemo(() => dictionary.map((field) => ({ value: field.key, label: `${field.label} · ${field.type}` })), [dictionary]);
  const complete = targets.every((target) => Boolean(mapping[target.id]?.field || mapping[target.id]?.skipped));
  const diff = useMemo(() => {
    if (!previous || !template) return null;
    const oldLabels = previous.structure.targets.map((target) => target.label.trim().toLowerCase());
    const newLabels = template.structure.targets.map((target) => target.label.trim().toLowerCase());
    return {
      kept: newLabels.filter((label) => oldLabels.includes(label)),
      added: newLabels.filter((label) => !oldLabels.includes(label)),
      removed: oldLabels.filter((label) => !newLabels.includes(label)),
    };
  }, [previous, template]);

  function setField(target: Target, field: string) {
    setMapping((current) => ({
      ...current,
      [target.id]: field ? { field, confidence: field.startsWith("ask.") ? 1 : current[target.id]?.confidence ?? 1 } : { skipped: true },
    }));
  }
  function setColumn(target: Target, index: number, field: string) {
    setMapping((current) => {
      const value = current[target.id] ?? {};
      const columns = { ...(value.columns ?? {}) };
      if (field) columns[String(index)] = field;
      else delete columns[String(index)];
      return { ...current, [target.id]: { ...value, columns } };
    });
  }
  async function save() {
    if (!complete) return;
    setBusy(true);
    const response = await apiFetch(`/api/templates/${id}/mapping`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mapping }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setError(payload.error?.message ?? "Could not save mapping."); return; }
    setTemplate(payload.template);
    setError("");
  }
  async function confirmVersion() {
    setBusy(true);
    const response = await apiFetch(`/api/templates/${id}/replace`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm" }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setError(payload.error ?? "Could not confirm replacement."); return; }
    router.push("/templates");
  }

  if (!template) return <div className="mx-auto max-w-6xl"><p className="text-sm text-muted-foreground">{error || "Loading template…"}</p></div>;
  return <div className="mx-auto max-w-7xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/templates" className="text-sm text-muted-foreground">Templates</Link><h1 className="text-2xl font-semibold">{template.name}</h1><p className="text-sm text-muted-foreground">Map labels to app fields. Uploaded sample values are not read into mappings.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setOnlyUnmapped((value) => !value)}>{onlyUnmapped ? "Show all" : `Unmapped (${targets.filter((target) => !mapping[target.id]?.field && !mapping[target.id]?.skipped).length})`}</Button><Button disabled={!complete || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save mapping"}</Button></div>
    </header>
    {template.previousTemplateId && diff && <Card className="space-y-3 p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Version changes · v{previous?.version ?? template.version - 1} → v{template.version}</h2>{template.active ? <Badge variant="secondary">Active version</Badge> : <Button disabled={busy || !template.mappingConfirmedAt} onClick={() => void confirmVersion()}>Confirm v{template.version}</Button>}</div>
      <div className="grid gap-3 md:grid-cols-3"><DiffList title={`Kept (${diff.kept.length})`} items={diff.kept} icon="check" /><DiffList title={`New (${diff.added.length})`} items={diff.added} icon="new" /><DiffList title={`Removed (${diff.removed.length})`} items={diff.removed} icon="remove" /></div>
      <p className="text-xs text-muted-foreground">Save the mapping before activating this replacement. Existing generated files remain linked to their original template version.</p>
    </Card>}
    <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
      <Card className="min-h-[560px] overflow-auto p-4">
        <h2 className="mb-3 font-semibold">Template preview</h2>
        {preview?.type === "docx" && <article className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: preview.html ?? "" }} />}
        {preview?.type === "xlsx" && preview.sheets?.map((sheet) => <div key={sheet.name} className="mb-5"><h3 className="mb-2 text-sm font-medium">{sheet.name}</h3><div className="overflow-auto"><table className="border-collapse text-xs"><tbody>{sheet.rows.map((row, ri) => <tr key={ri}>{row.map((raw, ci) => { const cell = raw && typeof raw === "object" ? raw as { v?: unknown; missing?: boolean; targetId?: string } : { v: raw }; return <td key={ci} onClick={() => cell.targetId && setSelected(cell.targetId)} className={`max-w-48 cursor-pointer border border-border px-2 py-1 ${cell.missing ? "bg-red-500/15 ring-1 ring-red-500" : ""} ${cell.targetId === selected ? "outline outline-2 outline-primary" : ""}`}>{String(cell.v ?? "")}</td>; })}</tr>)}</tbody></table></div></div>)}
        {!preview && <p className="text-sm text-muted-foreground">Preview unavailable.</p>}
      </Card>
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Target mapping</h2><Badge variant="secondary">{targets.length} targets</Badge></div>
        {noAIConfigured && <p className="rounded-md bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">Mapped by label matching. Check the fields below.</p>}
        {visible.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Every target is mapped or explicitly skipped.</p>}
        <div className="max-h-[680px] space-y-2 overflow-auto pr-1">
          {visible.map((target, index) => {
            const value = mapping[target.id] ?? {};
            return <div key={target.id} onClick={() => setSelected(target.id)} className={`rounded-md border p-3 ${selected === target.id ? "border-primary ring-1 ring-primary/40" : "border-border"}`}>
              <div className="mb-2 flex items-start justify-between gap-2"><div><span className="mr-2 text-xs text-muted-foreground">{index + 1} · {target.id}</span><p className="font-medium">{target.label}</p></div>{value.confidence !== undefined && <span className={`mt-1 h-2.5 w-2.5 rounded-full ${value.confidence >= 0.75 ? "bg-emerald-500" : value.confidence >= 0.5 ? "bg-amber-500" : "bg-red-500"}`} title={`Confidence ${Math.round(value.confidence * 100)}%`} />}</div>
              <Combobox options={options} value={value.field?.startsWith("ask.") ? "" : value.field} placeholder="Choose a field…" onChange={(field) => setField(target, field)} />
              <div className="mt-2 flex gap-2"><Button size="sm" variant={value.field?.startsWith("ask.") ? "default" : "outline"} onClick={() => setField(target, askKey(target.label))}>Ask when generating</Button><Button size="sm" variant={value.skipped ? "default" : "outline"} onClick={() => setField(target, "")}>Leave empty</Button></div>
              {target.columns?.length ? <div className="mt-3 space-y-2 border-t border-border pt-3"><p className="text-xs font-medium text-muted-foreground">Repeating columns</p>{target.columns.map((column) => {
                const field = dictionary.find((item) => item.key === value.field);
                const columnOptions = (field?.columns ?? []).map((item) => ({ value: item.key, label: `${item.label} · ${item.type}` }));
                return <label key={column.index} className="grid items-center gap-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"><span>{column.label}</span><Combobox options={columnOptions} value={value.columns?.[String(column.index)]} onChange={(selectedField) => setColumn(target, column.index, selectedField)} placeholder="Choose a row field…" /></label>;
              })}</div> : null}
            </div>;
          })}
        </div>
      </Card>
    </div>
    {template.mappingConfirmedAt && <TemplateGeneration templateId={id} active={template.active} mapping={mapping} targets={targets} />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

function DiffList({ title, items, icon }: { title: string; items: string[]; icon: "check" | "new" | "remove" }) {
  return <div className="rounded-md bg-secondary/50 p-3"><h3 className="mb-2 text-sm font-medium">{title}</h3><ul className="space-y-1 text-sm">{items.slice(0, 12).map((item, index) => <li key={`${item}-${index}`} className="flex items-start gap-2">{icon === "check" ? <CheckIcon size={14} /> : icon === "remove" ? <XIcon size={14} /> : <span className="text-primary">+</span>}<span>{item}</span></li>)}</ul>{items.length > 12 && <p className="mt-1 text-xs text-muted-foreground">and {items.length - 12} more</p>}</div>;
}
