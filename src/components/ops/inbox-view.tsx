"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import { CheckCircleIcon, ChevronDownIcon, ClockIcon, CopyIcon, ReplyIcon } from "@primer/octicons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/patterns/empty-state";
import { Label } from "@/components/patterns/label";
import { STATUS_LABELS, statusLabel } from "@/components/patterns/status-badge";
import { RelativeDate } from "@/components/patterns/relative-date";
import { toastUndo } from "@/components/patterns/toast-undo";
import { apiFetch } from "@/lib/api-client";
import { buildNudge, DEFAULT_NUDGE_TEMPLATE, MANILA_TIME_ZONE } from "@/lib/tasks/logic";

type Person = { id: string; name: string };
type Committee = { id: string; name: string; slug: string; color: "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "purple" | "pink" } | null;
type InboxTask = {
  id: string; number: number; title: string; status: string; progress: number; updatedAt: string;
  dueAt: string | null; nextCheckinAt: string | null; createdAt: string; lastCheckinAt: string | null;
  snoozedUntil: string | null; reason: string; assignee: Person | null; committee: Committee;
};
type InboxData = Record<"checkin_due" | "overdue" | "due_today" | "due_this_week", InboxTask[]>;

const groupLabels = [
  ["checkin_due", "Check-ins due"],
  ["overdue", "Overdue"],
  ["due_today", "Due today"],
  ["due_this_week", "Due this week"],
] as const;

function snoozeDate(days: number): Date {
  const today = new TZDate(new Date(), MANILA_TIME_ZONE);
  const date = addDays(today, days);
  date.setHours(9, 0, 0, 0);
  return new Date(date);
}

function nextMonday(): Date {
  const date = new TZDate(new Date(), MANILA_TIME_ZONE);
  const days = ((8 - date.getDay()) % 7) || 7;
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return new Date(date);
}

export function InboxView() {
  const [data, setData] = useState<InboxData | null>(null);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyStatus, setReplyStatus] = useState("");
  const [replyProgress, setReplyProgress] = useState("");
  const [nudgeTemplate, setNudgeTemplate] = useState(DEFAULT_NUDGE_TEMPLATE);

  const fetchData = useCallback(async () => {
    const [response, settingsResponse] = await Promise.all([fetch("/api/inbox"), fetch("/api/settings")]);
    if (!response.ok) throw new Error("Could not load your inbox.");
    const inbox = await response.json() as InboxData;
    const settings = settingsResponse.ok
      ? await settingsResponse.json() as { "tasks.nudgeTemplate"?: string }
      : {};
    return { inbox, template: settings["tasks.nudgeTemplate"] ?? DEFAULT_NUDGE_TEMPLATE };
  }, []);
  const load = useCallback(async () => {
    const result = await fetchData();
    setData(result.inbox);
    setNudgeTemplate(result.template);
  }, [fetchData]);
  useEffect(() => {
    let active = true;
    void fetchData().then((result) => {
      if (!active) return;
      setData(result.inbox);
      setNudgeTemplate(result.template);
    }).catch(() => { if (active) toast.error("Could not load your inbox."); });
    return () => { active = false; };
  }, [fetchData]);

  const removeTask = (id: string) => {
    setData((current) => current ? Object.fromEntries(Object.entries(current).map(([group, items]) => [group, items.filter((item) => item.id !== id)])) as InboxData : current);
  };

  async function copyNudge(task: InboxTask) {
    const text = buildNudge({ ...task, dueAt: task.dueAt ? new Date(task.dueAt) : null }, task.assignee, task.committee, nudgeTemplate);
    try {
      await navigator.clipboard.writeText(text);
      const response = await apiFetch(`/api/tasks/${task.id}/nudge-copied`, { method: "POST" });
      if (!response.ok) throw new Error();
      toast.success("Nudge copied.");
    } catch {
      toast.error("Could not copy the nudge.");
    }
  }

  async function saveReply(task: InboxTask) {
    const text = replyText.trim();
    if (!text) return;
    const response = await apiFetch(`/api/tasks/${task.id}/reply`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        ...(replyStatus ? { status: replyStatus } : {}),
        ...(replyProgress ? { progress: Number(replyProgress) } : {}),
      }),
    });
    if (!response.ok) return toast.error("Could not log reply.");
    setReplyId(null);
    setReplyText("");
    setReplyStatus("");
    setReplyProgress("");
    await load();
    toast.success("Reply logged.");
  }

  async function markDone(task: InboxTask) {
    const previous = data;
    removeTask(task.id);
    const response = await apiFetch(`/api/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done", expectedUpdatedAt: task.updatedAt }),
    });
    if (!response.ok) {
      setData(previous);
      if (response.status === 409) toast.error("Changed elsewhere — reload");
      else toast.error("Could not complete task.");
      return;
    }
    const updated = await response.json() as { updatedAt: string };
    toastUndo("Task marked done.", () => {
      void apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: task.status, expectedUpdatedAt: updated.updatedAt }),
      }).then(() => load());
    });
  }

  async function snooze(task: InboxTask, until: Date) {
    const previous = data;
    removeTask(task.id);
    const response = await apiFetch(`/api/tasks/${task.id}/snooze`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ until }),
    });
    if (!response.ok) {
      setData(previous);
      toast.error("Could not snooze task.");
      return;
    }
    const result = await response.json() as { updatedAt: string };
    await load();
    toastUndo("Task snoozed.", () => {
      void apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozedUntil: task.snoozedUntil, expectedUpdatedAt: result.updatedAt }),
      }).then(() => load());
    });
  }

  if (!data) return <div className="space-y-3" aria-label="Loading inbox">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-md border border-border bg-card" />)}</div>;
  const total = Object.values(data).reduce((sum, items) => sum + items.length, 0);
  if (!total) return <EmptyState title="You’re all caught up" teachingText="Tasks that need a check-in or are nearing a deadline will show up here." />;

  return <div className="space-y-7">
    {groupLabels.map(([key, title]) => data[key].length > 0 && <section key={key}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}<span className="mono rounded bg-secondary px-1.5 py-0.5 text-xs">{data[key].length}</span></h2>
      <div className="space-y-2">{data[key].map((task) => <article key={task.id} className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="mono text-muted-foreground">#{task.number}</span>
              <Link href={`/tasks/${task.number}`} className="font-semibold hover:text-primary">{task.title}</Link>
              {task.committee && <Label color={task.committee.color}>{task.committee.name}</Label>}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{task.assignee?.name ?? "Unassigned"}</span>
              <span>{task.dueAt ? <>Due <RelativeDate date={task.dueAt} /></> : "No deadline"}</span>
              <span>{task.reason}</span>
            </div>
          </div>
          <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
            <Button size="sm" variant="outline" onClick={() => void copyNudge(task)}><CopyIcon size={14} />Copy nudge</Button>
            <Button size="sm" variant="outline" onClick={() => { setReplyId(replyId === task.id ? null : task.id); setReplyText(""); }}><ReplyIcon size={14} />Log reply</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" variant="outline" aria-label="Snooze task"><ClockIcon size={14} />Snooze<ChevronDownIcon size={12} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => void snooze(task, snoozeDate(1))}>Tomorrow 9am</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void snooze(task, snoozeDate(3))}>3 days</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void snooze(task, nextMonday())}>Next Monday</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" onClick={() => void markDone(task)} aria-label={`Mark ${task.title} done`}><CheckCircleIcon size={15} />Done</Button>
          </div>
        </div>
        {replyId === task.id && <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-[minmax(0,1fr)_150px_110px_auto]">
          <Textarea placeholder="Paste the committee’s reply…" value={replyText} onChange={(event) => setReplyText(event.target.value)} />
          <Select value={replyStatus} onValueChange={setReplyStatus}><SelectTrigger><span>{replyStatus ? statusLabel(replyStatus) : "Keep status"}</span></SelectTrigger><SelectContent>{Object.keys(STATUS_LABELS).filter((status) => status !== "cancelled").map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}</SelectContent></Select>
          <Input type="number" min={0} max={100} aria-label="Progress percent" placeholder={`${task.progress}%`} value={replyProgress} onChange={(event) => setReplyProgress(event.target.value)} />
          <Button disabled={!replyText.trim()} onClick={() => void saveReply(task)}>Save reply</Button>
        </div>}
      </article>)}</div>
    </section>)}
  </div>;
}
