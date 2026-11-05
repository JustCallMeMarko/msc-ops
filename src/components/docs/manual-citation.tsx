"use client";

import { useState } from "react";
import Link from "next/link";

type DocumentOption = { id: string; title: string; kind: string; active: boolean };
type SearchHit = { documentId: string; page: number; chunkId: string };

export function ManualCitation({ label, page, query }: { label: string; page?: number; query?: string }) {
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/documents");
      const payload = await response.json();
      const manual = (payload.documents as DocumentOption[]).find((document) => document.kind === "rso_manual" && document.active);
      if (!manual) {
        setMissing(true);
        return;
      }
      let targetPage = page ?? 1;
      let chunkId = "";
      if (!page && query) {
        const searchResponse = await fetch(`/api/documents/search?q=${encodeURIComponent(query)}&docId=${manual.id}`);
        if (searchResponse.ok) {
          const results = (await searchResponse.json()).results as SearchHit[];
          targetPage = results[0]?.page ?? 1;
          chunkId = results[0]?.chunkId ?? "";
        }
      }
      const url = new URL(`/cbl/${manual.id}`, window.location.origin);
      url.searchParams.set("page", String(targetPage));
      if (chunkId) url.searchParams.set("hl", chunkId);
      window.location.href = url.toString();
    } catch {
      setMissing(true);
    } finally {
      setBusy(false);
    }
  };

  return <span className="inline-flex flex-wrap items-center gap-1">
    <button type="button" disabled={busy} onClick={() => void open()} className="inline-flex rounded-full border border-border bg-secondary px-2 py-1 text-xs hover:bg-secondary/70 disabled:opacity-60">{label}</button>
    {missing && <Link href="/cbl" className="text-xs text-primary underline">Add the RSO Manual in CBL</Link>}
  </span>;
}
