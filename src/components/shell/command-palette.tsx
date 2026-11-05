"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { apiFetch } from "@/lib/api-client";
import { useTheme } from "next-themes";

const destinations = [
  ["Inbox", "/"], ["Overview", "/overview"], ["Tasks", "/tasks"], ["Events", "/events"],
  ["Creatives", "/creatives"], ["Finance", "/finance"], ["CBL", "/cbl"], ["Files", "/files"],
  ["Templates", "/templates"], ["Chat", "/chat"], ["Manual", "/manual"],
  ["Compliance", "/compliance"], ["Settings", "/settings/general"],
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/settings").then((response) => response.json()).then((settings: { "privacy.offlineMode"?: boolean }) => {
      setOffline(Boolean(settings["privacy.offlineMode"]));
    }).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex justify-center bg-black/55 px-4 pt-[15vh]" onMouseDown={() => onOpenChange(false)}>
      <Command
        className="h-fit max-h-[70vh] w-full max-w-xl overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Command.Input autoFocus placeholder="Search pages and actions…" className="h-12 w-full border-b border-border bg-transparent px-4 outline-none" />
        <Command.List className="max-h-[55vh] overflow-y-auto p-2">
          <Command.Empty className="p-4 text-sm text-muted-foreground">No results found.</Command.Empty>
          <Command.Group heading="Navigate" className="px-2 py-1 text-xs text-muted-foreground">
            {destinations.map(([label, href]) => (
              <Command.Item key={href} value={`${label} ${href}`} onSelect={() => { router.push(href); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">
                {label}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Actions" className="px-2 py-1 text-xs text-muted-foreground">
            <Command.Item value="toggle theme" onSelect={() => { setTheme(theme === "light" ? "dark" : "light"); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">Toggle theme</Command.Item>
            <Command.Item value="toggle offline mode" onSelect={() => { void apiFetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "privacy.offlineMode": !offline }) }).then(() => setOffline(!offline)); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">
              Toggle offline mode {offline ? "(on)" : "(off)"}
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
