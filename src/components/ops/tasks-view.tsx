"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CalendarIcon, ColumnsIcon, ListUnorderedIcon, PlusIcon, TableIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { EmptyState } from "@/components/patterns/empty-state";
import { FilterBar } from "@/components/patterns/filter-bar";
import { ListView, type ListItem } from "@/components/patterns/list-view";
import { BoardView, CalendarView, EditableCell, TableView, type BoardColumn } from "@/components/patterns/views";
import { STATUS_LABELS, StatusBadge, statusLabel } from "@/components/patterns/status-badge";
import { DatePicker } from "@/components/ui/date-picker";
import { apiFetch } from "@/lib/api-client";

type Task = {
  id: string; number: number; title: string; body: string; status: string; priority: string; progress: number;
  labels: string[]; dueAt: string | null; updatedAt: string; committeeId: string | null; assigneeMemberId: string | null;
  committee: { id: string; name: string; slug: string } | null; assignee: { id: string; name: string } | null;
};
type Choice = { id: string; name: string };
const statuses = Object.keys(STATUS_LABELS);
const views = [
  { value: "list", label: "List", Icon: ListUnorderedIcon },
  { value: "board", label: "Board", Icon: ColumnsIcon },
  { value: "table", label: "Table", Icon: TableIcon },
  { value: "calendar", label: "Calendar", Icon: CalendarIcon },
];

