import { Suspense } from "react";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { PostDetailView } from "@/components/ops/post-detail-view";
export default function PostDetailPage() {
  return <WorkspaceShell><div className="mx-auto max-w-7xl"><Suspense fallback={<div className="h-80 animate-pulse rounded border border-border bg-card" />}><PostDetailView /></Suspense></div></WorkspaceShell>;
}
