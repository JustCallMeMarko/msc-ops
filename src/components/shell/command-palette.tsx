"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { apiFetch } from "@/lib/api-client";
import { useTheme } from "next-themes";

const destinations = [
  ["Inbox", "/"], ["Overview", "/overview"], ["Tasks", "/tasks"], ["Events", "/events"],
  ["Committees", "/committees"],
  ["Creatives", "/creatives"], ["Finance", "/finance"], ["CBL", "/cbl"], ["Files", "/files"],
  ["Templates", "/templates"], ["Chat", "/chat"], ["Manual", "/manual"],
  ["Compliance", "/compliance"], ["Settings", "/settings/general"],
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const [offline, setOffline] = useState(false);
  const [tasks, setTasks] = useState<Array<{ number: number; title: string }>>([]);
  const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/settings").then((response) => response.json()).then((settings: { "privacy.offlineMode"?: boolean }) => {
      setOffline(Boolean(settings["privacy.offlineMode"]));
    }).catch(() => undefined);
    void fetch("/api/tasks").then((response) => response.json()).then((rows: Array<{ number: number; title: string }>) => setTasks(rows)).catch(() => setTasks([]));
    void fetch("/api/posts").then((response) => response.json()).then((rows: Array<{ id: string; title: string }>) => setPosts(rows)).catch(() => setPosts([]));
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
            {tasks.map((task) => <Command.Item key={task.number} value={`go to task #${task.number} ${task.title}`} onSelect={() => { router.push(`/tasks/${task.number}`); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">Go to #{task.number} · {task.title}</Command.Item>)}
            <Command.Item value="open content calendar" onSelect={() => { router.push("/creatives?view=calendar"); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">Open content calendar</Command.Item>
            {posts.map((post) => <Command.Item key={post.id} value={`go to post ${post.title}`} onSelect={() => { router.push(`/creatives/${post.id}`); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">Go to post · {post.title}</Command.Item>)}
          </Command.Group>
          <Command.Group heading="Actions" className="px-2 py-1 text-xs text-muted-foreground">
            <Command.Item value="new task" onSelect={() => { router.push("/tasks?new=1"); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">New task</Command.Item>
            <Command.Item value="new committee" onSelect={() => { router.push("/committees?new=1"); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">New committee</Command.Item>
            <Command.Item value="new event" onSelect={() => { router.push("/events?new=1"); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">New event</Command.Item>
            <Command.Item value="new post" onSelect={() => { router.push("/creatives?new=1"); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">New post</Command.Item>
            <Command.Item value="upload file" onSelect={() => { router.push("/files?upload=1"); onOpenChange(false); }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">Upload file</Command.Item>
            <Command.Item value="copy all digests" onSelect={() => {
              void fetch("/api/digest").then((response) => response.json()).then(async (rows: Array<{ committee: { name: string }; digest: string }>) => {
                await navigator.clipboard.writeText(rows.map((row) => `${row.committee.name}\n${row.digest}`).join("\n\n"));
              });
              onOpenChange(false);
            }} className="cursor-pointer rounded px-3 py-2 text-sm data-[selected=true]:bg-secondary">Copy all digests</Command.Item>
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
