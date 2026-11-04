import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { EventDetailView } from "@/components/ops/events-view";
import { getDb } from "@/lib/db/client";
import { eventByRef } from "@/lib/events/db-utils";

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db } = await getDb();
  const event = await eventByRef(db, slug);
  return <WorkspaceShell breadcrumbLabel={event?.name ?? slug}><div className="mx-auto max-w-6xl"><EventDetailView slug={slug} /></div></WorkspaceShell>;
}
