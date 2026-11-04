import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { EventDetailView } from "@/components/ops/events-view";

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <WorkspaceShell><div className="mx-auto max-w-6xl"><EventDetailView slug={slug} /></div></WorkspaceShell>;
}
