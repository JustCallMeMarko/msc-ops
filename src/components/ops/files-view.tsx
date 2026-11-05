"use client";
/* eslint-disable @next/next/no-img-element -- File previews render local stored images only. */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, FileBinaryIcon, FileCodeIcon, FileIcon, FileMediaIcon, FileZipIcon, TrashIcon, UploadIcon, XIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { EmptyState } from "@/components/patterns/empty-state";
import { RelativeDate } from "@/components/patterns/relative-date";
import { toastUndo } from "@/components/patterns/toast-undo";
import { apiFetch } from "@/lib/api-client";
import { FILE_KIND_LABELS, FILE_SOURCE_LABELS, enumLabel, fileKindLabel } from "@/lib/ui-labels";

type FileLink = { entityType: string; entityId: string; role: string; label: string; href: string | null };
type FileRow = { id: string; originalName: string; mime: string; size: number; kind: string; source: string | null; tags: string[]; version?: number; createdAt: string; links?: FileLink[] };
const kinds = Object.keys(FILE_KIND_LABELS);

function parseFileQuery(value: string) {
  const filters: Record<string, string> = {};
  const text: string[] = [];
  for (const token of value.trim().split(/\s+/).filter(Boolean)) {
    const separator = token.indexOf(":");
    const key = separator > 0 ? token.slice(0, separator).toLowerCase() : "";
    const qualifier = separator > 0 ? token.slice(separator + 1) : "";
    if (["kind", "source", "event", "tag"].includes(key) && qualifier) filters[key] = qualifier;
    else text.push(token);
  }
  return { filters, text: text.join(" ") };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

function FileTypeIcon({ mime }: { mime: string }) {
  const Icon = mime.startsWith("text/") || mime === "application/json"
    ? FileCodeIcon
    : mime.startsWith("video/")
      ? FileMediaIcon
      : ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mime)
                    ? FileZipIcon
        : mime === "application/pdf" ? FileIcon : FileBinaryIcon;
  return <Icon size={18} className="shrink-0 text-muted-foreground" />;
}

