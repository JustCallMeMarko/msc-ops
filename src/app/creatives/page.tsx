import { Suspense } from "react";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { CreativesView } from "@/components/ops/creatives-view";
export default function CreativesPage() {
  return <WorkspaceShell><div className="mx-auto max-w-7xl"><Suspense fallback={<div className="h-64 animate-pulse rounded border border-border bg-card" />}><CreativesView /></Suspense></div></WorkspaceShell>;
}
