"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { DetailView } from "@/components/patterns/detail-view";
import { RelativeDate } from "@/components/patterns/relative-date";
import { apiFetch } from "@/lib/api-client";

type Task = {
  id: string; number: number; title: string; body: string; status: string; priority: string; progress: number;
  labels: string[]; dueAt: string | null; dueRule: string | null; eventId: string | null;
  checkinEveryDays: number | null; nextCheckinAt: string | null; updatedAt: string; committeeId: string | null;
  assigneeMemberId: string | null; committee: { id: string; name: string; slug: string } | null;
  assignee: { id: string; name: string } | null;
  activity: Array<{ id: string; kind: string; body: string; at: string; meta: Record<string, unknown> | null }>;
};

export function TaskDetailView({ number }: { number: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [committees, setCommittees] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [body, setBody] = useState("");
  const [labels, setLabels] = useState("");
  const [comment, setComment] = useState("");

  const fetchData = useCallback(async () => {
    const [taskResponse, committeeResponse, memberResponse] = await Promise.all([
      fetch(`/api/tasks/${number}`), fetch("/api/committees"), fetch("/api/members"),
    ]);
    return {
      task: taskResponse.ok ? await taskResponse.json() as Task : null,
      committees: committeeResponse.ok ? await committeeResponse.json() as Array<{ id: string; name: string; slug: string }> : [],
      members: memberResponse.ok ? await memberResponse.json() as Array<{ id: string; name: string }> : [],
    };
  }, [number]);
  const load = useCallback(async () => {
    const result = await fetchData();
    setTask(result.task);
    if (result.task) { setBody(result.task.body); setLabels(result.task.labels.join(", ")); }
    setCommittees(result.committees);
    setMembers(result.members);
  }, [fetchData]);
  useEffect(() => {
    let active = true;
    void fetchData().then((result) => {
      if (!active) return;
      setTask(result.task);
      if (result.task) { setBody(result.task.body); setLabels(result.task.labels.join(", ")); }
      setCommittees(result.committees);
      setMembers(result.members);
    });
    return () => { active = false; };
  }, [fetchData]);

  async function update(values: Record<string, unknown>) {
    if (!task) return;
    const response = await apiFetch(`/api/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, expectedUpdatedAt: task.updatedAt }),
    });
    if (response.status === 409) { toast.error("Changed elsewhere — reload"); return; }
    if (!response.ok) { toast.error("Could not update task."); return; }
    setTask(await response.json() as Task);
    await load();
  }

  async function saveComment() {
    if (!task || !comment.trim()) return;
    const response = await apiFetch(`/api/tasks/${task.id}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: comment.trim() }),
    });
    if (!response.ok) return toast.error("Could not add comment.");
    setComment(""); await load();
  }

  if (!task) return <div className="animate-pulse space-y-3" aria-label="Loading task"><div className="h-8 w-2/3 rounded bg-secondary" /><div className="h-72 rounded bg-secondary" /></div>;
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground"><Link href="/tasks" className="hover:text-primary">Tasks</Link> / <span className="mono">#{task.number}</span></p>
    <DetailView title={`#${task.number} ${task.title}`} status={task.status.replace("_", " ")}
      sidebar={<div className="space-y-4 text-sm">
        <label className="block space-y-1 text-xs text-muted-foreground">Assignee<Combobox options={members.map((item) => ({ value: item.id, label: item.name }))} value={task.assigneeMemberId ?? ""} onChange={(value) => void update({ assigneeMemberId: value || null })} placeholder="Unassigned" /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Committee<Combobox options={committees.map((item) => ({ value: item.id, label: item.name }))} value={task.committeeId ?? ""} onChange={(value) => void update({ committeeId: value || null })} placeholder="No committee" /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Status<Select value={task.status} onValueChange={(status) => void update({ status })}><SelectTrigger><span>{task.status.replace("_", " ")}</span></SelectTrigger><SelectContent>{["todo", "in_progress", "blocked", "done", "cancelled"].map((status) => <SelectItem key={status} value={status}>{status.replace("_", " ")}</SelectItem>)}</SelectContent></Select></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Priority<Select value={task.priority} onValueChange={(priority) => void update({ priority })}><SelectTrigger><span>{task.priority}</span></SelectTrigger><SelectContent>{["low", "normal", "high", "urgent"].map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}</SelectContent></Select></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Progress (%)<Input type="number" min={0} max={100} value={task.progress} onChange={(event) => setTask({ ...task, progress: Number(event.target.value) })} onBlur={() => void update({ progress: task.progress })} /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Due date<Input type="date" value={task.dueAt?.slice(0, 10) ?? ""} onChange={(event) => void update({ dueAt: event.target.value ? new Date(`${event.target.value}T09:00:00+08:00`).toISOString() : null })} /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Check-in cadence (days)<Input type="number" min={1} value={task.checkinEveryDays ?? ""} placeholder="Committee default" onChange={(event) => setTask({ ...task, checkinEveryDays: event.target.value ? Number(event.target.value) : null })} onBlur={() => void update({ checkinEveryDays: task.checkinEveryDays })} /></label>
        <div><p className="text-xs text-muted-foreground">Next check-in</p><p>{task.nextCheckinAt ? <RelativeDate date={task.nextCheckinAt} /> : "None scheduled"}</p></div>
        <label className="block space-y-1 text-xs text-muted-foreground">Labels<Input value={labels} onChange={(event) => setLabels(event.target.value)} onBlur={() => void update({ labels: labels.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
        <div><p className="text-xs text-muted-foreground">Linked event</p><p>{task.eventId ?? "Events arrive in a later PR."}</p></div>
      </div>}
      commentBox={<div className="space-y-2"><Textarea placeholder="Add a comment…" value={comment} onChange={(event) => setComment(event.target.value)} /><Button disabled={!comment.trim()} onClick={() => void saveComment()}>Comment</Button></div>}
    >
      <div className="space-y-6">
        <section className="space-y-2"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Description</h3><Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} placeholder="Add a markdown description…" /><Button size="sm" variant="outline" onClick={() => void update({ body })}>Save description</Button></section>
        <section><h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Activity</h3><ol className="space-y-3">{task.activity.map((item) => <li key={item.id} className={`border-l-2 pl-3 ${item.kind === "checkin_reply" ? "border-primary bg-primary/5 py-2" : "border-border py-1"}`}>
          {item.kind === "status_change" ? <p className="text-sm text-muted-foreground">Status changed to {String(item.meta?.newValue ?? "")}</p>
            : item.kind === "field_change" ? <p className="text-sm text-muted-foreground">{String(item.meta?.field ?? "Task")} updated</p>
              : item.kind === "nudge_copied" ? <p className="text-sm text-muted-foreground">Nudge copied</p>
                : <p className="whitespace-pre-wrap text-sm">{item.body || item.kind.replace("_", " ")}</p>}
          <time className="mono mt-1 block text-[11px] text-muted-foreground">{new Date(item.at).toLocaleString()}</time>
        </li>)}</ol></section>
      </div>
    </DetailView>
  </div>;
}
