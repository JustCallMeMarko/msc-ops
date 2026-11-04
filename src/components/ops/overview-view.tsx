"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/patterns/empty-state";

type Overview = {
  committees: Array<{
    committee: { id: string; name: string; slug: string };
    counts: { open: number; overdue: number; doneThisMonth: number; onTimeRate: number };
    heatmap: Array<{ date: string; count: number }>;
  }>;
  slowestToReply: Array<{ committee: { name: string; slug: string }; averageReplyDays: number }>;
};

export function OverviewView() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => { void fetch("/api/overview").then((response) => response.json()).then(setData).catch(() => setData({ committees: [], slowestToReply: [] })); }, []);
  if (!data) return <div className="space-y-3" aria-label="Loading overview">{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-md bg-secondary" />)}</div>;
  if (!data.committees.length) return <EmptyState title="No committee activity yet" teachingText="Create committees and log check-in replies to see progress trends here." />;
  return <div className="space-y-6">
    <section className="overflow-x-auto rounded-md border border-border bg-card"><table className="w-full min-w-[640px] text-left text-sm">
      <thead className="border-b border-border text-xs uppercase text-muted-foreground"><tr>{["Committee", "Open", "Overdue", "Done this month", "On-time rate"].map((item) => <th key={item} className="p-3">{item}</th>)}</tr></thead>
      <tbody>{data.committees.map(({ committee, counts }) => <tr key={committee.id} className="border-b border-border last:border-0"><th className="p-3 font-medium">{committee.name}</th><td className="mono p-3">{counts.open}</td><td className="mono p-3 text-attention">{counts.overdue}</td><td className="mono p-3">{counts.doneThisMonth}</td><td className="mono p-3">{counts.onTimeRate}%</td></tr>)}</tbody>
    </table></section>
    <section className="rounded-md border border-border bg-card p-4"><h2 className="font-semibold">Slowest to reply</h2><p className="mb-3 text-sm text-muted-foreground">Average calendar days from copying a nudge to logging a reply.</p>
      {data.slowestToReply.length ? <ol className="space-y-2">{data.slowestToReply.map(({ committee, averageReplyDays }) => <li key={committee.slug} className="flex justify-between border-t border-border pt-2"><span>{committee.name}</span><span className="mono">{averageReplyDays.toFixed(1)} days</span></li>)}</ol> : <p className="text-sm text-muted-foreground">No nudge/reply pairs yet.</p>}
    </section>
    <section className="space-y-4"><div><h2 className="font-semibold">Check-in replies · last 12 weeks</h2><p className="text-sm text-muted-foreground">Each square is one day; brighter days have more logged replies.</p></div>
      <div className="grid gap-3 md:grid-cols-2">{data.committees.map(({ committee, heatmap }) => <div key={committee.id} className="rounded-md border border-border bg-card p-4"><h3 className="mb-3 text-sm font-medium">{committee.name}</h3><div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto">{heatmap.map((day) => <span key={day.date} title={`${day.date}: ${day.count} ${day.count === 1 ? "reply" : "replies"}`} className={`size-2 rounded-sm ${day.count === 0 ? "bg-secondary" : day.count === 1 ? "bg-primary/40" : day.count < 4 ? "bg-primary/70" : "bg-primary"}`} />)}</div></div>)}</div>
    </section>
  </div>;
}