export function TasksView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requestedView = params.get("view");
  const view = views.some((item) => item.value === requestedView) ? requestedView! : "list";
  const creating = params.get("new") === "1";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [committees, setCommittees] = useState<Choice[]>([]);
  const [members, setMembers] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [committeeId, setCommitteeId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [bulkStatus, setBulkStatus] = useState("done");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkSnoozeAt, setBulkSnoozeAt] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    const query = params.get("q") ?? "";
    const [taskResponse, committeeResponse, memberResponse] = await Promise.all([
      fetch(`/api/tasks?q=${encodeURIComponent(query)}`), fetch("/api/committees"), fetch("/api/members"),
    ]);
    return {
      tasks: taskResponse.ok ? await taskResponse.json() as Task[] : null,
      committees: committeeResponse.ok ? await committeeResponse.json() as Choice[] : null,
      members: memberResponse.ok ? await memberResponse.json() as Choice[] : null,
    };
  }, [params]);
  const load = useCallback(async () => {
    const result = await fetchData();
    if (result.tasks) setTasks(result.tasks);
    if (result.committees) setCommittees(result.committees);
    if (result.members) setMembers(result.members);
    setLoading(false);
  }, [fetchData]);
  useEffect(() => {
    let active = true;
    void fetchData().then((result) => {
      if (!active) return;
      if (result.tasks) setTasks(result.tasks);
      if (result.committees) setCommittees(result.committees);
      if (result.members) setMembers(result.members);
      setLoading(false);
    }).catch(() => {
      if (active) { setLoading(false); toast.error("Could not load tasks."); }
    });
    return () => { active = false; };
  }, [fetchData]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey && !target.closest("input,textarea,[contenteditable=true]")) {
        event.preventDefault();
        const next = new URLSearchParams(params.toString());
        next.set("new", "1");
        router.replace(`${pathname}?${next.toString()}`);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [params, pathname, router]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`);
  }

  async function patchTask(task: Task, values: Record<string, unknown>) {
    const response = await apiFetch(`/api/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, expectedUpdatedAt: task.updatedAt }),
    });
    if (response.status === 409) throw new Error("Changed elsewhere — reload");
    if (!response.ok) throw new Error("Could not update task.");
    return response.json() as Promise<Task>;
  }

  async function createTask(event?: React.FormEvent) {
    event?.preventDefault();
    if (!title.trim()) return;
    const response = await apiFetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(), committeeId: committeeId || null, assigneeMemberId: assigneeId || null,
        dueAt: dueAt?.toISOString() ?? null,
      }),
    });
    if (!response.ok) return toast.error("Could not create task.");
    const task = await response.json() as Task;
    setTitle(""); setCommitteeId(""); setAssigneeId(""); setDueAt(null);
    setParam("new", "");
    await load();
    toast.success(`Created #${task.number}.`);
  }

  async function bulk(ids: string[], operation: "status" | "assign" | "snooze") {
    const selected = tasks.filter((task) => ids.includes(task.id));
    try {
      await Promise.all(selected.map((task) => patchTask(task, operation === "status"
        ? { status: bulkStatus }
        : operation === "assign"
          ? { assigneeMemberId: bulkAssignee || null }
          : { snoozedUntil: bulkSnoozeAt?.toISOString() })));
      await load();
      toast.success("Selected tasks updated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update tasks."); }
  }

  const rows: ListItem[] = useMemo(() => tasks.map((task) => ({
    id: task.id, title: `#${task.number} ${task.title}`, labels: [task.priority, ...(task.committee ? [task.committee.name] : []), ...task.labels],
    due: task.dueAt ?? undefined, assignee: task.assignee?.name, closed: task.status === "done" || task.status === "cancelled", status: task.status,
    href: `/tasks/${task.number}`,
  })), [tasks]);
  const closedCount = tasks.filter((task) => task.status === "done" || task.status === "cancelled").length;
  const state = params.get("state") === "closed" ? "closed" : "open";
  const visibleTasks = tasks.filter((task) => (task.status === "done" || task.status === "cancelled") === (state === "closed"));
  const boardColumns: BoardColumn[] = statuses.map((status) => ({
    id: status, title: statusLabel(status), status,
    items: tasks.filter((task) => task.status === status).map((task) => ({ id: task.id, content: <Link href={`/tasks/${task.number}`} className="block"><span className="mono text-xs text-muted-foreground">#{task.number}</span><p className="mt-1 font-medium">{task.title}</p><p className="mt-2 text-xs text-muted-foreground">{task.committee?.name ?? "No committee"} · {task.assignee?.name ?? "Unassigned"}</p></Link> })),
  }));

  if (loading) return <div className="space-y-3" aria-label="Loading tasks">{[0, 1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-md bg-secondary" />)}</div>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-64 flex-1"><FilterBar placeholder="Filter tasks…" /></div>
      <Button onClick={() => setParam("new", "1")}><PlusIcon size={15} />New task</Button>
      <div className="flex rounded-md border border-border bg-card p-0.5" role="group" aria-label="Task view">
        {views.map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setParam("view", value)} className={`inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs ${view === value ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}><Icon size={14} /><span>{label}</span></button>)}
      </div>
    </div>
    {view !== "board" && view !== "list" && <nav className="flex gap-1 border-b border-border" aria-label="Task status">{(["open", "closed"] as const).map((item) => <button key={item} type="button" aria-current={state === item ? "page" : undefined} onClick={() => setParam("state", item === "open" ? "" : item)} className={`rounded-t px-3 py-2 text-sm capitalize ${state === item ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}>{item} <span className="mono text-xs">{item === "open" ? tasks.length - closedCount : closedCount}</span></button>)}</nav>}
    {creating && <form onSubmit={(event) => void createTask(event)} className="grid gap-2 rounded-md border border-border bg-card p-3 md:grid-cols-[minmax(180px,1fr)_180px_180px_150px_auto]">
      <Input autoFocus placeholder="Task title…" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setParam("new", ""); }} />
      <Combobox options={committees.map((item) => ({ value: item.id, label: item.name }))} value={committeeId} onChange={setCommitteeId} placeholder="Committee" />
      <Combobox options={members.map((item) => ({ value: item.id, label: item.name }))} value={assigneeId} onChange={setAssigneeId} placeholder="Assignee" />
      <DatePicker value={dueAt} onChange={setDueAt} ariaLabel="Due date" />
      <Button disabled={!title.trim()}>Create</Button>
    </form>}
    {tasks.length === 0 || (view !== "list" && view !== "board" && visibleTasks.length === 0) ? <EmptyState title="No tasks match" teachingText="Create a task or adjust the filter query." action={<Button onClick={() => setParam("new", "1")}>New task</Button>} /> : view === "list" ? <ListView rows={rows} bulkActions={(ids) => <div className="flex flex-wrap items-center gap-2">
      <Select value={bulkStatus} onValueChange={setBulkStatus}><SelectTrigger className="h-8 w-32"><span>Status</span></SelectTrigger><SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}</SelectContent></Select>
      <Button size="sm" variant="outline" onClick={() => void bulk(ids, "status")}>Set status</Button>
      <Combobox options={[{ value: "", label: "Unassigned" }, ...members.map((member) => ({ value: member.id, label: member.name }))]} value={bulkAssignee} onChange={setBulkAssignee} placeholder="Assignee" />
      <Button size="sm" variant="outline" onClick={() => void bulk(ids, "assign")}>Assign</Button>
      <div className="flex items-center gap-2"><DatePicker value={bulkSnoozeAt} onChange={setBulkSnoozeAt} placeholder="Snooze until" ariaLabel="Bulk snooze date" /><Button size="sm" variant="outline" disabled={!bulkSnoozeAt} onClick={() => void bulk(ids, "snooze")}>Snooze</Button></div>
    </div>} /> : view === "board" ? <div className="overflow-x-auto"><BoardView key={tasks.map((task) => task.updatedAt).join("|")} columns={boardColumns} onMove={(id, status) => {
      const task = tasks.find((item) => item.id === id);
      if (task) {
        setTasks((current) => current.map((item) => item.id === id ? { ...item, status } : item));
        void patchTask(task, { status }).then(load).catch((error) => { toast.error(error.message); void load(); });
      }
    }} /></div> : view === "table" ? <TableView><thead><tr className="bg-card text-xs uppercase text-muted-foreground">{["Task", "Status", "Priority", "Committee", "Assignee", "Due"].map((name) => <th key={name} className="p-3">{name}</th>)}</tr></thead><tbody>{visibleTasks.map((task) => <tr key={task.id} className="border-t border-border"><EditableCell value={`#${task.number} ${task.title}`} onSave={(value) => void patchTask(task, { title: value.replace(/^#\d+\s*/, "") }).then(load).catch((error) => toast.error(error.message))} /><td className="p-3"><StatusBadge status={task.status} /></td><td className="p-3">{task.priority}</td><td className="p-3">{task.committee?.name ?? "—"}</td><td className="p-3">{task.assignee?.name ?? "—"}</td><td className="p-3">{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "—"}</td></tr>)}</tbody></TableView> : <CalendarView items={visibleTasks.filter((task) => task.dueAt).map((task) => ({ id: task.id, date: task.dueAt!, title: `#${task.number} ${task.title}`, href: `/tasks/${task.number}` }))} />}
  </div>;
}