export function FilesView() {
  const router = useRouter();
  const params = useSearchParams();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [usage, setUsage] = useState<Record<string, { count: number; bytes: number }>>({});
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [libraryDocuments, setLibraryDocuments] = useState<Record<string, { id: string; title: string }>>({});
  const selectedId = params.get("panel") === "file" ? params.get("id") : null;
  const selected = files.find((file) => file.id === selectedId) ?? null;
  const load = useCallback(async () => {
    const search = new URLSearchParams();
    const parsed = parseFileQuery(query);
    if (kind !== "all") search.set("kind", kind);
    else if (parsed.filters.kind) search.set("kind", parsed.filters.kind);
    for (const key of ["source", "event", "tag"]) {
      if (parsed.filters[key]) search.set(key, parsed.filters[key]);
    }
    if (parsed.text) search.set("q", parsed.text);
    const response = await fetch(`/api/files?${search}`);
    if (response.ok) { const body = await response.json(); setFiles(body.files); setUsage(body.usage); }
    setLoading(false);
  }, [kind, query]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch remote file metadata on filter changes.
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void fetch("/api/documents").then((response) => response.json()).then((payload) => {
      const mapped: Record<string, { id: string; title: string }> = {};
      for (const document of payload.documents ?? []) mapped[document.fileId] = { id: document.id, title: document.title };
      setLibraryDocuments(mapped);
    }).catch(() => setLibraryDocuments({}));
  }, []);
  useEffect(() => {
    const onUploaded = () => { void load(); };
    window.addEventListener("msc-file-uploaded", onUploaded);
    return () => window.removeEventListener("msc-file-uploaded", onUploaded);
  }, [load]);

  function setPreview(file: FileRow | null) {
    const next = new URLSearchParams(params.toString());
    if (file) {
      next.set("panel", "file");
      next.set("id", file.id);
    } else {
      next.delete("panel");
      next.delete("id");
    }
    router.replace(`/files${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  async function remove(file: FileRow) {
    const response = await apiFetch(`/api/files/${file.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not delete file.");
    setPreview(null);
    await load();
    toastUndo(`${file.originalName} deleted.`, () => { void apiFetch(`/api/files/${file.id}/restore`, { method: "POST" }).then(load); });
  }

  async function updateFile(file: FileRow, patch: { originalName?: string; tags?: string[] }) {
    const response = await apiFetch(`/api/files/${file.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (!response.ok) return toast.error("Could not save file metadata.");
    const updated = await response.json() as FileRow;
    setFiles((current) => current.map((entry) => entry.id === updated.id ? { ...updated, links: file.links } : entry));
    toast.success("File metadata saved.");
  }

  const totalBytes = Object.values(usage).reduce((total, entry) => total + entry.bytes, 0);
  const usageColors = ["bg-primary", "bg-success", "bg-attention", "bg-destructive", "bg-muted-foreground"];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Files</h1><p className="text-sm text-muted-foreground">Local documents, event photos, and attachments.</p></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-primary bg-primary px-3 py-2 text-sm font-medium text-white"><UploadIcon size={14} />Upload<Input type="file" className="sr-only h-px w-px" onChange={(event) => { const selectedFiles = Array.from(event.currentTarget.files ?? []); if (selectedFiles.length) window.dispatchEvent(new CustomEvent("msc-upload-files", { detail: selectedFiles })); event.currentTarget.value = ""; }} /></label></div>
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]"><section className="space-y-3"><div className="flex gap-2"><Input placeholder="Filter: kind: source: event: tag: or search by name…" value={query} onChange={(event) => setQuery(event.target.value)} /><Select value={kind} onValueChange={setKind}><SelectTrigger className="w-40"><span>{kind === "all" ? "All kinds" : FILE_KIND_LABELS[kind] ?? kind}</span></SelectTrigger><SelectContent><SelectItem value="all">All kinds</SelectItem>{kinds.map((value) => <SelectItem key={value} value={value}>{FILE_KIND_LABELS[value]}</SelectItem>)}</SelectContent></Select></div>
      {loading ? <div className="h-64 animate-pulse rounded bg-secondary" aria-label="Loading files" /> : files.length ? <div className="divide-y divide-border rounded border border-border bg-card">{files.map((file) => <div key={file.id} role="button" tabIndex={0} onClick={() => setPreview(file)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPreview(file); } }} className="flex flex-wrap items-center gap-3 p-3 text-left hover:bg-secondary">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          {file.mime.startsWith("image/") ? <img src={`/api/files/${file.id}/content`} alt="" className="size-8 shrink-0 rounded object-cover" /> : <FileTypeIcon mime={file.mime} />}
          <span className="min-w-0 flex-1 truncate"><span className="font-medium">{file.originalName}</span><span className="ml-2 inline-flex rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{fileKindLabel(file.kind, file.source)}</span>{file.source && <span className="ml-1 text-xs text-muted-foreground">{FILE_SOURCE_LABELS[file.source] ?? enumLabel(file.source)}</span>}{file.tags.map((tag) => <span key={tag} className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">#{tag}</span>)}</span>
          <span className="shrink-0 text-right text-xs text-muted-foreground"><span className="block">v{file.version ?? 1} · {formatBytes(file.size)}</span><span className="block"><RelativeDate date={file.createdAt} /></span></span>
        </span>
        {(file.links?.length || libraryDocuments[file.id]) ? <div className="flex w-full flex-wrap items-center gap-1 pl-11 text-xs sm:w-auto sm:max-w-[45%] sm:pl-0"><span className="text-muted-foreground">Used by</span>{file.links?.map((link) => link.href ? <a key={`${link.entityType}-${link.entityId}-${link.role}`} href={link.href} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} title={link.label} className="max-w-56 truncate rounded-full border border-border bg-background px-2 py-0.5 text-primary hover:bg-secondary">{link.entityType === "task" ? link.label.split(" ").slice(0, 1).join("") : link.label}</a> : <span key={`${link.entityType}-${link.entityId}-${link.role}`} className="rounded-full border border-border px-2 py-0.5">{link.label}</span>)}{libraryDocuments[file.id] && <a href={`/cbl/${libraryDocuments[file.id]!.id}`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className="rounded-full border border-border bg-background px-2 py-0.5 text-primary hover:bg-secondary">CBL library</a>}</div> : null}
      </div>)}</div> : <EmptyState title="No files found" teachingText="Upload a PDF, document, or event photo." />}
    </section>
    <aside className="space-y-3 rounded border border-border bg-card p-4">
      {selected ? <div className="flex items-start justify-between gap-2"><h2 className="break-words font-semibold">{selected.originalName}</h2><Button size="icon" variant="ghost" aria-label="Close file preview" onClick={() => setPreview(null)}><XIcon size={14} /></Button></div> : <h2 className="font-semibold">Storage usage</h2>}
      {selected && <div key={selected.id} className="space-y-3">
        <p className="text-xs text-muted-foreground">{selected.mime} · {formatBytes(selected.size)}{selected.source && ` · ${FILE_SOURCE_LABELS[selected.source] ?? enumLabel(selected.source)}`}</p>
        <label className="block space-y-1 text-xs text-muted-foreground">Name<Input defaultValue={selected.originalName} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value && value !== selected.originalName) void updateFile(selected, { originalName: value }); }} /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Tags<Input defaultValue={selected.tags.join(", ")} placeholder="policy, event" onBlur={(event) => { const tags = event.currentTarget.value.split(",").map((tag) => tag.trim()).filter(Boolean); if (JSON.stringify(tags) !== JSON.stringify(selected.tags)) void updateFile(selected, { tags }); }} /></label>
        {selected.mime.startsWith("image/") && <img src={`/api/files/${selected.id}/content`} alt={selected.originalName} className="max-h-64 w-full rounded object-contain" />}
        {selected.mime === "application/pdf" && (libraryDocuments[selected.id]
          ? <div className="rounded border border-border bg-secondary/40 p-4 text-sm"><p>Used by: CBL library</p><Button size="sm" className="mt-3" onClick={() => router.push(`/cbl/${libraryDocuments[selected.id]!.id}`)}>Open in document viewer</Button></div>
          : <iframe src={`/api/files/${selected.id}/content`} title={`Preview ${selected.originalName}`} className="h-64 w-full rounded border border-border bg-white" />)}
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => window.open(`/api/files/${selected.id}/content`, "_blank", "noopener,noreferrer")}><DownloadIcon size={14} />Open</Button><Button size="sm" variant="ghost" onClick={() => void remove(selected)}><TrashIcon size={14} />Delete</Button></div>
        <div className="space-y-1 text-xs"><p className="text-muted-foreground">Used by</p>{selected.links?.length ? <div className="flex flex-wrap gap-1">{selected.links.map((link) => link.href ? <a key={`${link.entityType}-${link.entityId}-${link.role}`} href={link.href} className="rounded-full border border-border px-2 py-1 text-primary hover:bg-secondary">{link.label}</a> : <span key={`${link.entityType}-${link.entityId}-${link.role}`} className="rounded-full border border-border px-2 py-1">{link.label}</span>)}</div> : <p className="text-muted-foreground">—</p>}</div>
      </div>}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Storage</span><span>{formatBytes(totalBytes)}</span></div>
        <div role="img" aria-label={`Storage usage by file kind, ${formatBytes(totalBytes)} total`} className="flex h-2 overflow-hidden rounded-full bg-secondary">{Object.entries(usage).filter(([, value]) => value.bytes > 0).map(([name, value], index) => <span key={name} title={`${fileKindLabel(name)} · ${formatBytes(value.bytes)}`} className={usageColors[index % usageColors.length]} style={{ width: `${totalBytes ? (value.bytes / totalBytes) * 100 : 0}%` }} />)}</div>
        <div className="space-y-1">{Object.entries(usage).map(([name, value]) => <div key={name} className="flex justify-between gap-2 text-xs"><span>{fileKindLabel(name)}</span><span>{value.count} · {formatBytes(value.bytes)}</span></div>)}</div>
      </div>
    </aside></div>
  </div>;
}
