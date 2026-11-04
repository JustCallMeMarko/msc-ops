import type { ReactNode } from "react";

type LabelColor = "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "purple" | "pink";

export const LABEL_COLOR_TOKENS = {
  gray: {
    light: { fg: "#59636e", bg: "#eaeef2", border: "#d1d9e0" },
    dark: { fg: "#c9d1d9", bg: "#30363d", border: "#484f58" },
  },
  blue: {
    light: { fg: "#0969da", bg: "#ddf4ff", border: "#54aeff" },
    dark: { fg: "#79c0ff", bg: "#0c2d6b", border: "#1f6feb" },
  },
  green: {
    light: { fg: "#1a7f37", bg: "#dafbe1", border: "#4ac26b" },
    dark: { fg: "#56d364", bg: "#033a16", border: "#238636" },
  },
  yellow: {
    light: { fg: "#9a6700", bg: "#fff8c5", border: "#d4a72c" },
    dark: { fg: "#e3b341", bg: "#341a00", border: "#9e6a03" },
  },
  orange: {
    light: { fg: "#bc4c00", bg: "#fff1e5", border: "#fb8f44" },
    dark: { fg: "#f0883e", bg: "#3d1300", border: "#db6d28" },
  },
  red: {
    light: { fg: "#d1242f", bg: "#ffebe9", border: "#ff8182" },
    dark: { fg: "#ff7b72", bg: "#490202", border: "#f85149" },
  },
  purple: {
    light: { fg: "#8250df", bg: "#fbefff", border: "#d8b9ff" },
    dark: { fg: "#d2a8ff", bg: "#271447", border: "#8957e5" },
  },
  pink: {
    light: { fg: "#bf3989", bg: "#ffeff7", border: "#ff80c8" },
    dark: { fg: "#ff9bce", bg: "#42062a", border: "#db61a2" },
  },
} as const;

export function Label({ children, tone = "neutral", color }: { children: ReactNode; tone?: "neutral" | "success" | "attention" | "danger" | "done"; color?: LabelColor }) {
  const tones = {
    neutral: "border-border bg-secondary text-foreground",
    success: "border-success/50 bg-success/10 text-success",
    attention: "border-attention/50 bg-attention/10 text-attention",
    danger: "border-destructive/50 bg-destructive/10 text-destructive",
    done: "border-done/50 bg-done/10 text-done",
  };
  const colors: Record<LabelColor, string> = {
    gray: "border-[#d1d9e0] bg-[#eaeef2] text-[#59636e] dark:border-[#484f58] dark:bg-[#30363d] dark:text-[#c9d1d9]",
    blue: "border-[#54aeff] bg-[#ddf4ff] text-[#0969da] dark:border-[#1f6feb] dark:bg-[#0c2d6b] dark:text-[#79c0ff]",
    green: "border-[#4ac26b] bg-[#dafbe1] text-[#1a7f37] dark:border-[#238636] dark:bg-[#033a16] dark:text-[#56d364]",
    yellow: "border-[#d4a72c] bg-[#fff8c5] text-[#9a6700] dark:border-[#9e6a03] dark:bg-[#341a00] dark:text-[#e3b341]",
    orange: "border-[#fb8f44] bg-[#fff1e5] text-[#bc4c00] dark:border-[#db6d28] dark:bg-[#3d1300] dark:text-[#f0883e]",
    red: "border-[#ff8182] bg-[#ffebe9] text-[#d1242f] dark:border-[#f85149] dark:bg-[#490202] dark:text-[#ff7b72]",
    purple: "border-[#d8b9ff] bg-[#fbefff] text-[#8250df] dark:border-[#8957e5] dark:bg-[#271447] dark:text-[#d2a8ff]",
    pink: "border-[#ff80c8] bg-[#ffeff7] text-[#bf3989] dark:border-[#db61a2] dark:bg-[#42062a] dark:text-[#ff9bce]",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${color ? colors[color] : tones[tone]}`}>{children}</span>;
}
