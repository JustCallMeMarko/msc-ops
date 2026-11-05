import Link from "next/link";
import { GeneralChat } from "@/components/chat/general-chat";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

export default function ChatPage() {
  return <WorkspaceShell><div className="mx-auto max-w-7xl"><div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-semibold">General chat</h1><Link href="/cbl" className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Document library →</Link></div><GeneralChat /></div></WorkspaceShell>;
}
