import { Suspense } from "react";
import { CommitteesView } from "@/components/ops/committees-view";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

export default function CommitteesPage() {
  return <WorkspaceShell><section className="space-y-4"><header><h1 className="text-2xl font-semibold">Committees</h1></header><Suspense fallback={<div className="h-48 animate-pulse rounded bg-secondary" />}><CommitteesView /></Suspense></section></WorkspaceShell>;
}
