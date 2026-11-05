"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UploadIcon, FileIcon, CheckCircleFillIcon } from "@primer/octicons-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

const kindOptions = [
  ["activity_proposal", "Activity Proposal"], ["par", "Post-Activity Report"], ["liquidation", "Liquidation Report"],
  ["budget_proposal", "Budget Proposal"], ["financial_statement", "Financial Statement"], ["guest_list", "Guest List"],
  ["booth_declaration", "Booth Declaration"], ["letter_of_explanation", "Letter of Explanation"],
  ["turnover_certificate", "Turnover Certificate"], ["resolution", "Resolution"], ["other", "Other"],
].map(([value, label]) => ({ value, label }));
type TemplateSummary = { id: string; name: string; kind: string; source: string; format: string; version: number; active: boolean; mappingConfirmedAt: string | null; previousTemplateId: string | null; originalName?: string };

export default function TemplatesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [rows, setRows] = useState<TemplateSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("other");
  const [source, setSource] = useState("org");
  const [upload, setUpload] = useState<{ template: TemplateSummary; candidates: Array<{ template: TemplateSummary; score: number }> } | null>(null);
  const [flatPdf, setFlatPdf] = useState<{ message: string; equivalent: { id: string; name: string } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/templates");
    const payload = await response.json().catch(() => ({ templates: [] }));
    setRows(payload.templates ?? []);
  }, []);
  useEffect(() => {
    let current = true;
    void fetch("/api/templates").then((response) => response.json()).then((payload) => {
      if (current) setRows(payload.templates ?? []);
    }).catch(() => {
      if (current) setRows([]);
    });
    return () => { current = false; };
  }, []);

  function choose(next: File | null) {
    setError("");
    setUpload(null);
    setFlatPdf(null);
    setFile(next);
    if (next) setName(next.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("name", name);
    form.append("kind", kind);
    form.append("source", source);
    try {
      const response = await apiFetch("/api/templates", { method: "POST", body: form });
      const payload = await response.json();
      if (payload.unsupported === "flat_pdf") {
        setFlatPdf({ message: payload.message, equivalent: payload.equivalent ?? null });
        return;
      }
      if (!response.ok) throw new Error(payload.error?.message ?? payload.message ?? payload.error ?? "Upload failed.");
      setUpload(payload);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function makeNew() {
    if (!upload) return;
    const response = await apiFetch(`/api/templates/${upload.template.id}/replace`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "new" }),
    });
    if (response.ok) router.push(`/templates/${upload.template.id}`);
  }

  const grouped = rows.reduce<Record<string, TemplateSummary[]>>((acc, row) => {
    (acc[row.kind] ??= []).push(row);
    return acc;
  }, {});
  return (
    <WorkspaceShell><div
      className="mx-auto max-w-6xl space-y-5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0] ?? null); }}
    >
      <header className="flex items-center justify-between gap-4">
        <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Files & automation</p><h1 className="text-2xl font-semibold">Templates</h1></div>
        <Button type="button" onClick={() => inputRef.current?.click()}><UploadIcon size={16} /> Upload template</Button>
        <input ref={inputRef} className="hidden" type="file" accept=".docx,.xlsx,.xlsm,.pdf" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
      </header>

      <section
        className="rounded-lg border border-dashed border-border bg-card/60 px-6 py-9 text-center"
        onClick={() => !file && inputRef.current?.click()}
      >
        <UploadIcon size={22} className="mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">{file ? file.name : "Drop a DOCX, XLSX, or fillable PDF template here"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Or choose Upload template. Sample values are never used for field mapping.</p>
      </section>

      {file && !upload && (
        <Card className="grid gap-3 p-4 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
          <label className="text-sm">Template name<Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <div><span className="text-sm">Kind</span><div className="mt-1"><Combobox options={kindOptions} value={kind} onChange={setKind} /></div></div>
          <div className="flex gap-1" aria-label="Template source">
            {["sdao", "scoa", "org"].map((value) => <Button key={value} type="button" size="sm" variant={source === value ? "default" : "outline"} onClick={() => setSource(value)}>{value.toUpperCase()}</Button>)}
          </div>
          <div className="md:col-span-3 flex items-center justify-between"><p className="text-sm text-destructive">{error}</p><div className="flex gap-2"><Button variant="outline" onClick={() => choose(null)}>Cancel</Button><Button disabled={busy || !name.trim()} onClick={() => void submit()}>{busy ? "Reading…" : "Continue"}</Button></div></div>
        </Card>
      )}
      {flatPdf && <Card className="flex flex-wrap items-center justify-between gap-3 border-attention/50 p-4"><p className="text-sm">{flatPdf.message}</p>{flatPdf.equivalent ? <Link className="text-sm text-primary underline" href={`/templates/${flatPdf.equivalent.id}`}>Open {flatPdf.equivalent.name}</Link> : null}</Card>}

      {upload && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-primary/40 p-4">
          <div><p className="font-medium">{upload.candidates.length ? <>Looks like a new version of <strong>{upload.candidates[0]?.template.name}</strong> (v{upload.candidates[0]?.template.version}). Replace it?</> : "Template uploaded. Map its fields before generating."}</p><p className="text-sm text-muted-foreground">Review the mapping reuse and label changes before confirming.</p></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/templates/${upload.template.id}`)}>{upload.candidates.length ? "Review changes" : "Map fields"}</Button>
            {upload.candidates.length > 0 && <Button onClick={() => void makeNew()}>It&apos;s a new template</Button>}
            <Button variant="ghost" onClick={() => { setUpload(null); choose(null); }}>Dismiss</Button>
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([group, templates]) => (
          <section key={group}>
            <h2 className="mb-2 text-sm font-semibold">{kindOptions.find((option) => option.value === group)?.label ?? group}</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => <Link href={`/templates/${template.id}`} key={template.id} className="rounded-lg border border-border bg-card p-4 transition hover:border-primary/50">
                <div className="flex items-start justify-between gap-3"><div className="flex gap-2"><FileIcon size={18} className="mt-0.5 text-muted-foreground" /><div><p className="font-medium">{template.name}</p><p className="mt-1 text-xs text-muted-foreground">{template.source.toUpperCase()} · {template.format.toUpperCase()} · v{template.version}</p></div></div>
                  <span className="flex gap-1">{template.active && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">Active</span>}<span className={`rounded-full px-2 py-0.5 text-xs ${template.mappingConfirmedAt ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>{template.mappingConfirmedAt ? <CheckCircleFillIcon size={12} /> : "Needs mapping"}</span></span>
                </div>
              </Link>)}
            </div>
          </section>
        ))}
      </div>
    </div></WorkspaceShell>
  );
}
