import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  teachingText,
  action,
}: {
  icon?: ReactNode;
  title: string;
  teachingText: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-border px-6 py-12 text-center">
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{teachingText}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
