"use client";

import { useRef, type ReactNode } from "react";
import { UploadIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";

export function UploadDropzone({ accept, onFiles, children, className = "" }: {
  accept: string;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  function receive(files: FileList | File[]) {
    const selected = Array.from(files);
    if (selected.length) onFiles(selected);
  }
  return <div className={`flex min-h-24 flex-col items-start justify-center gap-2 rounded border border-dashed border-border p-3 hover:bg-secondary/40 ${className}`}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); receive(event.dataTransfer.files); }}>
    <span className="text-xs text-muted-foreground">{children}</span>
    <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}><UploadIcon size={14} />Choose file</Button>
    <input ref={input} className="sr-only" type="file" accept={accept} onChange={(event) => { receive(event.currentTarget.files ?? []); event.currentTarget.value = ""; }} />
  </div>;
}
