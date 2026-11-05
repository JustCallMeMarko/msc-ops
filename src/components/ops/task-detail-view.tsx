"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PencilIcon, XIcon } from "@primer/octicons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { DetailView } from "@/components/patterns/detail-view";
import { RelativeDate } from "@/components/patterns/relative-date";
import { priorityLabel, STATUS_LABELS, StatusBadge, statusLabel } from "@/components/patterns/status-badge";
import { DatePicker } from "@/components/ui/date-picker";
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
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [editingBody, setEditingBody] = useState(false);
  const [comment, setComment] = useState("");

  const fetchData = useCallback(async () => {
    const [taskResponse, committeeResponse, memberResponse, tasksResponse] = await Promise.all([
      fetch(`/api/tasks/${number}`), fetch("/api/committees"), fetch("/api/members"), fetch("/api/tasks"),
    ]);
    const allTasks = tasksResponse.ok ? await tasksResponse.json() as Array<{ labels: string[] }> : [];
    return {
      task: taskResponse.ok ? await taskResponse.json() as Task : null,
      committees: committeeResponse.ok ? await committeeResponse.json() as Array<{ id: string; name: string; slug: string }> : [],
      members: memberResponse.ok ? await memberResponse.json() as Array<{ id: string; name: string }> : [],
      labels: [...new Set(allTasks.flatMap((item) => item.labels))].sort((a, b) => a.localeCompare(b)),
    };
  }, [number]);
  const load = useCallback(async () => {
    const result = await fetchData();
    setTask(result.task);
    if (result.task) setBody(result.task.body);
    setCommittees(result.committees);
    setMembers(result.members);
    setAvailableLabels(result.labels);
  }, [fetchData]);
  useEffect(() => {
    let active = true;
    void fetchData().then((result) => {
      if (!active) return;
      setTask(result.task);
      if (result.task) setBody(result.task.body);
      setCommittees(result.committees);
      setMembers(result.members);
      setAvailableLabels(result.labels);
    });
    return () => { active = false; };
  }, [fetchData]);

  async function update(values: Record<string, unknown>): Promise<boolean> {
    if (!task) return false;
    const response = await apiFetch(`/api/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, expectedUpdatedAt: task.updatedAt }),
    });
    if (response.status === 409) { toast.error("Changed elsewhere — reload"); return false; }
    if (!response.ok) { toast.error("Could not update task."); return false; }
    setTask(await response.json() as Task);
    await load();
    return true;
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
    <DetailView title={`#${task.number} ${task.title}`} status={<StatusBadge status={task.status} />}
      sidebar={<div className="space-y-4 text-sm">
        <label className="block space-y-1 text-xs text-muted-foreground">Assignee<Combobox options={members.map((item) => ({ value: item.id, label: item.name }))} value={task.assigneeMemberId ?? ""} onChange={(value) => void update({ assigneeMemberId: value || null })} placeholder="Unassigned" /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Committee<Combobox options={committees.map((item) => ({ value: item.id, label: item.name }))} value={task.committeeId ?? ""} onChange={(value) => void update({ committeeId: value || null })} placeholder="No committee" /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Status<Select value={task.status} onValueChange={(status) => void update({ status })}><SelectTrigger><span>{statusLabel(task.status)}</span></SelectTrigger><SelectContent>{Object.keys(STATUS_LABELS).map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}</SelectContent></Select></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Priority<Select value={task.priority} onValueChange={(priority) => void update({ priority })}><SelectTrigger><span>{priorityLabel(task.priority)}</span></SelectTrigger><SelectContent>{["low", "normal", "high", "urgent"].map((priority) => <SelectItem key={priority} value={priority}>{priorityLabel(priority)}</SelectItem>)}</SelectContent></Select></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Progress (%)<Input type="number" min={0} max={100} value={task.progress} onChange={(event) => setTask({ ...task, progress: Number(event.target.value) })} onBlur={() => void update({ progress: task.progress })} /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Due date<DatePicker value={task.dueAt ? new Date(task.dueAt) : null} onChange={(date) => void update({ dueAt: date?.toISOString() ?? null })} /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Check-in cadence (days)<Input type="number" min={1} value={task.checkinEveryDays ?? ""} placeholder="Committee default" onChange={(event) => setTask({ ...task, checkinEveryDays: event.target.value ? Number(event.target.value) : null })} onBlur={() => void update({ checkinEveryDays: task.checkinEveryDays })} /></label>
        <div><p className="text-xs text-muted-foreground">Next check-in</p><p>{task.nextCheckinAt ? <RelativeDate date={task.nextCheckinAt} /> : "None scheduled"}</p></div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Labels</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {task.labels.map((label) => <span key={label} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-1 text-xs">
              {label}
              <button type="button" aria-label={`Remove ${label} label`} className="rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => void update({ labels: task.labels.filter((item) => item !== label) })}><XIcon size={12} /></button>
            </span>)}
            <Combobox
              options={availableLabels.filter((label) => !task.labels.includes(label)).map((label) => ({ value: label, label }))}
              value=""
              onChange={(label) => void update({ labels: [...task.labels, label] })}
              placeholder="+ label"
            />
          </div>
        </div>
        <div><p className="text-xs text-muted-foreground">Linked event</p><p>{task.eventId ?? "Events arrive in a later PR."}</p></div>
      </div>}
      commentBox={<div className="space-y-2"><Textarea placeholder="Add a comment…" value={comment} onChange={(event) => setComment(event.target.value)} /><Button disabled={!comment.trim()} onClick={() => void saveComment()}>Comment</Button></div>}
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Description</h3>
            {!editingBody && <Button size="sm" variant="outline" aria-label="Edit description" onClick={() => setEditingBody(true)}><PencilIcon size={14} />Edit</Button>}
          </div>
          {editingBody
            ? <div className="space-y-2">
              <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} placeholder="Add a markdown description…" />
              <div className="flex gap-2">
                <Button size="sm" onClick={async () => { if (await update({ body })) setEditingBody(false); }}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setBody(task.body); setEditingBody(false); }}>Cancel</Button>
              </div>
            </div>
            : body.trim()
              ? <div className="text-sm leading-6 [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_h1]:my-3 [&_h1]:text-xl [&_h2]:my-3 [&_h2]:text-lg [&_h3]:my-2 [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-secondary [&_pre]:p-3 [&_ul]:list-disc">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} rel="noreferrer">{children}</a> }}>{body}</ReactMarkdown>
              </div>
              : <p className="text-sm text-muted-foreground">No description · <button type="button" className="text-primary hover:underline" onClick={() => setEditingBody(true)}>Add one</button></p>}
        </section>
        <section><h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Activity</h3><ol className="space-y-3">{task.activity.map((item) => <li key={item.id} className={`border-l-2 pl-3 ${item.kind === "checkin_reply" ? "border-primary bg-primary/5 py-2" : "border-border py-1"}`}>
          {item.kind === "status_change" ? <p className="text-sm text-muted-foreground">Status changed to {statusLabel(String(item.meta?.newValue ?? ""))}</p>
            : item.kind === "field_change" ? <p className="text-sm text-muted-foreground">{String(item.meta?.field ?? "Task")} updated</p>
              : item.kind === "nudge_copied" ? <p className="text-sm text-muted-foreground">Nudge copied</p>
                : <p className="whitespace-pre-wrap text-sm">{item.body || item.kind.replace("_", " ")}</p>}
          <div className="mt-1"><RelativeDate date={item.at} /></div>
        </li>)}</ol></section>
      </div>
    </DetailView>
  </div>;
}
