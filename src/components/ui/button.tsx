import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Button({
  variant = "default",
  size = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger";
  size?: "default" | "sm" | "icon";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[6px] border font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
        variant === "default" && "border-primary bg-primary text-white hover:brightness-110",
        variant === "outline" && "border-border bg-transparent text-foreground hover:bg-secondary",
        variant === "ghost" && "border-transparent bg-transparent text-foreground hover:bg-secondary",
        variant === "danger" && "border-destructive bg-destructive text-white hover:brightness-110",
        size === "default" && "min-h-9 px-3 text-sm",
        size === "sm" && "min-h-8 px-2.5 text-xs",
        size === "icon" && "size-9",
        className,
      )}
      {...props}
    />
  );
}
