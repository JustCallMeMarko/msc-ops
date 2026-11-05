import { OverviewView } from "@/components/ops/overview-view";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
export default function OverviewPage() { return <WorkspaceShell><section className="space-y-4"><header><h1 className="text-2xl font-semibold">Overview</h1><p className="text-sm text-muted-foreground">What needs you, finance at a glance, and committee progress.</p></header><OverviewView /></section></WorkspaceShell>; }
