import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { FilesView } from "@/components/ops/files-view";

export default function FilesPage() {
  return <WorkspaceShell><div className="mx-auto max-w-6xl"><FilesView /></div></WorkspaceShell>;
}
