import SetupWizard from "@/components/setup/setup-wizard";
import { getDataDir } from "@/lib/data-dir";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const dataDir = await getDataDir();
  return <SetupWizard dataDir={dataDir} />;
}
