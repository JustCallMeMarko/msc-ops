"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";

type Rule = { id: string; key: string; label: string; offsetDays: number; dayType: "calendar" | "working"; anchor: "event_start" | "event_end"; source: string };
type Holiday = { id: string; date: string; name: string; kind: "regular" | "special" };
export function DeadlinesContent() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"regular" | "special">("regular");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [ruleResponse, holidayResponse] = await Promise.all([fetch("/api/deadline-rules"), fetch("/api/holidays")]);
    if (ruleResponse.ok) setRules(await ruleResponse.json());
    if (holidayResponse.ok) setHolidays(await holidayResponse.json());
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch remote deadline settings on mount.
  useEffect(() => { void load(); }, [load]);
  async function patch(rule: Rule) {
    const response = await apiFetch(`/api/deadline-rules/${rule.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: rule.label, offsetDays: rule.offsetDays, dayType: rule.dayType, anchor: rule.anchor, source: rule.source }) });
    if (!response.ok) toast.error("Could not update deadline rule.");
  }
  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate || !newName.trim()) return;
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(newDate);
    const response = await apiFetch("/api/holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, name: newName.trim(), kind: newKind }) });
    if (!response.ok) return toast.error("Could not add holiday.");
    setNewDate(null); setNewName(""); await load();
  }
  async function removeHoliday(holiday: Holiday) {
    const response = await apiFetch(`/api/holidays/${holiday.id}`, { method: "DELETE" });
    if (response.ok) { setHolidays((current) => current.filter((item) => item.id !== holiday.id)); toast.success(`${holiday.name} removed.`); }
  }
  if (loading) return <div className="h-64 animate-pulse rounded bg-secondary" />;
  return <div className="space-y-6">
    <section className="space-y-3 rounded-md border border-border bg-card p-4"><div><h2 className="font-semibold">Deadline rules</h2><p className="text-sm text-muted-foreground">Offsets and citations used by event checklists.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr>{["Rule","Label","Offset","Day type","Anchor","Source"].map((name) => <th className="p-2" key={name}>{name}</th>)}</tr></thead><tbody>{rules.map((rule) => <tr key={rule.id} className="border-t border-border"><td className="p-2 font-mono text-xs">{rule.key}</td><td className="p-2"><Input value={rule.label} onChange={(e) => setRules((rows) => rows.map((item) => item.id === rule.id ? { ...item, label: e.target.value } : item))} onBlur={() => void patch(rule)} /></td><td className="p-2"><Input type="number" className="w-24" value={rule.offsetDays} onChange={(e) => setRules((rows) => rows.map((item) => item.id === rule.id ? { ...item, offsetDays: Number(e.target.value) } : item))} onBlur={() => void patch(rule)} /></td><td className="p-2"><Select value={rule.dayType} onValueChange={(value) => { const updated = { ...rule, dayType: value as Rule["dayType"] }; setRules((rows) => rows.map((item) => item.id === rule.id ? updated : item)); void patch(updated); }}><SelectTrigger><span>{rule.dayType}</span></SelectTrigger><SelectContent><SelectItem value="calendar">Calendar</SelectItem><SelectItem value="working">Working</SelectItem></SelectContent></Select></td><td className="p-2"><Select value={rule.anchor} onValueChange={(value) => { const updated = { ...rule, anchor: value as Rule["anchor"] }; setRules((rows) => rows.map((item) => item.id === rule.id ? updated : item)); void patch(updated); }}><SelectTrigger><span>{rule.anchor.replace("event_", "")}</span></SelectTrigger><SelectContent><SelectItem value="event_start">Event start</SelectItem><SelectItem value="event_end">Event end</SelectItem></SelectContent></Select></td><td className="p-2"><Input value={rule.source} onChange={(e) => setRules((rows) => rows.map((item) => item.id === rule.id ? { ...item, source: e.target.value } : item))} onBlur={() => void patch(rule)} /></td></tr>)}</tbody></table></div>
    </section>
    <section className="space-y-3 rounded-md border border-border bg-card p-4"><div><h2 className="font-semibold">Philippine holidays</h2><p className="text-sm text-muted-foreground">Default list — check the yearly Proclamation.</p></div><form onSubmit={(e) => void addHoliday(e)} className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]"><DatePicker value={newDate} onChange={setNewDate} placeholder="Holiday date" /><Input placeholder="Holiday name" value={newName} onChange={(e) => setNewName(e.target.value)} /><Select value={newKind} onValueChange={(value) => setNewKind(value as Holiday["kind"])}><SelectTrigger><span>{newKind}</span></SelectTrigger><SelectContent><SelectItem value="regular">Regular</SelectItem><SelectItem value="special">Special</SelectItem></SelectContent></Select><Button disabled={!newDate || !newName.trim()}>Add holiday</Button></form>
      <div className="divide-y divide-border">{holidays.map((holiday) => <div key={holiday.id} className="flex items-center gap-3 py-2 text-sm"><span className="w-28 text-muted-foreground">{holiday.date}</span><span className="flex-1">{holiday.name}</span><span className="text-xs text-muted-foreground">{holiday.kind}</span><Button size="sm" variant="ghost" onClick={() => void removeHoliday(holiday)}>Remove</Button></div>)}</div>
    </section>
  </div>;
}
