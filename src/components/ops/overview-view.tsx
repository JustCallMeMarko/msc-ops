"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/patterns/empty-state";

type Overview = {
  committees: Array<{
    committee: { id: string; name: string; slug: string };
    counts: { open: number; overdue: number; doneThisMonth: number; onTimeRate: number | null };
    heatmap: Array<{ date: string; count: number }>;
  }>;
  slowestToReply: Array<{ committee: { name: string; slug: string }; averageReplyDays: number }>;
};

const heatmapColors = [
  "border-transparent bg-[#ebedf0] dark:border-[#30363d] dark:bg-[#21262d]",
  "border-transparent bg-[#9be9a8] dark:border-transparent dark:bg-[#0e4429]",
  "border-transparent bg-[#40c463] dark:border-transparent dark:bg-[#006d32]",
  "border-transparent bg-[#30a14e] dark:border-transparent dark:bg-[#26a641]",
  "border-transparent bg-[#216e39] dark:border-transparent dark:bg-[#39d353]",
];

function replyTime(days: number): string {
  const hours = days * 24;
  if (hours < 1) return "<1h";
  if (days < 1) return `${Math.round(hours)}h`;
  return `${days.toFixed(1)} days`;
}

export function OverviewView() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => { void fetch("/api/overview").then((response) => response.json()).then(setData).catch(() => setData({ committees: [], slowestToReply: [] })); }, []);
  if (!data) return <div className="space-y-3" aria-label="Loading overview">{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-md bg-secondary" />)}</div>;
  if (!data.committees.length) return <EmptyState title="No committee activity yet" teachingText="Create committees and log check-in replies to see progress trends here." />;
  return <div className="space-y-6">
    <section className="overflow-x-auto rounded-md border border-border bg-card"><table className="w-full min-w-[640px] text-left text-sm">
      <thead className="border-b border-border text-xs uppercase text-muted-foreground"><tr>{["Committee", "Open", "Overdue", "Done this month", "On-time rate"].map((item) => <th key={item} className="p-3">{item}</th>)}</tr></thead>
      <tbody>{data.committees.map(({ committee, counts }) => <tr key={committee.id} className="border-b border-border last:border-0"><th className="p-3 font-medium">{committee.name}</th><td className="mono p-3">{counts.open}</td><td className="mono p-3 text-attention">{counts.overdue}</td><td className="mono p-3">{counts.doneThisMonth}</td><td className="mono p-3">{counts.onTimeRate === null ? <span title="No completed tasks with deadlines yet">—</span> : `${counts.onTimeRate}%`}</td></tr>)}</tbody>
    </table></section>
    <section className="rounded-md border border-border bg-card p-4"><h2 className="font-semibold">Slowest to reply</h2><p className="mb-3 text-sm text-muted-foreground">Average time from copying a nudge to logging a reply.</p>
      {data.slowestToReply.length ? <ol className="space-y-2">{data.slowestToReply.map(({ committee, averageReplyDays }) => <li key={committee.slug} className="flex justify-between border-t border-border pt-2"><span>{committee.name}</span><span className="mono">{replyTime(averageReplyDays)}</span></li>)}</ol> : <p className="text-sm text-muted-foreground">No nudge/reply pairs yet.</p>}
    </section>
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Check-in replies · last 12 weeks</h2><p className="text-sm text-muted-foreground">Each square is one day; brighter days have more logged replies.</p></div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Less</span>{heatmapColors.map((color) => <span key={color} aria-hidden="true" className={`size-[11px] rounded-[2px] border ${color}`} />)}<span>More</span></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">{data.committees.map(({ committee, heatmap }) => <div key={committee.id} className="rounded-md border border-border bg-card p-4"><h3 className="mb-3 text-sm font-medium">{committee.name}</h3><div className="grid auto-cols-[11px] grid-flow-col grid-rows-7 gap-[3px] overflow-x-auto">{heatmap.map((day) => <span key={day.date} title={`${day.date}: ${day.count} ${day.count === 1 ? "reply" : "replies"}`} aria-label={`${day.date}: ${day.count} ${day.count === 1 ? "reply" : "replies"}`} className={`size-[11px] rounded-[2px] border ${heatmapColors[Math.min(day.count, 4)]}`} />)}</div></div>)}</div>
    </section>
  </div>;
}
