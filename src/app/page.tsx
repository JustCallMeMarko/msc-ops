import { InboxView } from "@/components/ops/inbox-view";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { getSetting } from "@/lib/settings";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const completed = await getSetting("setup.completed").catch(() => null);
  if (completed === null) redirect("/recovery");
  if (!completed) redirect("/setup");
  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div><h1 className="text-2xl font-semibold">Needs you</h1><p className="mt-1 text-sm text-muted-foreground">The check-ins and deadlines that need your attention today.</p></div>
        <InboxView />
      </div>
    </WorkspaceShell>
  );
}
