"use client";
/* eslint-disable @next/next/no-img-element -- File previews render local stored images only. */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DownloadIcon, TrashIcon, UploadIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { EmptyState } from "@/components/patterns/empty-state";
import { toastUndo } from "@/components/patterns/toast-undo";
import { apiFetch } from "@/lib/api-client";

type FileRow = { id: string; originalName: string; mime: string; size: number; kind: string; source: string | null; tags: string[]; version?: number; createdAt: string; links?: Array<{ entityType: string; entityId: string; role: string }> };
const kinds = ["manual","cbl","template","generated","receipt","creative","event_photo","import","other"];

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

export function FilesView() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [usage, setUsage] = useState<Record<string, { count: number; bytes: number }>>({});
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [uploadKind, setUploadKind] = useState("other");
  const [selected, setSelected] = useState<FileRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const params = new URLSearchParams();
    const parsed = parseFileQuery(query);
    if (kind !== "all") params.set("kind", kind);
    else if (parsed.filters.kind) params.set("kind", parsed.filters.kind);
    for (const key of ["source", "event", "tag"]) {
      if (parsed.filters[key]) params.set(key, parsed.filters[key]);
    }
    if (parsed.text) params.set("q", parsed.text);
    const response = await fetch(`/api/files?${params}`);
    if (response.ok) { const body = await response.json(); setFiles(body.files); setUsage(body.usage); }
    setLoading(false);
  }, [kind, query]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch remote file metadata on filter changes.
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onUploaded = () => { void load(); };
    window.addEventListener("msc-file-uploaded", onUploaded);
    return () => window.removeEventListener("msc-file-uploaded", onUploaded);
  }, [load]);
  async function upload(file?: File) {
    if (!file) return;
    const form = new FormData(); form.append("file", file); form.append("kind", uploadKind);
    const response = await apiFetch("/api/files", { method: "POST", body: form });
    if (!response.ok) return toast.error((await response.json()).error ?? "Upload failed.");
    toast.success("File uploaded."); await load();
  }
  async function remove(file: FileRow) {
    const response = await apiFetch(`/api/files/${file.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not delete file.");
    setSelected(null); await load();
    toastUndo(`${file.originalName} deleted.`, () => { void apiFetch(`/api/files/${file.id}/restore`, { method: "POST" }).then(load); });
  }
  async function updateSelected(patch: { originalName?: string; tags?: string[] }) {
    if (!selected) return;
    const response = await apiFetch(`/api/files/${selected.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (!response.ok) return toast.error("Could not save file metadata.");
    const updated = await response.json() as FileRow;
    const withLinks = { ...updated, links: selected.links };
    setSelected(withLinks);
    setFiles((current) => current.map((file) => file.id === withLinks.id ? withLinks : file));
    setEditName(updated.originalName);
    setEditTags(updated.tags.join(", "));
    toast.success("File metadata saved.");
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Files</h1><p className="text-sm text-muted-foreground">Local documents, event photos, and attachments.</p></div><div className="flex gap-2"><Select value={uploadKind} onValueChange={setUploadKind}><SelectTrigger className="w-36"><span>{uploadKind.replace("_", " ")}</span></SelectTrigger><SelectContent>{kinds.map((value) => <SelectItem key={value} value={value}>{value.replace("_", " ")}</SelectItem>)}</SelectContent></Select><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-primary bg-primary px-3 text-sm font-medium text-white"><UploadIcon size={14} />Upload<Input type="file" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} /></label></div></div>
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]"><section className="space-y-3"><div className="flex gap-2"><Input placeholder="Filter: kind: source: event: tag: or search by name…" value={query} onChange={(e) => setQuery(e.target.value)} /><Select value={kind} onValueChange={setKind}><SelectTrigger className="w-40"><span>{kind === "all" ? "All kinds" : kind.replace("_", " ")}</span></SelectTrigger><SelectContent><SelectItem value="all">All kinds</SelectItem>{kinds.map((value) => <SelectItem key={value} value={value}>{value.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
      {loading ? <div className="h-64 animate-pulse rounded bg-secondary" /> : files.length ? <div className="divide-y divide-border rounded border border-border bg-card">{files.map((file) => <button key={file.id} onClick={() => { setSelected(file); setEditName(file.originalName); setEditTags(file.tags.join(", ")); }} className="flex w-full items-center gap-3 p-3 text-left hover:bg-secondary"><span className="min-w-0 flex-1 truncate">{file.originalName}<span className="ml-2 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{file.kind}</span>{file.tags.map((tag) => <span key={tag} className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">#{tag}</span>)}{file.links?.length ? <span className="ml-2 text-xs text-muted-foreground">{file.links.map((link) => link.role.replaceAll("_", " ")).join(", ")}</span> : null}</span><span className="shrink-0 text-right text-xs text-muted-foreground"><span className="block">v{file.version ?? 1} · {Math.ceil(file.size / 1024)} KB</span><span className="block">{new Date(file.createdAt).toLocaleDateString("en-PH")}</span></span></button>)}</div> : <EmptyState title="No files found" teachingText="Upload a PDF, document, or event photo." />}
    </section><aside className="space-y-3 rounded border border-border bg-card p-4"><h2 className="font-semibold">{selected?.originalName ?? "Storage usage"}</h2>{selected && <><p className="text-xs text-muted-foreground">{selected.mime} · {Math.ceil(selected.size / 1024)} KB</p><label className="block space-y-1 text-xs text-muted-foreground">Name<Input value={editName} onChange={(event) => setEditName(event.target.value)} onBlur={() => { if (editName.trim() && editName !== selected.originalName) void updateSelected({ originalName: editName }); }} /></label><label className="block space-y-1 text-xs text-muted-foreground">Tags<Input value={editTags} placeholder="policy, event" onChange={(event) => setEditTags(event.target.value)} onBlur={() => { const tags = editTags.split(",").map((tag) => tag.trim()).filter(Boolean); if (JSON.stringify(tags) !== JSON.stringify(selected.tags)) void updateSelected({ tags }); }} /></label>{selected.mime.startsWith("image/") && <img src={`/api/files/${selected.id}/content`} alt={selected.originalName} className="max-h-64 w-full rounded object-contain" />}<div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => window.open(`/api/files/${selected.id}/content`, "_blank", "noopener,noreferrer")}><DownloadIcon size={14} />Open</Button><Button size="sm" variant="ghost" onClick={() => void remove(selected)}><TrashIcon size={14} />Delete</Button></div><p className="text-xs text-muted-foreground">Used by: {selected.links?.length ? selected.links.map((link) => `${link.entityType} · ${link.role}`).join(", ") : "—"}</p></>}
      <div className="space-y-2">{Object.entries(usage).map(([name, value]) => <div key={name} className="flex justify-between text-xs"><span>{name.replace("_", " ")}</span><span>{value.count} · {(value.bytes / 1024 / 1024).toFixed(1)} MB</span></div>)}</div>
    </aside></div>
  </div>;
}
