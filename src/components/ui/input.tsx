import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      className={cn(
        "h-9 w-full rounded-[6px] border border-input bg-background px-3 text-foreground placeholder:text-muted-foreground",
        className,
      )}
      {...rest}
    />
  );
}
