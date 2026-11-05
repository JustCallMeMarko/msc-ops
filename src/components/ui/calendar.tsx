"use client";

import { DayPicker } from "react-day-picker";
import type { ComponentProps } from "react";

export function Calendar({ className = "", classNames, ...props }: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      className={`p-3 ${className}`}
      classNames={{
        ...classNames,
        month: "space-y-3",
        month_caption: "relative flex h-8 items-center justify-center",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous: "absolute left-2 top-0 inline-flex size-8 items-center justify-center rounded hover:bg-secondary",
        button_next: "absolute right-2 top-0 inline-flex size-8 items-center justify-center rounded hover:bg-secondary",
        weekday: "w-9 py-2 text-center text-xs font-normal text-muted-foreground",
        day: "size-9 text-center",
        day_button: "inline-flex size-9 items-center justify-center rounded text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring",
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        today: "[&>button]:border [&>button]:border-primary",
        outside: "[&>button]:text-muted-foreground [&>button]:opacity-50",
        disabled: "[&>button]:pointer-events-none [&>button]:opacity-40",
      }}
      {...props}
    />
  );
}
