import { CommitteeDetailView } from "@/components/ops/committees-view";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

type Props = { params: Promise<{ slug: string }> };

export default async function CommitteePage({ params }: Props) {
  const { slug } = await params;
  return <WorkspaceShell><CommitteeDetailView slug={slug} /></WorkspaceShell>;
}
