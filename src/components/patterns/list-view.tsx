"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { CheckboxIcon, IssueOpenedIcon } from "@primer/octicons-react";
import { Counter } from "@/components/patterns/counter";
import { Label } from "@/components/patterns/label";
import { RelativeDate } from "@/components/patterns/relative-date";
import { Checkbox } from "@/components/ui/checkbox";
import { plural } from "@/lib/utils";

export type ListItem = {
  id: string;
  title: string;
  labels?: string[];
  due?: string;
  comments?: number;
  assignee?: string;
  closed?: boolean;
  href?: string;
};

function ItemRow({ item, selected, onToggle }: { item: ListItem; selected: boolean; onToggle: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-border px-4">
      <Checkbox aria-label={`Select ${item.title}`} checked={selected} onCheckedChange={onToggle} />
      {item.closed ? <CheckboxIcon size={16} className="text-done" /> : <IssueOpenedIcon size={16} className="text-success" />}
      <div className="min-w-0 flex-1">
        {item.href ? <Link href={item.href} className="truncate font-medium hover:text-primary">{item.title}</Link> : <div className="truncate font-medium">{item.title}</div>}
        {item.labels?.length ? <div className="mt-1 flex gap-1">{item.labels.map((label) => <Label key={label}>{label}</Label>)}</div> : null}
      </div>
      {item.due && <RelativeDate date={item.due} />}
      {item.assignee && <span aria-label={`Assigned to ${item.assignee}`} title={item.assignee} className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-medium">{item.assignee.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>}
      {item.comments !== undefined && <Counter value={item.comments} />}
    </div>
  );
}

export function ListView({ rows, bulkActions }: { rows: ListItem[]; bulkActions?: (ids: string[]) => React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("state") === "closed" ? "closed" : "open";
  const visibleRows = rows.filter((row) => Boolean(row.closed) === (status === "closed"));
  const [selected, setSelected] = useState<string[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleRows.length > 200 ? visibleRows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleAll = () => setSelected((current) => visibleRows.every((row) => current.includes(row.id)) ? current.filter((id) => !visibleRows.some((row) => row.id === id)) : [...new Set([...current, ...visibleRows.map((row) => row.id)])]);
  const setStatus = (nextStatus: "open" | "closed") => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextStatus === "open") params.delete("state");
    else params.set("state", nextStatus);
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
    setSelected([]);
  };
  return (
    <section className="overflow-hidden rounded-md border border-border">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Checkbox
          aria-label="Select all"
          checked={visibleRows.length > 0 && visibleRows.every((row) => selected.includes(row.id)) ? true : visibleRows.some((row) => selected.includes(row.id)) ? "indeterminate" : false}
          onCheckedChange={toggleAll}
        />
        <span className="font-medium">{plural(visibleRows.length, "item")}</span>
        {selected.length > 0 && bulkActions?.(selected)}
      </header>
      <nav className="flex gap-1 border-b border-border px-3 pt-2" aria-label="Issue status">
        {(["open", "closed"] as const).map((itemStatus) => {
          const count = rows.filter((row) => Boolean(row.closed) === (itemStatus === "closed")).length;
          return <button key={itemStatus} type="button" aria-current={status === itemStatus ? "page" : undefined} onClick={() => setStatus(itemStatus)} className={`rounded-t px-3 py-2 text-sm capitalize ${status === itemStatus ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}>{itemStatus} <span className="mono text-xs">{count}</span></button>;
        })}
      </nav>
      {visibleRows.length > 200 ? (
        <div ref={parentRef} className="max-h-[560px] overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = visibleRows[virtualRow.index];
              return (
                <div key={item.id} style={{ position: "absolute", top: 0, transform: `translateY(${virtualRow.start}px)`, width: "100%" }}>
                  <ItemRow item={item} selected={selected.includes(item.id)} onToggle={() => toggle(item.id)} />
                </div>
              );
            })}
          </div>
        </div>
      ) : visibleRows.map((item) => <ItemRow key={item.id} item={item} selected={selected.includes(item.id)} onToggle={() => toggle(item.id)} />)}
    </section>
  );
}
