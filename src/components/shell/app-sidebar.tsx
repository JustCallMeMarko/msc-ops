"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookIcon,
  CalendarIcon,
  ChecklistIcon,
  CommentDiscussionIcon,
  CreditCardIcon,
  FileDirectoryIcon,
  GearIcon,
  GraphIcon,
  HomeIcon,
  InboxIcon,
  PaintbrushIcon,
  ShieldCheckIcon,
  SidebarCollapseIcon,
  TasklistIcon,
} from "@primer/octicons-react";
import { StatusBar } from "@/components/shell/status-bar";

const items = [
  { label: "Inbox", href: "/", icon: InboxIcon },
  { label: "Overview", href: "/overview", icon: GraphIcon },
  { label: "Tasks", href: "/tasks", icon: TasklistIcon },
  { label: "Events", href: "/events", icon: CalendarIcon },
  { label: "Creatives", href: "/creatives", icon: PaintbrushIcon },
  { label: "Finance", href: "/finance", icon: CreditCardIcon },
  { label: "CBL", href: "/cbl", icon: BookIcon },
  { label: "Files", href: "/files", icon: FileDirectoryIcon },
  { label: "Templates", href: "/templates", icon: ChecklistIcon },
  { label: "Chat", href: "/chat", icon: CommentDiscussionIcon },
  { label: "Manual", href: "/manual", icon: BookIcon },
  { label: "Compliance", href: "/compliance", icon: ShieldCheckIcon },
  { label: "Settings", href: "/settings/general", icon: GearIcon },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] ${collapsed ? "w-[68px]" : "w-60"}`}>
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        {!collapsed && <Link href="/" className="font-semibold tracking-tight">MSC Ops</Link>}
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
        {items.map(({ label, href, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
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
