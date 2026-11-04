"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon } from "@primer/octicons-react";
import type { ComponentProps } from "react";

export function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props} />;
}

export function SelectTrigger({ className = "", ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={`inline-flex h-9 w-full items-center justify-between gap-2 rounded-[6px] border border-input bg-background px-3 text-left text-sm text-foreground ${className}`}
      {...props}
    >
      {props.children}
      <SelectPrimitive.Icon><ChevronDownIcon size={16} /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent(props: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className="z-50 max-h-80 min-w-32 overflow-hidden rounded-[6px] border border-border bg-popover text-popover-foreground shadow-lg"
        position="popper"
        {...props}
      />
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className="relative flex cursor-pointer select-none items-center rounded px-8 py-2 text-sm outline-none data-[highlighted]:bg-secondary"
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute left-2">
        <CheckIcon size={14} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
