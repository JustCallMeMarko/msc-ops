import {
  BlockedIcon,
  CheckCircleIcon,
  CircleIcon,
  CircleSlashIcon,
  DotFillIcon,
} from "@primer/octicons-react";
import { Label } from "@/components/patterns/label";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const PRIORITY_LABELS = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" } as const;

const statusColors: Record<TaskStatus, "gray" | "blue" | "yellow" | "green"> = {
  todo: "gray",
  in_progress: "blue",
  blocked: "yellow",
  done: "green",
  cancelled: "gray",
};

const statusIcons = {
  todo: CircleIcon,
  in_progress: DotFillIcon,
  blocked: BlockedIcon,
  done: CheckCircleIcon,
  cancelled: CircleSlashIcon,
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as TaskStatus] ?? status;
}

export function priorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] ?? priority;
}

export function StatusBadge({ status }: { status: string }) {
  const key = (status in STATUS_LABELS ? status : "todo") as TaskStatus;
  const Icon = statusIcons[key];
  return <Label color={statusColors[key]}><Icon size={12} /><span>{STATUS_LABELS[key]}</span></Label>;
}
