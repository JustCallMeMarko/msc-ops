"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { EmptyState } from "@/components/patterns/empty-state";
import { RelativeDate } from "@/components/patterns/relative-date";
import { toastUndo } from "@/components/patterns/toast-undo";
import { apiFetch } from "@/lib/api-client";
import { plural } from "@/lib/utils";

type Committee = {
  id: string; name: string; slug: string; description: string; color: string; defaultCheckinDays: number;
  headMemberId?: string | null;
  counts: { open: number; overdue: number; checkinsDue: number };
  lastReply: { at: string; body: string } | null;
};
type Digest = { committee: Committee; digest: string };

function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export function CommitteesView() {
  const router = useRouter();
  const params = useSearchParams();
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [digests, setDigests] = useState<Digest[]>([]);
  const [name, setName] = useState("");
  const creating = params.get("new") === "1";
  const [loading, setLoading] = useState(true);
  const digestMode = params.get("digest") === "1";
  const fetchData = useCallback(async () => {
    const response = await fetch("/api/committees");
    const loadedCommittees = response.ok ? await response.json() as Committee[] : [];
    let loadedDigests: Digest[] = [];
    if (digestMode) {
      const digestResponse = await fetch("/api/digest");
      if (digestResponse.ok) loadedDigests = await digestResponse.json() as Digest[];
    }
    return { committees: loadedCommittees, digests: loadedDigests };
  }, [digestMode]);
  const load = useCallback(async () => {
    const result = await fetchData();
    setCommittees(result.committees);
    setDigests(result.digests);
    setLoading(false);
  }, [fetchData]);
  useEffect(() => {
    let active = true;
    void fetchData().then((result) => {
      if (!active) return;
      setCommittees(result.committees);
      setDigests(result.digests);
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchData]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const response = await apiFetch("/api/committees", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slug: slugify(name), color: "blue", description: "" }),
    });
    if (!response.ok) return toast.error("Could not create committee.");
    const committee = await response.json() as Committee;
    setName(""); router.replace("/committees");
    await load(); toast.success(`${committee.name} created.`);
  }

  async function remove(committee: Committee) {
    const response = await apiFetch(`/api/committees/${committee.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not archive committee.");
    await load();
    toastUndo(`${committee.name} archived.`, () => {
      void apiFetch(`/api/committees/${committee.id}/restore`, { method: "POST" }).then(load);
    });
  }

  if (loading) return <div className="grid gap-3 md:grid-cols-2" aria-label="Loading committees">{[0, 1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-md bg-secondary" />)}</div>;
  if (digestMode) return <div className="space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Morning digest</h2><Button variant="outline" onClick={() => router.replace("/committees")}>Back to committees</Button></div>
    {digests.map(({ committee, digest }) => <section key={committee.id} className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{committee.name}</h3><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(digest).then(() => toast.success(`${committee.name} digest copied.`))}>Copy</Button></div>
      <pre className="whitespace-pre-wrap font-sans text-sm">{digest}</pre>
    </section>)}
  </div>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Keep committee contacts, cadence, and task progress together.</p><div className="flex gap-2"><Button variant="outline" onClick={() => router.push("/committees?digest=1")}>Morning digest</Button><Button onClick={() => router.push("/committees?new=1")}>New committee</Button></div></div>
    {creating && <form onSubmit={(event) => void create(event)} className="flex gap-2 rounded-md border border-border bg-card p-3"><Input autoFocus placeholder="Committee name…" value={name} onChange={(event) => setName(event.target.value)} /><Button disabled={!name.trim()}>Create committee</Button></form>}
    {committees.length ? <div className="grid gap-3 md:grid-cols-2">{committees.map((committee) => <article key={committee.id} className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3"><div className="space-y-1"><Link href={`/committees/${committee.slug}`} className="text-lg font-semibold hover:text-primary">{committee.name}</Link><p className="text-xs text-muted-foreground">Every {committee.defaultCheckinDays} days</p></div><Button size="sm" variant="ghost" onClick={() => void remove(committee)}>Archive</Button></div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm"><span>{plural(committee.counts.open, "open task")}</span><span className="text-attention">{plural(committee.counts.overdue, "overdue task")}</span><span>{plural(committee.counts.checkinsDue, "check-in")} due</span></div>
      <p className="mt-3 line-clamp-1 text-xs text-muted-foreground">{committee.lastReply ? <>Last reply <RelativeDate date={committee.lastReply.at} /> · {committee.lastReply.body}</> : "No replies logged yet"}</p>
    </article>)}</div> : <EmptyState title="No committees yet" teachingText="Add your first committee to organize members, task ownership, and check-in cadence." />}
  </div>;
}

export function CommitteeDetailView({ slug }: { slug: string }) {
  const [committee, setCommittee] = useState<Committee | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; name: string; role: string; contact: string; email: string | null }>>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; number: number; title: string; status: string; dueAt: string | null }>>([]);
  const [newName, setNewName] = useState(""); const [newRole, setNewRole] = useState(""); const [newContact, setNewContact] = useState("");
  const [loading, setLoading] = useState(true);
  const fetchData = useCallback(async () => {
    const listResponse = await fetch("/api/committees");
    const list = listResponse.ok ? await listResponse.json() as Committee[] : [];
    const found = list.find((item) => item.slug === slug) ?? null;
    let loadedMembers: Array<{ id: string; name: string; role: string; contact: string; email: string | null }> = [];
    let loadedTasks: Array<{ id: string; number: number; title: string; status: string; dueAt: string | null }> = [];
    if (found) {
      const [memberResponse, taskResponse] = await Promise.all([fetch(`/api/members?committee=${found.id}`), fetch(`/api/tasks?q=${encodeURIComponent(`committee:${slug}`)}`)]);
      if (memberResponse.ok) loadedMembers = await memberResponse.json();
      if (taskResponse.ok) loadedTasks = await taskResponse.json();
    }
    return { committee: found, members: loadedMembers, tasks: loadedTasks };
  }, [slug]);
  const load = useCallback(async () => {
    const result = await fetchData();
    setCommittee(result.committee);
    setMembers(result.members);
    setTasks(result.tasks);
    setLoading(false);
  }, [fetchData]);
  useEffect(() => {
    let active = true;
    void fetchData().then((result) => {
      if (!active) return;
      setCommittee(result.committee);
      setMembers(result.members);
      setTasks(result.tasks);
      setLoading(false);
    });
    return () => { active = false; };
  }, [fetchData]);

  async function updateCommittee(values: Record<string, unknown>) {
    if (!committee) return;
    const response = await apiFetch(`/api/committees/${committee.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    if (!response.ok) return toast.error("Could not update committee.");
    await load();
  }
  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (!committee || !newName.trim()) return;
    const response = await apiFetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim(), role: newRole, contact: newContact, committeeId: committee.id }) });
    if (!response.ok) return toast.error("Could not add member.");
    setNewName(""); setNewRole(""); setNewContact(""); await load();
  }
  async function updateMember(memberId: string, values: Record<string, unknown>) {
    const response = await apiFetch(`/api/members/${memberId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    if (!response.ok) toast.error("Could not update member.");
    else await load();
  }
  if (loading) return <div className="h-72 animate-pulse rounded bg-secondary" />;
  if (!committee) return <EmptyState title="Committee not found" teachingText="It may have been archived or the link may be incorrect." />;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href="/committees" className="text-sm text-muted-foreground hover:text-primary">Committees</Link><h1 className="mt-1 text-2xl font-semibold">{committee.name}</h1></div><Button variant="outline" onClick={async () => { const response = await fetch(`/api/digest?committee=${committee.slug}`); const result = await response.json() as Digest; await navigator.clipboard.writeText(result.digest); toast.success("Committee digest copied."); }}>Morning digest</Button></div>
    <section className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_180px]">
      <label className="space-y-1 text-xs text-muted-foreground">Description<Textarea value={committee.description} onChange={(event) => setCommittee({ ...committee, description: event.target.value })} onBlur={() => void updateCommittee({ description: committee.description })} /></label>
      <div className="space-y-3"><label className="block space-y-1 text-xs text-muted-foreground">Default check-in cadence (days)<Input type="number" min={1} value={committee.defaultCheckinDays} onChange={(event) => setCommittee({ ...committee, defaultCheckinDays: Number(event.target.value) })} onBlur={() => void updateCommittee({ defaultCheckinDays: committee.defaultCheckinDays })} /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Committee head<Select value={committee.headMemberId ?? "none"} onValueChange={(value) => void updateCommittee({ headMemberId: value === "none" ? null : value })}><SelectTrigger><span>{members.find((member) => member.id === committee.headMemberId)?.name ?? "No head selected"}</span></SelectTrigger><SelectContent><SelectItem value="none">No head selected</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></label>
      </div>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Members</h2><div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-left text-sm"><thead className="bg-card text-xs uppercase text-muted-foreground"><tr>{["Name", "Role", "Contact", "Actions"].map((item) => <th key={item} className="p-3">{item}</th>)}</tr></thead><tbody>{members.map((member) => <tr key={member.id} className="border-t border-border"><td className="p-2"><Input defaultValue={member.name} onBlur={(event) => event.target.value !== member.name && void updateMember(member.id, { name: event.target.value })} /></td><td className="p-2"><Input defaultValue={member.role} onBlur={(event) => event.target.value !== member.role && void updateMember(member.id, { role: event.target.value })} /></td><td className="p-2"><Input defaultValue={member.contact} onBlur={(event) => event.target.value !== member.contact && void updateMember(member.id, { contact: event.target.value })} /></td><td className="p-2"><Button size="sm" variant="ghost" onClick={async () => { const response = await apiFetch(`/api/members/${member.id}`, { method: "DELETE" }); if (response.ok) { await load(); toastUndo(`${member.name} removed.`, () => { void apiFetch(`/api/members/${member.id}/restore`, { method: "POST" }).then(load); }); } }}>Remove</Button></td></tr>)}</tbody></table></div>
      <form onSubmit={(event) => void addMember(event)} className="grid gap-2 md:grid-cols-4"><Input placeholder="Member name" value={newName} onChange={(event) => setNewName(event.target.value)} /><Input placeholder="Role" value={newRole} onChange={(event) => setNewRole(event.target.value)} /><Input placeholder="Contact / handle" value={newContact} onChange={(event) => setNewContact(event.target.value)} /><Button disabled={!newName.trim()}>Add member</Button></form>
    </section>
    <section><h2 className="mb-3 font-semibold">Tasks</h2><div className="divide-y divide-border rounded-md border border-border bg-card">{tasks.map((task) => <Link key={task.id} href={`/tasks/${task.number}`} className="flex items-center gap-3 p-3 hover:bg-secondary"><span className="mono text-xs text-muted-foreground">#{task.number}</span><span className="flex-1">{task.title}</span><span className="text-xs text-muted-foreground">{task.status.replace("_", " ")}</span>{task.dueAt && <RelativeDate date={task.dueAt} />}</Link>)}{!tasks.length && <p className="p-4 text-sm text-muted-foreground">No tasks for this committee.</p>}</div></section>
  </div>;
}
