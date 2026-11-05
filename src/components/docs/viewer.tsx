"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import "react-pdf/dist/Page/TextLayer.css";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, ListUnorderedIcon, SearchIcon, ZoomInIcon, ZoomOutIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/api-client";
import { renderCitedMarkdown } from "@/components/docs/citation-markdown";
import { escapeDocumentText, renderDocumentHighlight } from "@/lib/docs/highlight";
import { isReadableHeading, sectionSuggestionLabel, suggestionHeading } from "@/lib/docs/headings";

type Segment = { page: number; startItem: number; startOffset: number; endItem: number; endOffset: number };
type PdfModule = typeof import("react-pdf");
type Chunk = { id: string; ord: number; headingPath: string; text: string; segments: Segment[] };
type PageRow = { page: number; width: number; height: number; charCount: number; ocr: boolean; items: Array<{ str: string; transform: number[]; width: number; height: number; hasEOL: boolean }> };
export type DocData = {
  document: { id: string; fileId: string; title: string; kind: string; version: number; pageCount: number; status: string; progress: number; error: string | null; ocr: boolean; active: boolean };
  pages: PageRow[];
  chunks: Chunk[];
};
type Source = { n: number; chunkId: string; documentId: string; page: number; title?: string; version?: number; headingPath?: string; text?: string; auto?: boolean };
type BestMatch = Omit<Source, "n">;
type Message = { role: "user" | "assistant"; content: string; sources?: Source[]; bestMatch?: BestMatch | null; partial?: boolean };

