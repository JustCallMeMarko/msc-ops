"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export function RecoveryPage() {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/recovery/snapshots").then((response) => response.json()).then(setSnapshots).catch(() => setSnapshots([]));
  }, []);
  async function restore(file: string) {
    setRestoring(file);
    const response = await apiFetch("/api/recovery/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file }),
    });
    setRestoring(null);
    if (!response.ok) return toast.error("Snapshot restore failed. Try another snapshot.");
    toast.success("Snapshot restored.");
    router.push("/");
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold">Database recovery</h1>
      <p className="mt-2 text-sm text-muted-foreground">MSC Ops could not open its local database. Restore a recent snapshot to recover your workspace.</p>
      <section className="mt-6 space-y-3 rounded-md border border-border bg-card p-5">
        <h2 className="font-semibold">Available snapshots</h2>
        {snapshots.length ? snapshots.map((file) => (
          <div key={file} className="flex items-center justify-between gap-3 border-t border-border py-3">
            <span className="mono text-xs">{file}</span>
            <Button size="sm" disabled={restoring !== null} onClick={() => void restore(file)}>{restoring === file ? "Restoring…" : "Restore"}</Button>
          </div>
        )) : <p className="text-sm text-muted-foreground">No snapshots found.</p>}
        <Button variant="outline" disabled>Import a .mscops file (coming later)</Button>
      </section>
    </main>
  );
}
