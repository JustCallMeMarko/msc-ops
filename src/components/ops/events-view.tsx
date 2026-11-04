"use client";
/* eslint-disable @next/next/no-img-element -- Event photos are displayed from local file content routes. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, addMonths, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { toast } from "sonner";
import { AlertIcon, CalendarIcon, CheckCircleIcon, CopyIcon, PlusIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/patterns/empty-state";
import { RelativeDate } from "@/components/patterns/relative-date";
import { toastUndo } from "@/components/patterns/toast-undo";
import { apiFetch } from "@/lib/api-client";
import { now } from "@/lib/clock";
import { MANILA_TIME_ZONE } from "@/lib/tasks/logic";
import { APPROVAL_STATUS_LABELS, ATTENDEE_SOURCE_LABELS, EVENT_TYPE_LABELS, FILE_SOURCE_LABELS, enumLabel, fileKindLabel } from "@/lib/ui-labels";

type EventRow = { id: string; name: string; slug: string; type: string; startsAt: string; endsAt: string; venue: string; description: string; approvalStatus: string; lumaUrl: string | null; participantTarget: number; participantActual: number; hasFees: boolean; hasExternalGuests: boolean; isMajor: boolean; updatedAt: string; checklistProgress?: { done: number; total: number } };
type Item = { id: string; phase: string; title: string; detail: string; source: string; ruleKey: string | null; dueAt: string; dueOverridden: boolean; late: boolean; status: string; taskId: string | null; taskNumber: number | null };
type CommitteeOption = { id: string; name: string };
type AuxiliaryRecord = { id: string; name?: string; email?: string | null; checkedIn?: boolean; source?: string | null; caption?: string | null; originalName?: string; kind?: string; size?: number };
type ImportPreview = { rows: Array<{ name: string; email: string | null; checkedIn: boolean }>; skipped: number; warnings: string[] };
type RuleOption = { key: string; offsetDays: number; anchor: string; source: string };
const tabs = ["overview", "checklist", "announcements", "photos", "attendees", "files"];
const day = (v: string) => new Date(v).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
const time = (v: string) => new Date(v).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const shortDay = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: MANILA_TIME_ZONE, month: "short", day: "numeric" }).format(new Date(value));
const phaseLabels: Record<string, string> = { pre: "Pre-event", during: "During event", post: "Post-event" };

function ApprovalBadge({ status }: { status: string }) {
  const approved = status === "approved";
  const rejected = status === "rejected";
  const tone = approved
    ? "border-success/50 bg-success/10 text-success"
    : rejected
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : status === "submitted"
        ? "border-attention/50 bg-attention/10 text-attention"
        : "border-border bg-secondary text-muted-foreground";
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
    {approved && <CheckCircleIcon size={12} />}
    {rejected && <AlertIcon size={12} />}
    {APPROVAL_STATUS_LABELS[status] ?? enumLabel(status)}
  </span>;
}

function ruleOffsetLabel(rule: RuleOption) {
  const anchor = rule.anchor === "event_end" ? "E" : "T";
  return `${anchor}${rule.offsetDays > 0 ? "+" : ""}${rule.offsetDays}`;
}

function ChecklistItemRow({
  item,
  rule,
  committees,
  onStatusChange,
  onDueDateChange,
  onAssign,
  onResetDueDate,
}: {
  item: Item;
  rule?: RuleOption;
  committees: CommitteeOption[];
  onStatusChange: (checked: boolean) => void;
  onDueDateChange: (value: Date | null) => void;
  onAssign: (committeeId: string) => void;
  onResetDueDate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return <div id={`checklist-${item.id}`} className="border-t border-border py-3">
    <div className="flex flex-wrap items-center gap-2">
      <Checkbox checked={item.status === "done"} onCheckedChange={(checked) => onStatusChange(checked === true)} />
      <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2">
        <span className={`font-medium ${item.status === "done" ? "text-muted-foreground line-through" : ""}`}>{item.title}</span>
        {rule && <span title={rule.source} className="max-w-full truncate rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">{ruleOffsetLabel(rule)} · {rule.source}</span>}
      </div>
      <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
        <DatePicker
          value={new Date(item.dueAt)}
          onChange={onDueDateChange}
          ariaLabel={`Due date for ${item.title}`}
          displayValue={<><span>{shortDay(item.dueAt)}</span><span>·</span><RelativeDate date={item.dueAt} /></>}
          className="h-7 min-h-0 w-auto gap-1 px-2 text-xs"
        />
        {item.late && <span className="rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Late</span>}
        {item.dueOverridden && <span className="inline-flex items-center gap-1 rounded-full border border-attention/50 bg-attention/10 px-2 py-0.5 text-xs text-attention">Overridden<Button size="sm" variant="ghost" className="h-5 min-h-0 px-1 text-[10px] text-attention" onClick={onResetDueDate}>Reset</Button></span>}
        {item.taskId
          ? item.taskNumber !== null
            ? <Link className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium hover:bg-secondary/70" href={`/tasks/${item.taskNumber}`}>#{item.taskNumber}</Link>
            : <span className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium">Task linked</span>
          : <div className="w-24"><Combobox options={committees.map((committee) => ({ value: committee.id, label: committee.name }))} onChange={onAssign} placeholder="Assign" disabled={!committees.length} buttonClassName="h-7 min-h-0 justify-between px-2 text-xs" /></div>}
      </div>
    </div>
    {item.detail && <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} className={`ml-8 mt-1 block w-[calc(100%-2rem)] text-left text-xs text-muted-foreground ${expanded ? "whitespace-normal" : "line-clamp-1"}`}>{item.detail}</button>}
  </div>;
}
function manilaTime(value: string) {
  const zoned = new TZDate(value, MANILA_TIME_ZONE);
  return `${String(zoned.getHours()).padStart(2, "0")}:${String(zoned.getMinutes()).padStart(2, "0")}`;
}
function withTime(date: Date | null, time: string) {
  if (!date) return null;
  const value = new TZDate(date, MANILA_TIME_ZONE);
  const [hour, minute] = time.split(":").map(Number);
  value.setHours(hour || 0, minute || 0, 0, 0);
  return new Date(value.getTime());
}

export function EventsView() {
  const router = useRouter();
  const params = useSearchParams();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [name, setName] = useState("");
  const [type, setType] = useState("on_campus");
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [venue, setVenue] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/events?q=${encodeURIComponent(params.get("q") ?? "")}`);
    if (response.ok) setEvents(await response.json());
    setLoading(false);
  }, [params]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Load event listings from the local API.
  useEffect(() => { void load(); }, [load]);
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`/events${next.size ? `?${next}` : ""}`);
  };
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !start || !end) return;
    const response = await apiFetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type, startsAt: withTime(start, startTime), endsAt: withTime(end, endTime), venue }) });
    if (!response.ok) return toast.error("Could not create event.");
    const event = await response.json() as EventRow;
    router.push(`/events/${event.slug}`);
  }
  const view = params.get("view") === "calendar" ? "calendar" : "list";
  const monthParam = params.get("month");
  const monthDate = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? new Date(`${monthParam}-01T12:00:00+08:00`) : new Date();
  const manilaMonth = new TZDate(monthDate, MANILA_TIME_ZONE);
  const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(startOfWeek(startOfMonth(manilaMonth), { weekStartsOn: 1 }), index));
  const eventsByDay = new Map<string, EventRow[]>();
  for (const event of events) {
    const key = format(new TZDate(event.startsAt, MANILA_TIME_ZONE), "yyyy-MM-dd");
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Events</h1><p className="text-sm text-muted-foreground">Deadlines, approvals, and event-day operations.</p></div><Button onClick={() => setCreating(!creating)}><PlusIcon size={14} />New event</Button></div>
    <div className="flex flex-wrap gap-2"><Input placeholder="Filter: type:off_campus status:approved is:upcoming" defaultValue={params.get("q") ?? ""} onChange={(e) => setParam("q", e.target.value)} className="min-w-64 flex-1" /><div className="inline-flex rounded border border-border p-1"><Button size="sm" variant={view === "list" ? "default" : "ghost"} onClick={() => setParam("view", "list")}>List</Button><Button size="sm" variant={view === "calendar" ? "default" : "ghost"} onClick={() => setParam("view", "calendar")}><CalendarIcon size={14} />Calendar</Button></div></div>
    {creating && <form onSubmit={(e) => void create(e)} className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-2"><Input autoFocus placeholder="Event name" value={name} onChange={(e) => setName(e.target.value)} /><Select value={type} onValueChange={setType}><SelectTrigger><span>{EVENT_TYPE_LABELS[type]}</span></SelectTrigger><SelectContent>{Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><label className="space-y-1 text-xs text-muted-foreground">Starts<div className="flex gap-2"><DatePicker value={start} onChange={setStart} /><Input aria-label="Start time (Manila)" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-24" /></div></label><label className="space-y-1 text-xs text-muted-foreground">Ends<div className="flex gap-2"><DatePicker value={end} onChange={setEnd} /><Input aria-label="End time (Manila)" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-24" /></div></label><Input placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} /><Button disabled={!name.trim() || !start || !end}>Create event</Button></form>}
    {loading ? <div className="h-56 animate-pulse rounded bg-secondary" aria-label="Loading events" /> : view === "calendar" ? <section className="space-y-3"><header className="flex items-center justify-between"><Button size="sm" variant="outline" onClick={() => setParam("month", format(addMonths(manilaMonth, -1), "yyyy-MM"))}>Previous</Button><h2 className="font-semibold">{format(manilaMonth, "MMMM yyyy")}</h2><Button size="sm" variant="outline" onClick={() => setParam("month", format(addMonths(manilaMonth, 1), "yyyy-MM"))}>Next</Button></header><div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded border border-border bg-card">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((weekday) => <div key={weekday} className="border-b border-border p-2 text-xs font-medium text-muted-foreground">{weekday}</div>)}{calendarDays.map((date) => { const key = format(date, "yyyy-MM-dd"); return <div key={key} className={`min-h-28 border-b border-r border-border p-2 ${isSameMonth(date, manilaMonth) ? "" : "bg-secondary/30 text-muted-foreground"}`}><span className="text-xs">{format(date, "d")}</span><div className="mt-1 space-y-1">{(eventsByDay.get(key) ?? []).map((event) => <Link key={event.id} href={`/events/${event.slug}`} className="block truncate rounded bg-primary/15 px-1.5 py-1 text-xs text-primary">{event.name}</Link>)}</div></div>; })}</div></section> : events.length ? <div className="grid gap-3 md:grid-cols-2">{events.map((event) => {
      const total = event.checklistProgress?.total ?? 0;
      const done = event.checklistProgress?.done ?? 0;
      const progress = total ? Math.round((done / total) * 100) : 0;
      const startsAt = new Date(event.startsAt);
      const daysUntil = Math.ceil((startsAt.getTime() - now().getTime()) / 86_400_000);
      return <Link key={event.id} href={`/events/${event.slug}`} className="rounded-md border border-border bg-card p-4 hover:border-primary/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">{event.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{day(event.startsAt)} · {time(event.startsAt)} · {event.venue || (EVENT_TYPE_LABELS[event.type] ?? enumLabel(event.type))}</p>
            <p className="mt-2 text-xs text-muted-foreground">{EVENT_TYPE_LABELS[event.type] ?? enumLabel(event.type)} · {daysUntil >= 0 ? `In ${daysUntil} days` : "Past event"}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <ApprovalBadge status={event.approvalStatus} />
            <span role="progressbar" aria-label={`${done} of ${total} checklist items complete`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="relative grid size-11 place-items-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 size-11 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${progress} 100`} strokeLinecap="round" className="text-primary" />
              </svg>
              <span className="text-[10px] font-medium">{done}/{total}</span>
            </span>
          </div>
        </div>
      </Link>;
    })}</div> : <EmptyState title="No events yet" teachingText="Create an event to generate the RSO deadline checklist." />}
  </div>;
}

export function EventDetailView({ slug }: { slug: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const tab = tabs.includes(params.get("tab") ?? "") ? params.get("tab")! : "overview";
  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [rules, setRules] = useState<RuleOption[]>([]);
  const [committees, setCommittees] = useState<CommitteeOption[]>([]);
  const [records, setRecords] = useState<AuxiliaryRecord[]>([]);
  const [templates, setTemplates] = useState<Array<{ key: string; name: string }>>([]);
  const [announcement, setAnnouncement] = useState<{ text: string; warning: string | null } | null>(null);
  const [canPolish, setCanPolish] = useState(false);
  const [polishedText, setPolishedText] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<ImportPreview | null>(null);
  const [newAttendee, setNewAttendee] = useState({ name: "", email: "" });
  const [attendeeQuery, setAttendeeQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    const [eventResponse, checklistResponse, committeeResponse, ruleResponse] = await Promise.all([fetch(`/api/events/${slug}`), fetch(`/api/events/${slug}/checklist`), fetch("/api/committees"), fetch("/api/deadline-rules")]);
    if (eventResponse.ok) setEvent(await eventResponse.json());
    if (checklistResponse.ok) setItems(await checklistResponse.json());
    if (committeeResponse.ok) setCommittees(await committeeResponse.json());
    if (ruleResponse.ok) setRules(await ruleResponse.json());
    const path = tab === "photos" ? `/api/events/${slug}/photos` : tab === "attendees" ? `/api/events/${slug}/attendees` : tab === "files" ? `/api/files?event=${slug}` : "";
    if (path) { const response = await fetch(path); if (response.ok) { const body = await response.json(); setRecords(tab === "files" ? body.files : body); } }
    if (tab === "announcements") {
      const [templateResponse, settingsResponse] = await Promise.all([fetch("/api/announcements/templates"), fetch("/api/settings")]);
      if (templateResponse.ok) setTemplates(await templateResponse.json());
      if (settingsResponse.ok) {
        const settings = await settingsResponse.json() as Record<string, { chat?: unknown }>;
        setCanPolish(Boolean(settings["ai.defaults"]?.chat));
      }
    }
    setBusy(false);
  }, [slug, tab]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Load event detail and tab data from the local API.
  useEffect(() => { void load(); }, [load]);
  async function patch(values: Record<string, unknown>) {
    if (!event) return;
    const response = await apiFetch(`/api/events/${slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, expectedUpdatedAt: event.updatedAt }) });
    if (response.status === 409) return toast.error("Changed elsewhere — reload");
    if (!response.ok) return toast.error("Could not update event.");
    setEvent(await response.json());
  }
  async function upload(file: File, path: string) {
    const form = new FormData(); form.append("file", file);
    const response = await apiFetch(path, { method: "POST", body: form });
    if (!response.ok) return toast.error((await response.json()).error ?? "Upload failed.");
    await load();
  }
  async function assignChecklistItem(item: Item, committeeId: string) {
    if (!committeeId) return toast.error("Choose a committee first.");
    const response = await apiFetch(`/api/events/${slug}/checklist/${item.id}/assign`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ committeeId }),
    });
    if (!response.ok) return toast.error((await response.json()).error ?? "Could not create task.");
    await load();
    toast.success("Checklist item assigned as a task.");
  }
  async function setChecklistDueDate(item: Item, dueAt: Date | null) {
    const response = await apiFetch(`/api/events/${slug}/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dueAt ? { dueAt } : { resetDueAt: true }),
    });
    if (!response.ok) return toast.error("Could not update the checklist deadline.");
    await load();
  }
  async function polishAnnouncement() {
    if (!announcement?.text) return;
    setPolishing(true);
    setPolishedText(null);
    const response = await apiFetch("/api/announcements/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: announcement.text, eventId: slug }),
    });
    setPolishing(false);
    if (!response.ok) return toast.error((await response.json()).error ?? "Could not polish announcement.");
    setPolishedText((await response.json()).text);
  }
  useEffect(() => {
    if (tab !== "attendees") return;
    let cancelled = false;
    const query = attendeeQuery ? `?q=${encodeURIComponent(attendeeQuery)}` : "";
    void fetch(`/api/events/${slug}/attendees${query}`).then(async (response) => {
      if (response.ok && !cancelled) setRecords(await response.json());
    });
    return () => { cancelled = true; };
  }, [attendeeQuery, slug, tab]);
  if (busy) return <div className="h-64 animate-pulse rounded bg-secondary" />;
  if (!event) return <EmptyState title="Event not found" teachingText="This event may have been removed." />;
  const captionedPhotoCount = records.filter((photo) => Boolean(photo.caption?.trim())).length;
  const lateItems = items.filter((item) => item.late && item.status === "open");
  const lateParItems = lateItems.filter((item) => item.ruleKey === "par");
  const rulesByKey = new Map(rules.map((rule) => [rule.key, rule]));
  return <div className="space-y-5">
    <div><Link href="/events" className="text-sm text-muted-foreground">Events</Link><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{event.name}</h1><ApprovalBadge status={event.approvalStatus} /></div><p className="text-sm text-muted-foreground">{day(event.startsAt)} · {time(event.startsAt)} · {event.venue}</p></div>
    {lateItems.length > 0 && <div role="alert" className="flex gap-3 rounded-md border border-attention/50 bg-attention/10 p-3 text-sm text-attention"><AlertIcon size={16} className="mt-0.5 shrink-0" /><div><p className="font-semibold">LATE: needs SDAO extension</p><p className="mt-1">Late items: {lateItems.map((item, index) => <span key={item.id}>{index > 0 && ", "}<Link className="underline underline-offset-2" href={`/events/${slug}?tab=checklist#checklist-${item.id}`}>{item.title}</Link></span>)}</p></div></div>}
    {lateParItems.length > 0 && <div role="alert" className="flex gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"><AlertIcon size={16} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Late PAR — this holds succeeding proposals.</p><p className="mt-1">Past-due reports: {lateParItems.map((item, index) => <span key={item.id}>{index > 0 && ", "}<Link className="underline underline-offset-2" href={`/events/${slug}?tab=checklist#checklist-${item.id}`}>{item.title}</Link></span>)}</p></div></div>}
    <nav className="flex flex-wrap border-b border-border" aria-label="Event sections">{tabs.map((value) => <button key={value} className={`border-b-2 px-3 py-2 text-sm capitalize ${tab === value ? "border-primary" : "border-transparent text-muted-foreground"}`} onClick={() => router.replace(`/events/${slug}?tab=${value}`)}>{value}</button>)}</nav>
    {tab === "overview" && <section className="grid gap-4 rounded-md border border-border bg-card p-4 md:grid-cols-2">
      <label className="space-y-1 text-xs text-muted-foreground">Name<Input value={event.name} onChange={(e) => setEvent({ ...event, name: e.target.value })} onBlur={() => void patch({ name: event.name })} /></label>
      <label className="space-y-1 text-xs text-muted-foreground">Approval<Select value={event.approvalStatus} onValueChange={(value) => void patch({ approvalStatus: value })}><SelectTrigger><ApprovalBadge status={event.approvalStatus} /></SelectTrigger><SelectContent>{Object.entries(APPROVAL_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="space-y-1 text-xs text-muted-foreground">Event type<Select value={event.type} onValueChange={(value) => void patch({ type: value })}><SelectTrigger><span>{EVENT_TYPE_LABELS[event.type] ?? enumLabel(event.type)}</span></SelectTrigger><SelectContent>{Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="space-y-1 text-xs text-muted-foreground">Venue<Input value={event.venue} onChange={(e) => setEvent({ ...event, venue: e.target.value })} onBlur={() => void patch({ venue: event.venue })} /></label>
      <label className="space-y-1 text-xs text-muted-foreground">Starts<div className="flex gap-2"><DatePicker value={new Date(event.startsAt)} onChange={(value) => { if (!value) return; const next = withTime(value, manilaTime(event.startsAt)); if (next) { setEvent({ ...event, startsAt: next.toISOString() }); void patch({ startsAt: next }); } }} ariaLabel="Event start date" /><Input type="time" aria-label="Event start time (Manila)" value={manilaTime(event.startsAt)} onChange={(e) => { const next = withTime(new Date(event.startsAt), e.target.value); if (next) setEvent({ ...event, startsAt: next.toISOString() }); }} onBlur={() => void patch({ startsAt: event.startsAt })} className="w-32" /></div></label>
      <label className="space-y-1 text-xs text-muted-foreground">Ends<div className="flex gap-2"><DatePicker value={new Date(event.endsAt)} onChange={(value) => { if (!value) return; const next = withTime(value, manilaTime(event.endsAt)); if (next) { setEvent({ ...event, endsAt: next.toISOString() }); void patch({ endsAt: next }); } }} ariaLabel="Event end date" /><Input type="time" aria-label="Event end time (Manila)" value={manilaTime(event.endsAt)} onChange={(e) => { const next = withTime(new Date(event.endsAt), e.target.value); if (next) setEvent({ ...event, endsAt: next.toISOString() }); }} onBlur={() => void patch({ endsAt: event.endsAt })} className="w-32" /></div></label>
      <label className="space-y-1 text-xs text-muted-foreground md:col-span-2">Description<Textarea value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} onBlur={() => void patch({ description: event.description })} /></label>
      <div className="space-y-1 text-xs text-muted-foreground md:col-span-2"><label htmlFor="event-luma-url">Luma URL</label><div className="flex gap-2"><Input id="event-luma-url" placeholder="https://lu.ma/your-event" value={event.lumaUrl ?? ""} onChange={(e) => setEvent({ ...event, lumaUrl: e.target.value || null })} onBlur={() => void patch({ lumaUrl: event.lumaUrl })} />{event.lumaUrl && <a href={event.lumaUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 shrink-0 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary">Open</a>}</div></div>
      <label className="space-y-1 text-xs text-muted-foreground">Participant target<Input type="number" min={0} value={event.participantTarget} onChange={(e) => setEvent({ ...event, participantTarget: Number(e.target.value) })} onBlur={() => void patch({ participantTarget: event.participantTarget })} /></label>
      <div className="space-y-2 self-end pb-1"><div className="flex items-center justify-between text-sm"><span>Checked in</span><span>{event.participantActual} / {event.participantTarget}</span></div><div role="progressbar" aria-label="Event attendance progress" aria-valuenow={event.participantTarget ? Math.min(100, Math.round((event.participantActual / event.participantTarget) * 100)) : 0} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${event.participantTarget ? Math.min(100, (event.participantActual / event.participantTarget) * 100) : 0}%` }} /></div></div>
      <div className="flex flex-wrap gap-5 border-t border-border pt-3 text-sm md:col-span-2">{[["Fees", "hasFees"], ["External guests", "hasExternalGuests"], ["Major event", "isMajor"]].map(([label, key]) => <label key={key} className="inline-flex items-center gap-2"><Switch checked={event[key as "hasFees" | "hasExternalGuests" | "isMajor"]} onCheckedChange={(checked) => void patch({ [key]: checked })} />{label}</label>)}</div>
    </section>}
    {tab === "checklist" && <div className="space-y-4">{["pre","during","post"].map((phase) => {
      const phaseItems = items.filter((item) => item.phase === phase);
      const done = phaseItems.filter((item) => item.status === "done").length;
      return <section key={phase} className="rounded border border-border bg-card p-4"><h2 className="mb-3 flex items-center justify-between font-semibold"><span>{phaseLabels[phase]}</span><span className="text-xs font-normal text-muted-foreground">{done}/{phaseItems.length} done</span></h2>
        {phaseItems.map((item) => <ChecklistItemRow key={item.id} item={item} rule={item.ruleKey ? rulesByKey.get(item.ruleKey) : undefined} committees={committees} onStatusChange={(checked) => void apiFetch(`/api/events/${slug}/checklist/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: checked ? "done" : "open" }) }).then(load)} onDueDateChange={(value) => void setChecklistDueDate(item, value)} onResetDueDate={() => void setChecklistDueDate(item, null)} onAssign={(committeeId) => void assignChecklistItem(item, committeeId)} />)}
      </section>;
    })}</div>}
    {tab === "announcements" && <div className="grid gap-3 md:grid-cols-[220px_1fr]"><div className="space-y-2">{templates.map((template) => <Button key={template.key} variant="outline" className="w-full justify-start" onClick={async () => { const response = await apiFetch("/api/announcements/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: slug, templateKey: template.key }) }); if (response.ok) { setAnnouncement(await response.json()); setPolishedText(null); } }}>{template.name}</Button>)}</div><section className="space-y-3 rounded border border-border bg-card p-4"><Textarea rows={9} value={announcement?.text ?? ""} onChange={(e) => setAnnouncement(announcement ? { ...announcement, text: e.target.value } : null)} />{announcement?.warning && <p role="status" className="rounded border border-attention/50 bg-attention/10 p-3 text-sm text-attention">{announcement.warning}</p>}<div className="flex flex-wrap gap-2"><Button disabled={!announcement?.text} onClick={() => void navigator.clipboard.writeText(announcement!.text).then(() => toast.success("Announcement copied."))}><CopyIcon size={14} />{announcement?.warning ? "Copy anyway" : "Copy"}</Button>{canPolish && <Button variant="outline" disabled={!announcement?.text || polishing} onClick={() => void polishAnnouncement()}>{polishing ? "Polishing…" : "Polish with AI"}</Button>}</div></section></div>}
    {tab === "announcements" && polishedText !== null && <section className="grid gap-3 rounded border border-border bg-card p-4 md:grid-cols-2"><div><h2 className="mb-2 text-sm font-medium">Original</h2><p className="whitespace-pre-wrap text-sm text-muted-foreground">{announcement?.text}</p></div><div><h2 className="mb-2 text-sm font-medium">Polished preview</h2><p className="whitespace-pre-wrap text-sm">{polishedText}</p><div className="mt-3 flex gap-2"><Button size="sm" onClick={() => { setAnnouncement((current) => current ? { ...current, text: polishedText } : current); setPolishedText(null); }}>Accept</Button><Button size="sm" variant="outline" onClick={() => setPolishedText(null)}>Dismiss</Button></div></div></section>}
    {tab === "attendees" && <Input placeholder="Search attendees…" value={attendeeQuery} onChange={(event) => setAttendeeQuery(event.target.value)} />}
    {tab === "photos" && <section className="space-y-3"><Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(e) => { for (const file of Array.from(e.target.files ?? [])) void upload(file, `/api/events/${slug}/photos`); }} /><p className={`text-sm ${captionedPhotoCount >= 10 ? "text-green-500" : "text-muted-foreground"}`}>{captionedPhotoCount} / 10 photos with captions</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{records.map((photo) => <div key={photo.id} className="rounded border border-border bg-card p-2"><img src={`/api/files/${photo.id}/content`} alt={photo.caption ?? photo.originalName ?? "Event photo"} className="aspect-square w-full rounded object-cover" /><Input defaultValue={photo.caption ?? ""} placeholder="Caption" onBlur={(e) => void apiFetch(`/api/events/${slug}/photos/${photo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption: e.target.value || null }) })} /><Button size="sm" variant="ghost" onClick={async () => { const response = await apiFetch(`/api/events/${slug}/photos/${photo.id}`, { method: "DELETE" }); if (response.ok) { await load(); toastUndo("Photo deleted.", () => { void apiFetch(`/api/files/${photo.id}/restore`, { method: "POST" }).then(load); }); } }}>Delete</Button></div>)}</div></section>}
    {tab === "attendees" && <section className="space-y-3">
      <Input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setCsvFile(file); const form = new FormData(); form.append("file", file); const response = await apiFetch(`/api/events/${slug}/attendees/import`, { method: "POST", body: form }); if (response.ok) setCsvPreview(await response.json()); else toast.error("Could not preview CSV."); }} />
      {csvPreview && <div className="space-y-2 rounded border border-border bg-card p-3"><p className="text-sm">{csvPreview.rows.length} attendees · {csvPreview.skipped} skipped</p>{csvPreview.warnings.map((warning) => <p key={warning} className="text-xs text-attention">{warning}</p>)}<div className="max-h-40 overflow-auto text-xs">{csvPreview.rows.slice(0, 8).map((row, index) => <p key={`${row.email}-${index}`}>{row.name} · {row.email ?? "no email"} · {row.checkedIn ? "checked in" : "not checked in"}</p>)}</div><Button size="sm" disabled={!csvFile} onClick={async () => { const form = new FormData(); form.append("file", csvFile!); const response = await apiFetch(`/api/events/${slug}/attendees/import?commit=1`, { method: "POST", body: form }); if (response.ok) { setCsvPreview(null); setCsvFile(null); await load(); toast.success("Attendees imported."); } else toast.error("Could not import attendees."); }}>Import</Button></div>}
      <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const response = await apiFetch(`/api/events/${slug}/attendees`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newAttendee) }); if (response.ok) { setNewAttendee({ name: "", email: "" }); await load(); } }}><Input placeholder="Name" value={newAttendee.name} onChange={(e) => setNewAttendee({ ...newAttendee, name: e.target.value })} /><Input placeholder="Email" value={newAttendee.email} onChange={(e) => setNewAttendee({ ...newAttendee, email: e.target.value })} /><Button>Add attendee</Button></form>
      <div className="divide-y divide-border rounded border border-border">{records.map((person) => <div key={person.id} className="flex items-center gap-3 p-3"><span className="flex-1">{person.name} <span className="text-xs text-muted-foreground">{person.email}</span><span className="ml-2 text-xs text-muted-foreground">{ATTENDEE_SOURCE_LABELS[person.source ?? "manual"] ?? enumLabel(person.source ?? "manual")}</span></span><Button size="sm" variant="outline" onClick={() => void apiFetch(`/api/events/${slug}/attendees/${person.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkedIn: !person.checkedIn }) }).then(load)}>{person.checkedIn ? "Checked in" : "Check in"}</Button><Button size="sm" variant="ghost" onClick={async () => { const response = await apiFetch(`/api/events/${slug}/attendees/${person.id}`, { method: "DELETE" }); if (response.ok) { await load(); toastUndo("Attendee removed.", () => { void apiFetch(`/api/events/${slug}/attendees/${person.id}/restore`, { method: "POST" }).then(load); }); } }}>Remove</Button></div>)}</div></section>}
    {tab === "files" && <div className="divide-y divide-border rounded border border-border bg-card">{records.map((file) => <Link key={file.id} href={`/api/files/${file.id}/content`} className="flex p-3 hover:bg-secondary">{file.originalName}<span className="ml-auto text-xs text-muted-foreground">{fileKindLabel(file.kind ?? "", file.source)}{file.source && ` · ${FILE_SOURCE_LABELS[file.source] ?? enumLabel(file.source)}`} · {Math.ceil((file.size ?? 0) / 1024)} KB</span></Link>)}</div>}
  </div>;
}