export function DocumentViewer({ initialData }: { initialData: DocData }) {
  const params = useParams<{ docId: string }>();
  const router = useRouter();
  const docId = params.docId;
  const [data, setData] = useState<DocData | null>(initialData);
  const [page, setPage] = useState(1);
  const [highlightId, setHighlightId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [scopeAll, setScopeAll] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ documentId: string; title: string; page: number; headingPath: string; chunkId: string; text: string }>>([]);
  const [zoom, setZoom] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const [chatWidth, setChatWidth] = useState(420);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [pdfComponents, setPdfComponents] = useState<Pick<PdfModule, "Document" | "Page"> | null>(null);
  const pdfContainer = useRef<HTMLDivElement>(null);
  const newlyCreatedThreads = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;
    void import("react-pdf").then((module) => {
      module.pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/react-pdf/pdf.worker.min.mjs";
      if (mounted) setPdfComponents({ Document: module.Document, Page: module.Page });
    });

    return () => {
      mounted = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/documents/${docId}`, { cache: "no-store" });
    if (response.ok) setData(await response.json());
  }, [docId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize state from the viewer deep link.
    setPage(Math.max(1, Number(params.get("page")) || 1));
    setHighlightId(params.get("hl") ?? "");
    const savedThread = params.get("thread") ?? "";
    setThreadId(savedThread);
    setInput(params.get("ask") ?? "");
  }, [refresh]);

  useEffect(() => {
    if (!threadId) return;
    if (newlyCreatedThreads.current.delete(threadId)) return;
    void fetch(`/api/documents/chat?threadId=${encodeURIComponent(threadId)}`).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      setMessages(payload.messages.map((message: { role: string; content: string; citations?: Source[]; bestMatch?: BestMatch | null; partial?: boolean }) => ({
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
        sources: message.citations?.map((citation) => ({ ...citation })),
        bestMatch: message.bestMatch,
        partial: message.partial,
      })));
    });
  }, [threadId]);

  useEffect(() => {
    if (!data || !["queued", "extracting", "chunking", "embedding"].includes(data.document.status)) return;
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [data, refresh]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(page));
    if (highlightId) url.searchParams.set("hl", highlightId);
    else url.searchParams.delete("hl");
    if (threadId) url.searchParams.set("thread", threadId);
    url.searchParams.delete("ask");
    window.history.replaceState(null, "", url);
  }, [page, highlightId, threadId]);

  useEffect(() => {
    const container = pdfContainer.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPageWidth(Math.max(1, Math.floor(entry.contentRect.width)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
      if (event.key === "j") setPage((current) => Math.min(data?.document.pageCount ?? current, current + 1));
      if (event.key === "k") setPage((current) => Math.max(1, current - 1));
      if (event.key === "/") { event.preventDefault(); window.document.getElementById("document-search")?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data?.document.pageCount]);

  const highlighted = useMemo(() => data?.chunks.find((chunk) => chunk.id === highlightId), [data, highlightId]);
  const pagesToRender = useMemo(() => {
    const pageNumbers = highlighted?.segments.map((segment) => segment.page);
    return [...new Set([page, ...(pageNumbers ?? [])])].sort((a, b) => a - b);
  }, [highlighted, page]);
  useEffect(() => {
    if (!highlighted) window.document.getElementById(`pdf-page-${page}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [page, highlightId, highlighted]);
  const { headings, suggestions } = useMemo(() => {
    const unique = new Map<string, Chunk>();
    for (const chunk of data?.chunks ?? []) {
      const label = chunk.headingPath.trim();
      const firstPage = chunk.segments[0]?.page;
      if (!label || !firstPage || data?.pages.find((item) => item.page === firstPage)?.ocr || unique.has(label)) continue;
      const leaf = sectionSuggestionLabel(label);
      if (isReadableHeading(leaf) || suggestionHeading(label)) unique.set(label, chunk);
    }
    const candidates = [...unique.values()].sort((left, right) => left.ord - right.ord);
    return {
      headings: candidates.filter((chunk) => isReadableHeading(sectionSuggestionLabel(chunk.headingPath))),
      suggestions: candidates.filter((chunk) => suggestionHeading(chunk.headingPath)).slice(0, 4),
    };
  }, [data]);

  const updateLocation = (documentId: string, targetPage: number, chunkId: string, sourceThread = threadId) => {
    const url = new URL(`/cbl/${documentId}`, window.location.origin);
    url.searchParams.set("page", String(targetPage));
    if (chunkId) url.searchParams.set("hl", chunkId);
    if (sourceThread) url.searchParams.set("thread", sourceThread);
    router.push(`${url.pathname}${url.search}`);
  };

  const textRenderer = ({ str, itemIndex, pageNumber }: { str: string; itemIndex: number; pageNumber: number }) => {
    const segments = highlighted?.segments.filter((segment) => segment.page === pageNumber) ?? [];
    const segment = segments.find((item) => itemIndex >= item.startItem && itemIndex <= item.endItem);
    if (!segment) {
      const fallback = highlighted?.segments.length ? "" : highlighted?.text.slice(0, 80);
      const at = fallback ? str.toLocaleLowerCase().indexOf(fallback.toLocaleLowerCase()) : -1;
      return at >= 0 ? renderDocumentHighlight(str, at, at + fallback!.length) : escapeDocumentText(str);
    }
    const start = itemIndex === segment.startItem ? Math.min(str.length, segment.startOffset) : 0;
    const end = itemIndex === segment.endItem ? Math.min(str.length, segment.endOffset) : str.length;
    return renderDocumentHighlight(str, start, end);
  };

  const scrollToHighlight = (pageNumber: number) => {
    if (!highlighted?.segments.some((segment) => segment.page === pageNumber)) return;
    window.requestAnimationFrame(() => {
      window.document.querySelector(`#pdf-page-${pageNumber} mark.cite-hl`)?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    });
  };

  const chooseCitation = (source?: Source) => {
    if (!source) return;
    if (source.documentId !== docId) {
      updateLocation(source.documentId, source.page, source.chunkId);
    } else {
      setPage(source.page);
      setHighlightId(source.chunkId);
    }
  };

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!search.trim()) { setResults([]); return; }
    const response = await fetch(`/api/documents/search?q=${encodeURIComponent(search)}&docId=${docId}`);
    if (response.ok) setResults((await response.json()).results);
  };

  const submit = async (override?: string) => {
    const message = (override ?? input).trim();
    if (!message || busy) return;
    setBusy(true);
    setError("");
    setInput("");
    setMessages((previous) => [...previous, { role: "user", content: message }, { role: "assistant", content: "", sources: [] }]);
    try {
      const searchParams = new URLSearchParams({ q: message });
      if (!scopeAll) searchParams.set("docId", docId);
      const bestResponse = await fetch(`/api/documents/search?${searchParams.toString()}`);
      if (bestResponse.ok) {
        const best = (await bestResponse.json()).results?.[0] as BestMatch | undefined;
        if (best) setMessages((previous) => previous.map((item, index) => index === previous.length - 1 ? { ...item, bestMatch: best } : item));
      }
      const response = await apiFetch("/api/documents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: threadId || undefined, message, docIds: scopeAll ? undefined : [docId] }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Could not start cited chat.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "thread") {
            if (event.threadId !== threadId) newlyCreatedThreads.current.add(event.threadId);
            setThreadId(event.threadId);
            if (event.bestMatch) setMessages((previous) => previous.map((item, index) => index === previous.length - 1 ? { ...item, bestMatch: event.bestMatch } : item));
          } else if (event.type === "text") {
            setMessages((previous) => previous.map((item, index) => index === previous.length - 1 ? { ...item, content: item.content + event.text } : item));
          } else if (event.type === "replace") {
            setMessages((previous) => previous.map((item, index) => index === previous.length - 1 ? { ...item, content: event.text } : item));
          } else if (event.type === "sources") {
            setMessages((previous) => previous.map((item, index) => index === previous.length - 1 ? { ...item, sources: event.sources, partial: event.partial } : item));
          } else if (event.type === "error") {
            setError(event.error);
          }
        }
      }
    } catch {
      setError("The response was interrupted. Retry to continue.");
      setMessages((previous) => previous.map((item, index) => index === previous.length - 1 ? { ...item, partial: true } : item));
    } finally {
      setBusy(false);
    }
  };

  const runOcr = async () => {
    if (!data) return;
    setOcrBusy(true);
    setError("");
    try {
      const pdf = await import("pdfjs-dist");
      pdf.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      const loading = pdf.getDocument(Object.assign({
        url: `/api/files/${data.document.fileId}/content`,
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
      }, { isEvalSupported: false }) as Parameters<typeof pdf.getDocument>[0]);
      const sourcePdf = await loading.promise;
      const needed = data.pages.filter((item) => item.charCount < 40).map((item) => item.page);
      const { createWorker } = await import("tesseract.js");
      const pages = [];
      let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
      try {
        worker = await createWorker("eng+fil", 1, {
          workerPath: "/tesseract/worker.min.js",
          corePath: "/tesseract/core",
          langPath: "/tesseract/lang",
          cacheMethod: "none",
          gzip: true,
        });
        for (const pageNo of needed) {
          const pdfPage = await sourcePdf.getPage(pageNo);
          const viewport = pdfPage.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) continue;
          await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
          const result = await worker.recognize(canvas, {}, { blocks: true });
          const items = (result.data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.flatMap((line) => line.words.map((word, index) => ({
              str: word.text,
              transform: [1, 0, 0, 1, word.bbox.x0 / 1.5, (viewport.height - word.bbox.y1) / 1.5],
              width: (word.bbox.x1 - word.bbox.x0) / 1.5,
              height: (word.bbox.y1 - word.bbox.y0) / 1.5,
              hasEOL: index === line.words.length - 1,
            }))),
          ));
          pages.push({ page: pageNo, width: viewport.width / 1.5, height: viewport.height / 1.5, items });
        }
      } finally {
        if (worker) await worker.terminate();
        await loading.destroy();
      }
      const response = await apiFetch(`/api/documents/${docId}/ocr-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      if (!response.ok) throw new Error("OCR results could not be saved.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OCR could not run offline.");
    } finally {
      setOcrBusy(false);
    }
  };

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading document…</div>;
  const docInfo = data.document;
  const canRead = docInfo.status === "ready" || docInfo.status === "needs_ocr";
  const PdfDocument = pdfComponents?.Document;
  const PdfPage = pdfComponents?.Page;
  const pagesToRead = Math.max(1, docInfo.pageCount);

  return <div className="flex h-[calc(100vh-6.5rem)] min-h-[620px] flex-col overflow-hidden">
    <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
      <Link href="/cbl" className="text-sm text-muted-foreground hover:text-foreground">CBL library</Link><span className="text-muted-foreground">/</span>
      <h1 className="min-w-0 flex-1 truncate font-semibold">{docInfo.title} <span className="text-sm font-normal text-muted-foreground">v{docInfo.version}</span></h1>
      {!docInfo.active && <span className="rounded-full bg-attention/10 px-2 py-1 text-xs text-attention">Older version</span>}
      <form onSubmit={runSearch} className="flex items-center gap-2">
        <SearchIcon size={15} className="text-muted-foreground" />
        <input id="document-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this document" className="h-9 w-48 rounded-md border border-border bg-background px-2 text-sm" />
        <Button type="submit" size="sm" variant="outline">Search</Button>
      </form>
      <Popover open={sectionsOpen} onOpenChange={setSectionsOpen}>
        <PopoverTrigger asChild><Button type="button" size="sm" variant="outline" aria-label="Open sections"><ListUnorderedIcon size={14} />Sections</Button></PopoverTrigger>
        <PopoverContent align="end" className="max-h-[70vh] w-80 overflow-y-auto p-2">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sections</p>
          {headings.length ? headings.map((chunk) => {
            const sectionPage = chunk.segments[0]?.page ?? 1;
            return <button key={chunk.id} type="button" onClick={() => { setPage(sectionPage); setHighlightId(chunk.id); setSectionsOpen(false); }}
              className="flex w-full items-start gap-3 rounded px-2 py-2 text-left text-sm hover:bg-secondary">
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">p.{sectionPage}</span>
              <span className="min-w-0 whitespace-normal break-words">{chunk.headingPath}</span>
            </button>;
          }) : <p className="px-2 py-3 text-sm text-muted-foreground">No readable sections found.</p>}
        </PopoverContent>
      </Popover>
      <div className="flex items-center gap-1">
        <Button aria-label="Zoom out" size="sm" variant="ghost" onClick={() => setZoom((value) => Math.max(0.65, value - 0.1))}><ZoomOutIcon size={15} /></Button>
        <span className="w-12 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button aria-label="Zoom in" size="sm" variant="ghost" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}><ZoomInIcon size={15} /></Button>
        <Button size="sm" variant="outline" onClick={() => setZoom(1)}>Fit width</Button>
      </div>
    </header>

    {docInfo.status !== "ready" && <div className="border-b border-border bg-secondary/40 px-4 py-2 text-sm">
      {docInfo.status === "needs_ocr" ? <div className="flex items-center gap-3"><span>Needs OCR · {data.pages.filter((item) => item.charCount < 40).length} page(s) have little or no text.</span><Button size="sm" disabled={ocrBusy} onClick={() => void runOcr()}>{ocrBusy ? "Running local OCR…" : "Run OCR"}</Button></div> : <span>{docInfo.error ?? `${docInfo.status.replaceAll("_", " ")} · ${docInfo.progress}%`}</span>}
      {docInfo.error && <span className="ml-3 text-destructive">{docInfo.error}</span>}
    </div>}

    {results.length > 0 && <div className="max-h-40 overflow-y-auto border-b border-border bg-card px-4 py-2">
      {results.map((result) => <button key={result.chunkId} type="button" className="block w-full truncate py-1 text-left text-sm hover:text-primary" onClick={() => updateLocation(result.documentId, result.page, result.chunkId)}>
        <span className="text-muted-foreground">p.{result.page} · {result.headingPath || result.title} — </span>{result.text.slice(0, 150)}
      </button>)}
    </div>}

    <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `minmax(0, 1fr) 6px ${chatWidth}px` }}>
      <div ref={pdfContainer} className="min-w-0 overflow-auto bg-muted/30 p-4">
        <div className="mx-auto mb-3 flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ArrowLeftIcon size={14} />Previous</Button>
            <span className="text-sm tabular-nums">Page {page} / {pagesToRead}</span>
            <Button size="sm" variant="outline" disabled={page >= pagesToRead} onClick={() => setPage((value) => Math.min(pagesToRead, value + 1))}>Next<ArrowRightIcon size={14} /></Button>
          </div>
          <span className="text-xs text-muted-foreground">Keyboard: j / k · / to search</span>
        </div>
        <div className="mx-auto flex w-max min-w-full max-w-none flex-col gap-4">
          {canRead && PdfDocument && PdfPage ? <PdfDocument file={`/api/files/${docInfo.fileId}/content`} options={Object.assign({
            isEvalSupported: false,
            cMapUrl: "/pdfjs/react-pdf/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "/pdfjs/react-pdf/standard_fonts/",
            enableXfa: false,
            enableScripting: false,
          })} loading={<div className="grid h-[700px] w-[550px] place-items-center text-sm text-muted-foreground">Rendering PDF page…</div>} onLoadError={() => setError("The PDF could not be rendered.")}>
            {pageWidth > 0 && pagesToRender.map((pageNumber) => <div id={`pdf-page-${pageNumber}`} key={pageNumber} className="flex w-max min-w-full justify-center rounded bg-white shadow">
              <PdfPage pageNumber={pageNumber} width={pageWidth} scale={zoom} customTextRenderer={textRenderer} onRenderTextLayerSuccess={() => scrollToHighlight(pageNumber)} renderAnnotationLayer={false} renderForms={false} />
            </div>)}
          </PdfDocument> : <div className="grid h-[700px] w-[550px] place-items-center text-sm text-muted-foreground">{canRead ? "Loading local PDF renderer…" : "PDF extraction is in progress."}</div>}
        </div>
      </div>

      <div className="group relative cursor-col-resize border-x border-border bg-background hover:bg-primary/20" onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = chatWidth;
        const move = (moveEvent: PointerEvent) => setChatWidth(Math.max(320, Math.min(640, startWidth + startX - moveEvent.clientX)));
        const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
      }} aria-label="Resize chat panel" />

      <aside className="flex min-h-0 flex-col border-l border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-semibold">Ask the document</h2>
          <div role="group" aria-label="Chat scope" className="flex rounded-md border border-border bg-background p-0.5">
            {([
              [false, "This document"],
              [true, "All documents"],
            ] as const).map(([all, label]) => <button key={label} type="button" aria-pressed={scopeAll === all} onClick={() => setScopeAll(all)}
              className={`rounded px-2 py-1.5 text-[11px] font-medium transition-colors ${scopeAll === all ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{label}</button>)}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {!messages.length && <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Ask about requirements, deadlines, or procedures. Answers cite page passages.
              {highlighted && <Button size="sm" variant="outline" className="mt-3" onClick={() => setInput(`Explain this section: ${highlighted.headingPath}`)}>Ask about this section</Button>}
            </div>}
            {messages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-full rounded-lg p-3 text-sm ${message.role === "user" ? "ml-6 bg-secondary" : "mr-2 border border-border bg-card"}`}>
              {message.role === "assistant" && message.bestMatch && <BestMatchCard match={message.bestMatch} onShow={() => chooseCitation({ ...message.bestMatch!, n: 1 })} />}
              {message.role === "assistant" && message.content ? renderCitedMarkdown(message.content, message.sources ?? [], (source) => chooseCitation(source ? { ...source, chunkId: "chunkId" in source && typeof source.chunkId === "string" ? source.chunkId : "" } : undefined)) : message.role === "user" ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
              {message.role === "assistant" && message.sources?.length ? <div className="mt-3 border-t border-border pt-2"><p className="mb-1 text-xs font-semibold text-muted-foreground">Sources</p>{message.sources.map((source) => <button key={`${source.n}-${source.chunkId}`} type="button" className="mr-2 text-xs text-primary underline" onClick={() => chooseCitation(source)}>[{source.n}] {source.title ?? "Document"} · p.{source.page}</button>)}</div> : null}
              {message.partial && <Button size="sm" variant="outline" className="mt-2" onClick={() => void submit(messages[index - 1]?.content)}>Retry</Button>}
            </div>)}
            {error && <p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          </div>
          <div className="border-t border-border p-3">
            {suggestions.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{suggestions.map((chunk) => <button key={chunk.id} type="button" title={chunk.headingPath} onClick={() => setInput(`Explain ${sectionSuggestionLabel(chunk.headingPath)}`)}
              className="rounded-full border border-border bg-background px-2 py-1 text-[11px] leading-4 text-muted-foreground hover:bg-secondary hover:text-foreground">Ask: {sectionSuggestionLabel(chunk.headingPath)}</button>)}</div>}
            <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="flex items-end gap-2">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={3} placeholder="Ask a question…" className="min-h-20 min-w-0 flex-1 resize-y rounded-md border border-border bg-background p-2 text-sm" />
              <Button type="submit" disabled={busy || !input.trim()} aria-label="Send question"><ArrowUpIcon size={15} /></Button>
            </form>
          </div>
        </div>
      </aside>
    </div>
  </div>;
}

function BestMatchCard({ match, onShow }: { match: BestMatch; onShow: () => void }) {
  return <section className="mb-3 rounded-md border border-attention/40 bg-attention/5 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-attention">Best match</p>
        <p className="mt-1 truncate font-medium" title={match.headingPath}>{match.headingPath || match.title}</p>
        <p className="text-xs text-muted-foreground">{match.title} · p.{match.page}</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onShow}>Show in PDF</Button>
    </div>
    <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{match.text}</p>
  </section>;
}
