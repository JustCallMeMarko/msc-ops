"use client";

import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays } from "date-fns";
import { MANILA_TIME_ZONE } from "@/lib/tasks/logic";

export function RelativeDate({ date }: { date: Date | string }) {
  const value = new Date(date);
  // eslint-disable-next-line react-hooks/purity
  const days = differenceInCalendarDays(new TZDate(value, MANILA_TIME_ZONE), new TZDate(Date.now(), MANILA_TIME_ZONE));
  const relative = days === 0 ? "today" : days > 0 ? `in ${days}d` : `${Math.abs(days)}d ago`;
  return <time className="mono text-xs text-muted-foreground" dateTime={value.toISOString()} title={value.toLocaleString()}>{relative}</time>;
}
