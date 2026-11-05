"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, addMonths, format, startOfMonth, startOfWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { CalendarIcon, ColumnsIcon, FileIcon, ImageIcon, ListUnorderedIcon, MegaphoneIcon, PlusIcon } from "@primer/octicons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { EmptyState } from "@/components/patterns/empty-state";
import { FilterBar } from "@/components/patterns/filter-bar";
import { Label, LABEL_COLOR_TOKENS } from "@/components/patterns/label";
import { toastUndo } from "@/components/patterns/toast-undo";
import { apiFetch } from "@/lib/api-client";
import { MANILA_TIME_ZONE } from "@/lib/tasks/logic";
import { POST_STATUSES, POST_TYPES } from "@/lib/creatives/logic";
import { POST_STATUS_LABELS, POST_TYPE_LABELS } from "@/lib/ui-labels";

type PostRow = {
  id: string; title: string; type: string; status: string; scheduledAt: string | null; updatedAt: string; scheduleOverridden: boolean;
  platforms: string[]; eventId: string | null; event: { id: string; name: string; slug: string } | null;
  canApprove?: { ok: boolean; missing: string[] };
};
const eventColors = ["border-l-[#d1d9e0] dark:border-l-[#484f58]", "border-l-[#54aeff] dark:border-l-[#1f6feb]", "border-l-[#4ac26b] dark:border-l-[#238636]", "border-l-[#d4a72c] dark:border-l-[#9e6a03]", "border-l-[#fb8f44] dark:border-l-[#db6d28]", "border-l-[#ff8182] dark:border-l-[#f85149]", "border-l-[#d8b9ff] dark:border-l-[#8957e5]", "border-l-[#ff80c8] dark:border-l-[#db61a2]"];
const eventLabelColors = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"] as const satisfies readonly (keyof typeof LABEL_COLOR_TOKENS)[];
const eventColor = (id: string) => [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % eventColors.length;
const statusColors: Record<string, "gray" | "blue" | "yellow" | "purple" | "orange" | "green" | "red"> = { idea: "gray", drafting: "blue", for_review: "yellow", approved: "purple", scheduled: "orange", posted: "green", cancelled: "red" };

export function CreativesView() {
  const router = useRouter();
  const params = useSearchParams();
  const [rows, setRows] = useState<PostRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("general");
  const [library, setLibrary] = useState<Record<string, Array<{ id: string; name?: string; postType?: string; body?: string; tags?: string[]; handles?: string[] }>>>({});
  const [orgAssets, setOrgAssets] = useState<Array<{ id: string; originalName: string; mime: string; size: number }>>([]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/creatives${next.size ? `?${next}` : ""}`);
  };
  const load = useCallback(async () => {
    const response = await fetch(`/api/posts?q=${encodeURIComponent(params.get("q") ?? "")}`);
    if (response.ok) setRows(await response.json());
    setBusy(false);
  }, [params]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the post calendar from the local API.
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (params.get("tab") !== "library") return;
    void Promise.all(["caption-templates", "hashtag-sets", "mention-lists"].map(async (key) => {
      const response = await fetch(`/api/${key}`);
      return [key, response.ok ? await response.json() : []] as const;
    })).then((entries) => setLibrary(Object.fromEntries(entries)));
    void fetch("/api/files?kind=creative&source=org").then((response) => response.json()).then((result: { files?: Array<{ id: string; originalName: string; mime: string; size: number }> }) => setOrgAssets(result.files ?? [])).catch(() => setOrgAssets([]));
  }, [params]);

  const view = params.get("view") === "board" || params.get("view") === "list" ? params.get("view")! : "calendar";
  const monthDate = params.get("month") && /^\d{4}-\d{2}$/.test(params.get("month")!)
    ? new Date(`${params.get("month")}-01T12:00:00+08:00`) : new Date();
  const range = params.get("range") === "week" ? "week" : "month";
  const weekAnchor = params.get("week") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("week")!)
    ? new Date(`${params.get("week")}T12:00:00+08:00`) : new Date();
  const month = new TZDate(range === "week" ? weekAnchor : monthDate, MANILA_TIME_ZONE);
  const days = range === "week"
    ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(month, { weekStartsOn: 1 }), index))
    : Array.from({ length: 42 }, (_, index) => addDays(startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), index));
  function moveCalendar(amount: number) {
    if (range === "week") setParam("week", format(addDays(month, amount * 7), "yyyy-MM-dd"));
    else setParam("month", format(addMonths(month, amount), "yyyy-MM"));
  }
  const filtered = useMemo(() => rows, [rows]);
  const byDay = new Map<string, PostRow[]>();
  for (const post of filtered) {
    if (!post.scheduledAt) continue;
    const key = format(new TZDate(post.scheduledAt, MANILA_TIME_ZONE), "yyyy-MM-dd");
    byDay.set(key, [...(byDay.get(key) ?? []), post]);
  }

  async function createPost(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const response = await apiFetch("/api/posts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), type }),
    });
    if (!response.ok) return toast.error("Could not create post.");
    const post = await response.json() as PostRow;
    router.push(`/creatives/${post.id}`);
  }

  async function movePost(post: PostRow, patch: { scheduledAt?: string | null; status?: string }) {
    if (patch.status === "approved" && !post.canApprove?.ok) {
      toast.error(`Cannot approve yet: ${post.canApprove?.missing.join(", ") ?? "requirements missing"}`);
      return;
    }
    const response = await apiFetch(`/api/posts/${post.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, expectedUpdatedAt: post.updatedAt }),
    });
    if (!response.ok) {
      if (response.status === 422) {
        const result = await response.json() as { missing?: string[] };
        toast.error(`Cannot approve yet: ${(result.missing ?? []).join(", ")}`);
      } else toast.error(response.status === 409 ? "Changed elsewhere — reload" : "Could not update post.");
      return;
    }
    const updated = await response.json() as PostRow;
    await load();
    toastUndo(patch.status ? `Moved to ${POST_STATUS_LABELS[patch.status]}.` : "Post rescheduled.", () => {
      void apiFetch(`/api/posts/${post.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: post.status, scheduledAt: post.scheduledAt, scheduleOverridden: post.scheduleOverridden, expectedUpdatedAt: updated.updatedAt }),
      }).then(() => load());
    });
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Posts</h1><p className="text-sm text-muted-foreground">Plan, review, and prepare posts for manual publishing.</p></div>
      <Button onClick={() => setCreating(!creating)}><PlusIcon size={14} />New post</Button>
    </div>
    {params.get("tab") !== "library" ? <div className="flex flex-wrap items-center gap-2"><div className="min-w-64 flex-1"><FilterBar placeholder="Filter posts… type: platform: status: event: owner: from: to:" /></div><Link href="/creatives?tab=library"><Button variant="outline">Library</Button></Link><div className="flex rounded-md border border-border bg-card p-0.5" role="group" aria-label="Creative view">{([{ value: "list", label: "List", Icon: ListUnorderedIcon }, { value: "board", label: "Board", Icon: ColumnsIcon }, { value: "calendar", label: "Calendar", Icon: CalendarIcon }]).map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setParam("view", value)} className={`inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs ${view === value ? "bg-secondary font-semibold" : "text-muted-foreground"}`}><Icon size={14} />{label}</button>)}</div></div> : <div className="flex justify-end"><Link href="/creatives"><Button variant="outline">Creative calendar</Button></Link></div>}
    {creating && <form onSubmit={(event) => void createPost(event)} className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_220px_auto]">
      <Input autoFocus placeholder="Post title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <Select value={type} onValueChange={setType}><SelectTrigger><span>{POST_TYPE_LABELS[type]}</span></SelectTrigger><SelectContent>{POST_TYPES.map((item) => <SelectItem key={item} value={item}>{POST_TYPE_LABELS[item]}</SelectItem>)}</SelectContent></Select>
      <Button disabled={!title.trim()}>Create post</Button>
    </form>}
    {params.get("tab") === "library" ? <div className="grid gap-4 md:grid-cols-3">
      {Object.entries(library).map(([key, values]) => <section key={key} className="rounded-md border border-border bg-card p-4"><h2 className="mb-3 font-semibold">{key === "caption-templates" ? "Caption templates" : key === "hashtag-sets" ? "Hashtag sets" : "Mention lists"}</h2>
        <div className="space-y-2">{values.map((item) => <article key={item.id} className="rounded border border-border p-3 text-sm"><strong>{item.name}</strong><p className="mt-1 text-xs text-muted-foreground">{item.body ?? item.tags?.join(" ") ?? item.handles?.join(" ")}</p></article>)}</div>
      </section>)}
      <section className="rounded-md border border-border bg-card p-4"><h2 className="font-semibold">Organization assets</h2><div className="mt-3 space-y-2">{orgAssets.map((asset) => <a key={asset.id} href={`/api/files/${asset.id}/content`} className="flex items-center gap-2 rounded border border-border p-2 text-xs hover:bg-secondary">{asset.mime.startsWith("image/") ? <Image src={`/api/files/${asset.id}/content`} alt="" width={32} height={32} unoptimized className="size-8 rounded object-cover" /> : <FileIcon size={16} className="text-muted-foreground" />}<span className="min-w-0 flex-1 truncate">{asset.originalName}</span><span className="text-muted-foreground">{Math.ceil(asset.size / 1024)} KB</span></a>)}{!orgAssets.length && <p className="text-sm text-muted-foreground">Upload logos, frames, and fonts in Brand Kit.</p>}</div><Link className="mt-3 inline-block text-sm text-primary underline" href="/settings/brand-kit">Open Brand Kit</Link></section>
    </div> : busy ? <div className="grid gap-3 md:grid-cols-3" aria-label="Loading creatives">{[0,1,2,3,4,5].map((item) => <div key={item} className="h-24 animate-pulse rounded border border-border bg-card" />)}</div>
      : view === "calendar" ? <section className="space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => moveCalendar(-1)}>Previous</Button><h2 className="self-center font-semibold">{range === "week" ? `${format(days[0], "MMM d")} – ${format(days[6], "MMM d, yyyy")}` : format(month, "MMMM yyyy")}</h2><Button size="sm" variant="outline" onClick={() => moveCalendar(1)}>Next</Button></div><div className="flex gap-1"><Button size="sm" variant={range === "month" ? "default" : "outline"} onClick={() => setParam("range", "month")}>Month</Button><Button size="sm" variant={range === "week" ? "default" : "outline"} onClick={() => setParam("range", "week")}>Week</Button></div></header>
        <div className="flex flex-wrap gap-2" aria-label="Event legend">{[...new Map(filtered.filter((post) => post.event).map((post) => [post.event!.id, post.event!])).values()].map((event) => <Label key={event.id} color={eventLabelColors[eventColor(event.id)]}><span className="size-2 rounded-full bg-current" />{event.name}</Label>)}</div>
        <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded border border-border bg-card">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((weekday) => <div key={weekday} className="border-b border-border p-2 text-xs font-medium text-muted-foreground">{weekday}</div>)}
          {days.map((date) => { const key = format(date, "yyyy-MM-dd"); const dayPosts = byDay.get(key) ?? []; return <div key={key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const post = filtered.find((item) => item.id === event.dataTransfer.getData("post-id")); if (!post) return; const scheduled = new TZDate(post.scheduledAt ? new Date(post.scheduledAt) : date, MANILA_TIME_ZONE); scheduled.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); void movePost(post, { scheduledAt: new Date(scheduled).toISOString() }); }} className={`min-h-28 border-b border-r border-border p-2 ${date.getMonth() === month.getMonth() ? "" : "bg-secondary/30 text-muted-foreground"}`}><span className="text-xs">{format(date, "d")}</span><div className="mt-1 space-y-1">{dayPosts.map((post) => { const TypeIcon = post.type === "poster" || post.type === "highlight" || post.type === "speaker_reveal" ? ImageIcon : MegaphoneIcon; return <article key={post.id} draggable onDragStart={(event) => event.dataTransfer.setData("post-id", post.id)} className={`rounded border border-border border-l-4 bg-card px-1.5 py-1 text-xs ${post.eventId ? eventColors[eventColor(post.eventId)] : ""}`}><Link href={`/creatives/${post.id}`} className="flex min-w-0 items-center gap-1 truncate font-medium"><TypeIcon size={12} /><span className="truncate">{post.title}</span></Link><Label color={statusColors[post.status] ?? "gray"}>{POST_STATUS_LABELS[post.status]}</Label></article>; })}</div></div>; })}
        </div>
      </section> : view === "board" ? <div className="grid gap-3 xl:grid-cols-7">{POST_STATUSES.map((status) => <section key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const post = filtered.find((item) => item.id === event.dataTransfer.getData("post-id")); if (post && post.status !== status) void movePost(post, { status }); }} className="min-h-48 rounded-md border border-border bg-secondary/30 p-3"><h2 className="mb-3 text-sm font-semibold">{POST_STATUS_LABELS[status]}</h2><div className="space-y-2">{filtered.filter((post) => post.status === status).map((post) => <article key={post.id} draggable onDragStart={(event) => event.dataTransfer.setData("post-id", post.id)} title={status === "approved" && post.canApprove?.missing.length ? `Missing: ${post.canApprove.missing.join(", ")}` : undefined} className="rounded border border-border bg-card p-3 text-sm"><Link href={`/creatives/${post.id}`} className="font-medium hover:text-primary">{post.title}</Link><p className="mt-1 text-xs text-muted-foreground">{post.event?.name ?? POST_TYPE_LABELS[post.type]}</p></article>)}</div></section>)}</div>
        : filtered.length ? <div className="divide-y divide-border rounded-md border border-border bg-card">{filtered.map((post) => <Link key={post.id} href={`/creatives/${post.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-secondary/40"><span className="min-w-0 flex-1 font-medium">{post.title}</span><span className="text-xs text-muted-foreground">{post.event?.name ?? POST_TYPE_LABELS[post.type]}</span><span className="rounded border border-border px-2 py-1 text-xs">{POST_STATUS_LABELS[post.status]}</span><span className="text-xs text-muted-foreground">{post.scheduledAt ? format(new TZDate(post.scheduledAt, MANILA_TIME_ZONE), "MMM d, h:mm a") : "Unscheduled"}</span></Link>)}</div> : <EmptyState title="No posts yet" teachingText="Generate a schedule from an event or create a post to get started." />}
  </div>;
}
