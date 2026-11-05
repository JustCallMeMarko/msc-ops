"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDownIcon } from "@primer/octicons-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TemplateGeneration } from "@/components/templates/template-generation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Kind = "activity_proposal" | "par" | "guest_list" | "booth_declaration" | "letter_of_explanation" | "liquidation" | "financial_statement" | "budget_proposal";
type Template = { id: string; name: string; kind: Kind; source?: string; version?: number; active: boolean; mappingConfirmedAt: string | null; structure: { targets: Array<{ id: string; label: string; kind: string }> }; mapping: Record<string, { field?: string; skipped?: boolean }> };
type PacketKind = "pre_event" | "post_event" | "scoa_audit";

const labels: Record<Kind, string> = {
  activity_proposal: "Activity Proposal",
  par: "PAR",
  guest_list: "Guest List",
  booth_declaration: "Booth Declaration",
  letter_of_explanation: "Letter of Explanation",
  liquidation: "Liquidation Report",
  financial_statement: "Financial Statement",
  budget_proposal: "Budget Proposal",
};

export function TemplateQuickGenerate({ surface, event }: {
  surface: "events" | "finance";
  event?: { id: string; name: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingPacket, setPendingPacket] = useState<PacketKind | null>(null);
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void fetch("/api/templates").then((response) => response.json()).then((payload) => {
      if (current) setTemplates(payload.templates ?? []);
    }).catch(() => { if (current) setTemplates([]); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    const requestedTemplate = params.get("generate");
    const template = templates.find((row) => row.id === requestedTemplate && row.active && Boolean(row.mappingConfirmedAt));
    if (template) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Open the template requested by the chat action URL.
      setSelectedId(template.id);
      setPendingPacket(null);
      setSheetOpen(true);
    }
  }, [params, templates]);

  const kinds: Kind[] = surface === "events"
    ? ["activity_proposal", "par", "guest_list", "booth_declaration", "letter_of_explanation"]
    : ["liquidation", "financial_statement", "budget_proposal"];
  const activeByKind = useMemo(() => {
    const result = new Map<Kind, Template>();
    for (const template of templates) {
      if (template.active && template.mappingConfirmedAt && !result.has(template.kind)) result.set(template.kind, template);
    }
    return result;
  }, [templates]);

  async function makePacket() {
    if (!pendingPacket || !event && pendingPacket !== "scoa_audit") return;
    if (pendingPacket === "scoa_audit" && (!termStart || !termEnd || termEnd < termStart)) return;
    setBusy(true);
    setError("");
    const body = pendingPacket === "scoa_audit"
      ? { kind: pendingPacket, entityType: "term", entityId: crypto.randomUUID(), termStart, termEnd }
      : { kind: pendingPacket, entityType: "event", entityId: event!.id, title: event!.name };
    const response = await apiFetch("/api/packets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok || !result.file?.id) { setError(result.error ?? "Could not create the packet."); return; }
    toast.success("Packet saved to Files.");
    setPendingPacket(null);
    router.push(`/files?panel=file&id=${result.file.id}`);
  }

  return <div className="space-y-3">
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline"><span>Generate</span><ChevronDownIcon size={14} /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {kinds.map((kind) => {
          const template = activeByKind.get(kind);
          return <DropdownMenuItem
            key={kind}
            disabled={!template}
            title={!template ? "Upload or map this template first" : undefined}
            onSelect={() => { if (template) { setSelectedId(template.id); setPendingPacket(null); setError(""); setSheetOpen(true); } }}
          >{labels[kind]}{!template ? " · Upload or map first" : ""}</DropdownMenuItem>;
        })}
        {surface === "events" ? <>
          <DropdownMenuItem onSelect={() => { setPendingPacket("pre_event"); setSelectedId(null); setSheetOpen(true); }}>Pre-event packet</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setPendingPacket("post_event"); setSelectedId(null); setSheetOpen(true); }}>Post-event packet</DropdownMenuItem>
        </> : <DropdownMenuItem onSelect={() => { setPendingPacket("scoa_audit"); setSelectedId(null); setSheetOpen(true); }}>SCOA audit packet</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{selectedId ? templates.find((row) => row.id === selectedId)?.name ?? "Generate document" : pendingPacket ? `Create ${pendingPacket.replaceAll("_", " ")} packet` : "Generate"}</SheetTitle>
          <SheetDescription>{selectedId ? (() => { const template = templates.find((row) => row.id === selectedId); return template ? `v${template.version ?? 1} · ${template.source ?? "org"}` : "Review the filled preview before saving."; })() : event ? `For ${event.name}.` : "Choose the term range to include."}</SheetDescription>
        </SheetHeader>
        {selectedId && (() => {
          const template = templates.find((row) => row.id === selectedId);
          return template ? <TemplateGeneration templateId={template.id} active={template.active && Boolean(template.mappingConfirmedAt)} mapping={template.mapping} targets={template.structure.targets} initialEventId={event?.id} /> : null;
        })()}
        {pendingPacket && <Card className="space-y-3 p-4">
          <div><h2 className="font-medium">Create {pendingPacket.replaceAll("_", " ")} packet?</h2><p className="text-sm text-muted-foreground">{event ? `For ${event.name}.` : "Choose the term range to include."} The packet will be saved to Files.</p></div>
          {pendingPacket === "scoa_audit" && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Term start<Input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} /></label><label className="text-sm">Term end<Input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} /></label></div>}
          <div className="flex gap-2"><Button disabled={busy || pendingPacket === "scoa_audit" && (!termStart || !termEnd || termEnd < termStart)} onClick={() => void makePacket()}>{busy ? "Creating…" : "Confirm"}</Button><Button variant="outline" disabled={busy} onClick={() => { setPendingPacket(null); setSheetOpen(false); }}>Cancel</Button></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </Card>}
      </SheetContent>
    </Sheet>
  </div>;
}
