import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { EventsView } from "@/components/ops/events-view";

export default function EventsPage() {
  return <WorkspaceShell><div className="mx-auto max-w-6xl"><EventsView /></div></WorkspaceShell>;
}
