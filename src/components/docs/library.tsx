"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileIcon, PlusIcon, StopIcon, SyncIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

type DocumentRow = {
  id: string;
  lineageId: string;
  title: string;
  kind: "cbl" | "rso_manual" | "reference";
  version: number;
  pageCount: number;
  status: string;
  progress: number;
  error: string | null;
  ocr: boolean;
  active: boolean;
  indexedModel?: string | null;
  keywordOnly?: boolean;
  job: { id: string; status: string; progress: number } | null;
};

const kindNames = { cbl: "Constitution & By-Laws", rso_manual: "RSO Manual", reference: "References" };

export function DocumentsLibrary() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [kind, setKind] = useState<DocumentRow["kind"]>("cbl");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [newVersion, setNewVersion] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [already, setAlready] = useState<{ title: string; href: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoOpened = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/documents", { cache: "no-store" });
    if (response.ok) {
      setDocuments((await response.json()).documents);
      setLoaded(true);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the remote library on mount.
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (!ask || autoOpened.current || !loaded) return;
    autoOpened.current = true;
    const document = documents.find((row) => row.kind === "cbl" && row.active)
      ?? documents.find((row) => row.kind === "rso_manual" && row.active);
    if (document) router.push(`/cbl/${document.id}?ask=${encodeURIComponent(ask)}`);
  }, [documents, loaded, router]);
  useEffect(() => {
    if (!documents.some((document) => ["queued", "extracting", "chunking", "embedding"].includes(document.status))) return;
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [documents, refresh]);

  const upload = async (selected = file) => {
    if (!selected) return;
    setPending(true);
    setError("");
    setAlready(null);
    const body = new FormData();
    body.set("file", selected);
    body.set("kind", kind);
    body.set("title", title.trim() || selected.name.replace(/\.pdf$/i, ""));
    body.set("newVersion", String(newVersion));
    try {
      const response = await apiFetch("/api/documents", { method: "POST", body });
      const result = await response.json();
      if (response.status === 409 && result.href) {
        setAlready({ title: result.document.title, href: result.href });
      } else if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Could not add this document.");
      } else {
        setFile(null);
        setTitle("");
        if (inputRef.current) inputRef.current.value = "";
        await refresh();
      }
    } catch {
      setError("The document could not be uploaded.");
    } finally {
      setPending(false);
    }
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setTitle(dropped.name.replace(/\.pdf$/i, ""));
    }
  };

  const activeCbl = documents.some((document) => document.kind === "cbl" && document.active);
  const cancel = async (jobId: string) => {
    await apiFetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
    await refresh();
  };
  const retry = async (documentId: string) => {
    await apiFetch(`/api/documents/${documentId}/retry`, { method: "POST" });
    await refresh();
  };

  const missingAskDocument = loaded
    && Boolean(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("ask"))
    && !documents.some((document) => ["cbl", "rso_manual"].includes(document.kind) && document.active);

  return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document library</p><h1 className="mt-1 text-2xl font-semibold">CBL &amp; RSO Manual</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search the organization’s governing documents offline and ask questions with page citations.</p></div>
      <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground">Search works offline · no model required</span>
    </header>

    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Add a document</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_1.2fr]">
        <select value={kind} onChange={(event) => setKind(event.target.value as DocumentRow["kind"])} className="h-10 rounded-md border border-border bg-background px-3 text-sm">
          <option value="cbl">CBL</option><option value="rso_manual">RSO Manual</option><option value="reference">Reference</option>
        </select>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" className="h-10 rounded-md border border-border bg-background px-3 text-sm" />
        <div onDragOver={(event) => event.preventDefault()} onDrop={drop} className="flex min-h-10 items-center gap-3 rounded-md border border-dashed border-border bg-background px-3 py-2">
          <FileIcon size={16} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{file?.name ?? "Drop a PDF here or choose a file (50 MB max)"}</span>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            if (selected) setTitle(selected.name.replace(/\.pdf$/i, ""));
          }} />
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>Choose PDF</Button>
        </div>
      </div>
      {kind === "cbl" && activeCbl && <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={newVersion} onChange={(event) => setNewVersion(event.target.checked)} />
        Upload as a new version of {documents.find((document) => document.kind === "cbl" && document.active)?.title}
      </label>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!file || pending} onClick={() => void upload()}><PlusIcon size={14} />{pending ? "Uploading…" : "Add to library"}</Button>
        {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
        {missingAskDocument && <span role="status" className="text-sm text-attention">Add the CBL or RSO Manual to start cited chat.</span>}
        {already && <span className="text-sm">Already in library: <Link className="text-primary underline" href={already.href}>Open {already.title}</Link></span>}
      </div>
    </section>

    {!documents.length ? <section className="grid gap-3 md:grid-cols-2">
      {(["cbl", "rso_manual"] as const).map((type) => <button key={type} type="button" onClick={() => setKind(type)} className="rounded-lg border border-dashed border-border bg-card p-6 text-left hover:bg-secondary/50">
        <FileIcon size={18} className="text-primary" /><h2 className="mt-3 font-semibold">{type === "cbl" ? "Add your CBL" : "Add the RSO Manual"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Upload a PDF to make it searchable and available to cited chat.</p>
      </button>)}
    </section> : <div className="space-y-5">
      {(["cbl", "rso_manual", "reference"] as const).map((group) => {
        const rows = documents.filter((document) => document.kind === group);
        if (!rows.length) return null;
        const lineages = new Map<string, DocumentRow[]>();
        for (const row of rows) lineages.set(row.lineageId, [...(lineages.get(row.lineageId) ?? []), row]);
        return <section key={group} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{kindNames[group]}</h2>
          {[...lineages.values()].map((versions) => <div key={versions[0]!.lineageId} className="overflow-hidden rounded-lg border border-border bg-card">
            {versions.sort((a, b) => b.version - a.version).map((document) => <article key={document.id} className="flex flex-wrap items-center gap-3 border-b border-border p-4 last:border-0">
              <FileIcon size={17} className="shrink-0 text-muted-foreground" />
              <div className="min-w-48 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Link href={`/cbl/${document.id}`} className="font-medium text-primary underline-offset-2 hover:underline">{document.title}</Link>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">v{document.version}{document.active ? " · Active" : " · Older version"}</span>
                  {document.ocr && <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">OCR’d</span>}
                  {document.status === "ready" && document.indexedModel && <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Indexed with {document.indexedModel}</span>}
                  {document.status === "ready" && document.keywordOnly && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Keyword search only</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{document.pageCount} pages · {document.status.replaceAll("_", " ")}</p>
                {["queued", "extracting", "chunking", "embedding"].includes(document.status) && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${document.progress}%` }} /></div>}
                {document.error && <p role="alert" className="mt-1 text-xs text-destructive">{document.error}</p>}
              </div>
              {document.status === "needs_ocr" && <Link href={`/cbl/${document.id}?ocr=1`} className="text-sm text-attention underline">Needs OCR · Run OCR</Link>}
              {document.job && ["queued", "running"].includes(document.job.status) && <Button variant="ghost" size="sm" onClick={() => void cancel(document.job!.id)}><StopIcon size={14} />Cancel</Button>}
              {["error", "cancelled"].includes(document.status) && <Button variant="outline" size="sm" onClick={() => void retry(document.id)}><SyncIcon size={14} />Retry</Button>}
              <Link href={`/cbl/${document.id}`} className="rounded-md border border-border px-3 py-2 text-sm">Open</Link>
            </article>)}
          </div>)}
        </section>;
      })}
    </div>}
  </div>;
}
