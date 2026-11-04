"use client";

export function RelativeDate({ date }: { date: Date | string }) {
  const value = new Date(date);
  // eslint-disable-next-line react-hooks/purity
  const diff = value.getTime() - Date.now();
  const days = Math.round(Math.abs(diff) / 86_400_000);
  const relative = days === 0 ? "today" : diff > 0 ? `in ${days}d` : `${days}d ago`;
  return <time className="mono text-xs text-muted-foreground" dateTime={value.toISOString()} title={value.toLocaleString()}>{relative}</time>;
}
