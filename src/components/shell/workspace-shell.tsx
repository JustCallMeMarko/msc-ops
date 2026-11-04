"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { CommentDiscussionIcon } from "@primer/octicons-react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { Topbar } from "@/components/shell/topbar";

function ShellContent({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const panelOpen = searchParams.get("panel") === "chat";
  const togglePanel = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (panelOpen) params.delete("panel");
    else params.set("panel", "chat");
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  }, [panelOpen, pathname, router, searchParams]);

  useEffect(() => {
    let sequence = "";
    let timer = 0;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable=true]") || target?.isContentEditable;
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[aria-label='Filter query'], [placeholder*='Search']")?.focus();
      } else if (event.key === "?") {
        setShortcutsOpen(true);
      } else if (sequence === "g") {
        const routes: Record<string, string> = { i: "/", o: "/overview", t: "/tasks", e: "/events", p: "/creatives", f: "/finance", c: "/cbl", m: "/committees" };
        if (routes[event.key]) router.push(routes[event.key]);
        sequence = "";
      } else if (event.key.toLowerCase() === "g") {
        sequence = "g";
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { sequence = ""; }, 900);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onTogglePanel={togglePanel} onOpenPalette={() => setPaletteOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
          {panelOpen && (
            <aside className="w-[340px] min-w-[240px] resize-x overflow-y-auto border-l border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold"><CommentDiscussionIcon size={16} /> AI chat</div>
              <p className="text-sm text-muted-foreground">AI chat arrives in a later PR.</p>
            </aside>
          )}
        </div>
      </div>
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-label="Keyboard shortcuts" onClick={() => setShortcutsOpen(false)}>
          <section className="w-full max-w-md rounded-lg border border-border bg-card p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="font-semibold">Keyboard shortcuts</h2><button type="button" onClick={() => setShortcutsOpen(false)} aria-label="Close shortcuts">×</button></div>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-3 text-sm"><dt>Go to inbox / overview / tasks / events / committees</dt><dd className="mono text-muted-foreground">g i/o/t/e/m</dd><dt>Create a task</dt><dd className="mono text-muted-foreground">c</dd><dt>Search</dt><dd className="mono text-muted-foreground">/</dd><dt>Command palette</dt><dd className="mono text-muted-foreground">Ctrl/⌘ K</dd></dl>
          </section>
        </div>
      )}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="h-screen bg-background" />}><ShellContent>{children}</ShellContent></Suspense>;
}
