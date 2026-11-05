"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchIcon, SidebarCollapseIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";

const labels: Record<string, string> = {
  inbox: "Inbox", setup: "Setup", recovery: "Recovery", dev: "Dev", ui: "UI",
  overview: "Overview", tasks: "Tasks", events: "Events", creatives: "Posts", finance: "Finance",
  cbl: "CBL", files: "Files", templates: "Templates", chat: "Chat", manual: "Manual", ai: "AI",
  general: "General", privacy: "Privacy", about: "About",
  compliance: "Compliance", settings: "Settings",
  committees: "People",
};

export function Topbar({ onTogglePanel, onOpenPalette, breadcrumbLabel }: { onTogglePanel: () => void; onOpenPalette: () => void; breadcrumbLabel?: string }) {
  const pathname = usePathname();
  const crumbs = pathname.split("/").filter(Boolean);
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link href="/overview" className="text-muted-foreground hover:text-foreground">MSC</Link>
        {crumbs.map((crumb, index) => (
          <span key={crumb} className="flex items-center gap-2">
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">{index === crumbs.length - 1 && breadcrumbLabel ? breadcrumbLabel : labels[crumb] ?? crumb}</span>
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onOpenPalette} aria-label="Open command palette">
          <SearchIcon size={14} /><span className="hidden sm:inline">Search</span><kbd className="rounded border border-border px-1.5 text-xs text-muted-foreground">⌘K</kbd>
        </Button>
        <Button variant="ghost" size="icon" onClick={onTogglePanel} aria-label="Toggle AI chat panel"><SidebarCollapseIcon size={16} /></Button>
      </div>
    </header>
  );
}
