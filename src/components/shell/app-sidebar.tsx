"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarIcon,
  CommentDiscussionIcon,
  CreditCardIcon,
  FileDirectoryIcon,
  GearIcon,
  GraphIcon,
  HomeIcon,
  MegaphoneIcon,
  PeopleIcon,
  SidebarCollapseIcon,
} from "@primer/octicons-react";
import { StatusBar } from "@/components/shell/status-bar";

const items = [
  { label: "Overview", href: "/overview", icon: GraphIcon, match: ["/overview"] },
  { label: "People", href: "/committees", icon: PeopleIcon, match: ["/committees", "/tasks"] },
  { label: "Events", href: "/events", icon: CalendarIcon, match: ["/events"] },
  { label: "Posts", href: "/creatives", icon: MegaphoneIcon, match: ["/creatives"] },
  { label: "Finance", href: "/finance", icon: CreditCardIcon, match: ["/finance"] },
  { label: "Files + templates", href: "/files", icon: FileDirectoryIcon, match: ["/files", "/templates"] },
  { label: "Chat", href: "/chat", icon: CommentDiscussionIcon, match: ["/chat"] },
  { label: "Settings", href: "/settings/general", icon: GearIcon, match: ["/settings", "/recovery", "/setup"] },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] ${collapsed ? "w-[68px]" : "w-60"}`}>
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        {!collapsed && <Link href="/overview" className="font-semibold tracking-tight">MSC Ops</Link>}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          onClick={() => setCollapsed(!collapsed)}
        >
          <SidebarCollapseIcon size={16} />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Primary navigation">
        {items.map(({ label, href, icon: Icon, match }) => {
          const active = match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={`flex h-9 items-center gap-3 rounded px-2.5 text-sm ${active ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              <Icon size={16} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <StatusBar compact={collapsed} />
        {!collapsed && <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><HomeIcon size={12} /> Local workspace</div>}
      </div>
    </aside>
  );
}
