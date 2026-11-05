import { TasksView } from "@/components/ops/tasks-view";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
export default function TasksPage() { return <WorkspaceShell><section className="space-y-4"><header><h1 className="text-2xl font-semibold">Tasks</h1><p className="text-sm text-muted-foreground">Filter, assign, and move committee work forward.</p></header><TasksView /></section></WorkspaceShell>; }
