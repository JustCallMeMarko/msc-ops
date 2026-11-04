import { notFound } from "next/navigation";
import { SettingsContent } from "@/components/settings/settings-content";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { getDataDir } from "@/lib/data-dir";

const allowed = new Set(["general", "ai", "privacy", "about"]);

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!allowed.has(section)) notFound();
  const dataDir = await getDataDir();
  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div><h1 className="text-2xl font-semibold">Settings</h1><p className="mt-1 text-sm text-muted-foreground">Manage your local workspace, AI providers, and privacy controls.</p></div>
        <SettingsContent section={section} dataDir={dataDir} />
      </div>
    </WorkspaceShell>
  );
}
