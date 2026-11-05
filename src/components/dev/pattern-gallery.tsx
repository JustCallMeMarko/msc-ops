"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/patterns/empty-state";
import { Skeleton, ListSkeleton } from "@/components/patterns/skeletons";
import { FilterBar } from "@/components/patterns/filter-bar";
import { ListView } from "@/components/patterns/list-view";
import { DetailView } from "@/components/patterns/detail-view";
import { BoardView, CalendarView, EditableCell, SplitView, TableView } from "@/components/patterns/views";
import { Label } from "@/components/patterns/label";
import { Counter } from "@/components/patterns/counter";
import { RelativeDate } from "@/components/patterns/relative-date";
import { toastUndo } from "@/components/patterns/toast-undo";

const sampleRows = [
  { id: "issue-1", title: "Finalize Tech Summit speaker schedule", labels: ["Events", "Priority"], due: "2026-11-14", comments: 3 },
  { id: "issue-2", title: "Review poster and caption", labels: ["Creatives"], due: "2026-11-20", comments: 1, closed: true },
];

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function PatternGalleryPage() {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  return (
    <main className="min-h-screen space-y-8 bg-background p-8 text-foreground">
      <header className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">UI pattern gallery</h1><p className="text-sm text-muted-foreground">Reusable MSC Ops components · sample data</p></div><Button variant="outline" disabled={!mounted} onClick={() => setTheme(isDark ? "light" : "dark")}>{mounted ? (isDark ? "Light theme" : "Dark theme") : "Theme"}</Button></header>
      <section className="space-y-3"><h2 className="font-semibold">Filter bar · list view</h2><FilterBar /><ListView rows={sampleRows} /></section>
      <section className="space-y-3"><h2 className="font-semibold">Detail view</h2><DetailView title="Finalize Tech Summit schedule" status="Open" /></section>
      <section className="space-y-3"><h2 className="font-semibold">Board · table · calendar</h2><BoardView columns={[{ id: "todo", title: "Todo", items: [{ id: "a", content: "Draft agenda" }] }, { id: "doing", title: "Doing", items: [{ id: "b", content: "Review venue" }] }, { id: "done", title: "Done", items: [] }]} /><TableView><thead><tr><th className="p-3">Task</th><th className="p-3">Status</th></tr></thead><tbody><tr><EditableCell value="Draft agenda" /><EditableCell value="Open" /></tr></tbody></TableView><CalendarView month={new Date(2026, 10, 1)} /></section>
      <section className="space-y-3"><h2 className="font-semibold">Split view</h2><SplitView main={<div className="rounded-md border border-border p-4">Document and task content</div>} panel={<p>AI chat panel</p>} /></section>
      <section className="grid gap-4 md:grid-cols-2"><div className="space-y-3"><h2 className="font-semibold">Empty state</h2><EmptyState title="No events yet" teachingText="Create an event to start planning." action={<Button>Create event</Button>} /></div><div className="space-y-3"><h2 className="font-semibold">Skeletons</h2><Skeleton className="h-12 w-full" /><ListSkeleton rows={3} /></div></section>
      <section className="space-y-3"><h2 className="font-semibold">Metadata primitives and undo toast</h2><div className="flex flex-wrap items-center gap-3"><Label>Creative</Label><Label tone="success">Done</Label><Label tone="attention">Due soon</Label><Counter value={12} /><RelativeDate date="2026-11-20" /><Input placeholder="Input" /><Button variant="outline" onClick={() => toastUndo("Sample item removed", () => undefined)}>Test undo toast</Button></div></section>
    </main>
  );
}
