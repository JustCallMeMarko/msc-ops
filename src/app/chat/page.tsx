import { GeneralChat } from "@/components/chat/general-chat";
import { WorkspaceShell } from "@/components/shell/workspace-shell";

export default function ChatPage() {
  return <WorkspaceShell><div className="mx-auto max-w-7xl"><h1 className="mb-4 text-2xl font-semibold">General chat</h1><GeneralChat /></div></WorkspaceShell>;
}
