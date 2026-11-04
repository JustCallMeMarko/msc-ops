import type { ReactNode } from "react";

type LabelColor = "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "purple" | "pink";

export function Label({ children, tone = "neutral", color }: { children: ReactNode; tone?: "neutral" | "success" | "attention" | "danger" | "done"; color?: LabelColor }) {
  const tones = {
    neutral: "border-border bg-secondary text-foreground",
    success: "border-success/50 bg-success/10 text-success",
    attention: "border-attention/50 bg-attention/10 text-attention",
    danger: "border-destructive/50 bg-destructive/10 text-destructive",
    done: "border-done/50 bg-done/10 text-done",
  };
  const colors: Record<LabelColor, string> = {
    gray: tones.neutral,
    blue: "border-primary/50 bg-primary/10 text-primary",
    green: tones.success,
    yellow: tones.attention,
    orange: "border-orange-400/50 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    red: tones.danger,
    purple: "border-violet-400/50 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    pink: "border-pink-400/50 bg-pink-500/10 text-pink-700 dark:text-pink-300",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${color ? colors[color] : tones[tone]}`}>{children}</span>;
}
