import type { ReactNode } from "react";
import { Label } from "@/components/patterns/label";
import { Textarea } from "@/components/ui/textarea";

export function Timeline({ events }: { events: { id: string; text: string; date: string }[] }) {
  return <ol className="space-y-4">{events.map((event) => <li key={event.id} className="border-l border-border pl-4"><p>{event.text}</p><time className="mono text-xs text-muted-foreground">{event.date}</time></li>)}</ol>;
}

export function MetaSidebar({ children }: { children?: ReactNode }) {
  return <aside className="space-y-4 border-l border-border p-4">{children ?? <Label>Metadata appears here</Label>}</aside>;
}

export function DetailView({ title, status, children, sidebar, commentBox }: { title: string; status: string; children?: ReactNode; sidebar?: ReactNode; commentBox?: ReactNode }) {
  return (
    <div className="grid min-h-96 grid-cols-[minmax(0,1fr)_260px] rounded-md border border-border bg-card">
      <main className="p-5">
        <div className="mb-5 flex items-center gap-3"><h2 className="text-xl font-semibold">{title}</h2><Label>{status}</Label></div>
        {children ?? <Timeline events={[{ id: "1", text: "Activity updates will appear here.", date: "Today" }]} />}
        <div className="mt-8 border-t border-border pt-4">{commentBox ?? <Textarea placeholder="Add a comment…" />}</div>
      </main>
      <MetaSidebar>{sidebar}</MetaSidebar>
    </div>
  );
}
