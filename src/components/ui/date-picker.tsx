"use client";

import { TZDate } from "@date-fns/tz";
import { addDays, format, getDay } from "date-fns";
import { CalendarIcon } from "@primer/octicons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MANILA_TIME_ZONE } from "@/lib/tasks/logic";

export function toManilaDueDate(day: Date): Date {
  const due = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), MANILA_TIME_ZONE);
  due.setHours(23, 59, 0, 0);
  return new Date(due.getTime());
}

function displayDate(value: Date): Date {
  const manila = new TZDate(value, MANILA_TIME_ZONE);
  return new Date(manila.getFullYear(), manila.getMonth(), manila.getDate(), 12);
}

function todayInManila(now = new Date()): Date {
  const manila = new TZDate(now, MANILA_TIME_ZONE);
  return new Date(manila.getFullYear(), manila.getMonth(), manila.getDate(), 12);
}

export function dateQuickPicks(now = new Date()) {
  const today = todayInManila(now);
  const nextMondayOffset = ((8 - getDay(today)) % 7) || 7;
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "Next Mon", date: addDays(today, nextMondayOffset) },
    { label: "+1 week", date: addDays(today, 7) },
  ];
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  ariaLabel = "Choose date",
}: {
  value: Date | null;
  onChange: (value: Date | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? displayDate(value) : undefined;
  const picks = dateQuickPicks();

  function select(day: Date | undefined) {
    if (!day) return;
    onChange(toManilaDueDate(day));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          aria-expanded={open}
          className="w-full justify-start text-left font-normal"
        >
          <CalendarIcon size={14} />
          <span className={value ? "" : "text-muted-foreground"}>{selected ? format(selected, "MMM d, yyyy") : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="single" selected={selected} onSelect={select} defaultMonth={selected ?? todayInManila()} />
        <div className="flex flex-wrap items-center gap-1 border-t border-border p-2">
          {picks.map((pick) => <Button key={pick.label} type="button" size="sm" variant="ghost" onClick={() => select(pick.date)}>{pick.label}</Button>)}
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => { onChange(null); setOpen(false); }}>Clear</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
