"use client";

import { useCallback, useEffect, useState } from "react";
import { FileIcon, UploadIcon, XIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const kinds = ["manual", "cbl", "template", "generated", "receipt", "creative", "event_photo", "import", "other"];
type UploadEntry = {
  id: string;
  file: File;
  kind: string;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

function guessedKind(file: File): string {
  if (file.type.startsWith("image/")) return "event_photo";
  if (file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv")) return "import";
  return "other";
}

export function GlobalUploadTray() {
  const [dragging, setDragging] = useState(false);
  const [entries, setEntries] = useState<UploadEntry[]>([]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const added = Array.from(files).map((file, index) => ({
      id: `${Date.now()}-${index}-${crypto.randomUUID()}`,
      file,
      kind: guessedKind(file),
      status: "queued" as const,
      progress: 0,
    }));
    if (added.length) setEntries((current) => [...current, ...added]);
  }, []);

  useEffect(() => {
    let dragDepth = 0;
    function hasFiles(event: DragEvent) {
      return Array.from(event.dataTransfer?.types ?? []).includes("Files");
    }
    function onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setDragging(true);
    }
    function onDragOver(event: DragEvent) {
      if (hasFiles(event)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }
    }
    function onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragging(false);
    }
    function onDrop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth = 0;
      setDragging(false);
      if (event.dataTransfer?.files.length) addFiles(event.dataTransfer.files);
    }
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  function upload(entry: UploadEntry) {
    setEntries((current) => current.map((item) => item.id === entry.id
      ? { ...item, status: "uploading", progress: 0, error: undefined }
      : item));
    const form = new FormData();
    form.append("file", entry.file);
    form.append("kind", entry.kind);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files");
    request.setRequestHeader("X-MSC-Client", "1");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setEntries((current) => current.map((item) => item.id === entry.id
          ? { ...item, progress: Math.round((event.loaded / event.total) * 100) }
          : item));
      }
    };
    request.onload = () => {
      const failed = request.status < 200 || request.status >= 300;
      let message = "Upload failed.";
      if (failed) {
        try {
          message = JSON.parse(request.responseText).error ?? message;
        } catch {
          message = request.statusText || message;
        }
      }
      setEntries((current) => current.map((item) => item.id === entry.id
        ? { ...item, status: failed ? "error" : "done", progress: failed ? item.progress : 100, error: failed ? message : undefined }
        : item));
      if (!failed) window.dispatchEvent(new Event("msc-file-uploaded"));
    };
    request.onerror = () => setEntries((current) => current.map((item) => item.id === entry.id
      ? { ...item, status: "error", error: "Network error." }
      : item));
    request.send(form);
  }

  return (
    <>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary bg-card p-12 text-center shadow-xl">
            <UploadIcon size={28} className="mx-auto mb-3 text-primary" />
            <p className="font-semibold">Drop files to upload</p>
            <p className="mt-1 text-sm text-muted-foreground">Files are checked and stored locally.</p>
          </div>
        </div>
      )}
      {entries.length > 0 && (
        <aside aria-label="Upload tray" className="fixed bottom-4 right-4 z-[60] w-[min(420px,calc(100vw-2rem))] rounded-lg border border-border bg-card shadow-xl">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><UploadIcon size={14} />Upload tray</h2>
            <Button size="sm" variant="ghost" aria-label="Dismiss completed uploads" onClick={() => setEntries((current) => current.filter((entry) => entry.status !== "done"))}><XIcon size={14} /></Button>
          </header>
          <div className="max-h-80 space-y-2 overflow-y-auto p-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border p-3">
                <div className="flex items-start gap-2">
                  <FileIcon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.file.name}</p>
                    <p className="text-xs text-muted-foreground">{Math.ceil(entry.file.size / 1024)} KB · {entry.status === "done" ? "Uploaded" : entry.status === "uploading" ? `${entry.progress}%` : entry.status === "error" ? "Rejected" : "Ready"}</p>
                    {entry.status === "uploading" && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-[width]" style={{ width: `${entry.progress}%` }} /></div>}
                  </div>
                  {entry.status === "done" && <Button size="sm" variant="ghost" aria-label={`Remove ${entry.file.name}`} onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))}><XIcon size={14} /></Button>}
                </div>
                {entry.error && <p role="alert" className="mt-2 break-words text-xs text-destructive">{entry.error}</p>}
                {entry.status !== "uploading" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Select value={entry.kind} onValueChange={(kind) => setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, kind, status: item.status === "error" ? "queued" : item.status } : item))}>
                      <SelectTrigger aria-label={`Kind for ${entry.file.name}`} className="min-w-0 flex-1"><span>{entry.kind.replace("_", " ")}</span></SelectTrigger>
                      <SelectContent>{kinds.map((kind) => <SelectItem key={kind} value={kind}>{kind.replace("_", " ")}</SelectItem>)}</SelectContent>
                    </Select>
                    {entry.status === "queued" || entry.status === "error"
                      ? <Button size="sm" onClick={() => upload(entry)}>{entry.status === "error" ? "Retry" : "Upload"}</Button>
                      : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}
    </>
  );
}
