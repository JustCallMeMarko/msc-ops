import { and, eq, isNull } from "drizzle-orm";
import { Suspense } from "react";
import { getDb } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { PostDetailView } from "@/components/ops/post-detail-view";
export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await getDb();
  const [post] = await db.select({ title: posts.title }).from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  return <WorkspaceShell breadcrumbLabel={post?.title ?? id}><div className="mx-auto max-w-7xl"><Suspense fallback={<div className="h-80 animate-pulse rounded border border-border bg-card" />}><PostDetailView /></Suspense></div></WorkspaceShell>;
}
