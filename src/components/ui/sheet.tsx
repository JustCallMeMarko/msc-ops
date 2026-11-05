"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "@primer/octicons-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "left" | "right" }
>(({ className, side = "right", children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
    <DialogPrimitive.Content ref={ref} className={cn("fixed inset-y-0 z-50 flex w-full max-w-xl flex-col gap-4 overflow-y-auto border-border bg-background p-6 shadow-xl", side === "right" ? "right-0 border-l" : "left-0 border-r", className)} {...props}>
      {children}
      <DialogPrimitive.Close aria-label="Close" className="absolute right-4 top-4 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><XIcon size={16} /></DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

export const SheetHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn("space-y-1.5", className)} {...props} />;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
