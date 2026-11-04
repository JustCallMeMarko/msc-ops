import Link from "next/link";
import { InboxIcon } from "@primer/octicons-react";
import { EmptyState } from "@/components/patterns/empty-state";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { Button } from "@/components/ui/button";
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
        <div><h1 className="text-2xl font-semibold">Inbox</h1><p className="mt-1 text-sm text-muted-foreground">Your daily triage for work that needs attention.</p></div>
        <EmptyState
          icon={<InboxIcon size={28} />}
          title="You’re all caught up"
          teachingText="Tasks, approvals, upcoming deadlines, and follow-ups will show up here when those modules are available."
          action={<Link href="/overview"><Button variant="outline">Go to overview</Button></Link>}
        />
      </div>
    </WorkspaceShell>
  );
}
