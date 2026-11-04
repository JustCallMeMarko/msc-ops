import type { ReactNode } from "react";

export function Label({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "attention" | "danger" | "done" }) {
  const tones = {
    neutral: "border-border bg-secondary text-foreground",
    success: "border-success/50 bg-success/10 text-success",
    attention: "border-attention/50 bg-attention/10 text-attention",
    danger: "border-destructive/50 bg-destructive/10 text-destructive",
    done: "border-done/50 bg-done/10 text-done",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}
