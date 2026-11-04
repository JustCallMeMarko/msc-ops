"use client";

import { toast } from "sonner";

export function toastUndo(message: string, onUndo: () => void) {
  toast(message, {
    duration: 8000,
    action: { label: "Undo", onClick: onUndo },
  });
}
