import { EmptyState } from "@/components/patterns/empty-state";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

export function PlaceholderPage({ title, text = "This workspace area is coming soon." }: { title: string; text?: string }) {
  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">MSC Ops workspace</p></div>
        <EmptyState title="Coming soon" teachingText={text} />
      </div>
    </WorkspaceShell>
  );
}
