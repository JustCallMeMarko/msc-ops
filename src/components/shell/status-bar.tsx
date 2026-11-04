"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon, XCircleIcon } from "@primer/octicons-react";
import { apiFetch } from "@/lib/api-client";

type Health = { status?: string };
type Provider = { id: string; name: string };

export function StatusBar({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<Health>({});
  const [providerStatus, setProviderStatus] = useState<boolean | null>(null);
  const [providerName, setProviderName] = useState("No AI provider");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const [healthResponse, settingsResponse, providersResponse] = await Promise.all([
          fetch("/api/health", { cache: "no-store" }),
          fetch("/api/settings", { cache: "no-store" }),
          fetch("/api/providers", { cache: "no-store" }),
        ]);
        const nextHealth = await healthResponse.json() as Health;
        const settings = await settingsResponse.json() as { "ai.defaults"?: { chat?: { providerId: string } }; "privacy.offlineMode"?: boolean };
        const providers = await providersResponse.json() as Provider[];
        const defaultId = settings["ai.defaults"]?.chat?.providerId;
        const provider = providers.find((entry) => entry.id === defaultId);
        if (!active) return;
        setHealth(nextHealth);
        setOffline(Boolean(settings["privacy.offlineMode"]));
        setProviderName(provider?.name ?? "No AI provider");
        if (provider) {
          const response = await apiFetch(`/api/providers/${provider.id}/test`, { method: "POST", body: "{}" });
          const result = await response.json() as { ok: boolean };
          if (active) setProviderStatus(result.ok);
        } else {
          setProviderStatus(null);
        }
      } catch {
        if (active) setHealth({ status: "db_error" });
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const ready = health.status === "ok";
  return (
    <div className="min-w-0 text-xs">
      <div className="flex items-center gap-1.5 font-medium">
        <span className={`size-2 rounded-full ${ready ? "bg-success" : "bg-attention"}`} />
        {!compact && <span>Local · {ready ? "Ready" : "Starting"}</span>}
      </div>
      {!compact && (
        <>
          <div className="mt-1 flex items-center gap-1 text-muted-foreground">
            {providerStatus === true ? <CheckCircleIcon size={12} className="text-success" /> : <XCircleIcon size={12} className={providerStatus === false ? "text-destructive" : ""} />}
            <span className="truncate">{providerName}</span>
          </div>
          {offline && <div className="mt-1 text-attention">Offline mode</div>}
        </>
      )}
    </div>
  );
}
