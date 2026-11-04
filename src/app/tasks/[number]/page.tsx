import { TaskDetailView } from "@/components/ops/task-detail-view";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

type Props = { params: Promise<{ number: string }> };

export default async function TaskPage({ params }: Props) {
  const { number } = await params;
  return <WorkspaceShell><TaskDetailView number={number} /></WorkspaceShell>;
}
