"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircleIcon, CpuIcon, ShieldCheckIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import { PROVIDER_TYPES, type ProviderType } from "@/lib/ai/provider-types";
import { Skeleton } from "@/components/patterns/skeletons";

function WizardSteps({ dataDir }: { dataDir: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const requestedStep = Number(search.get("step") ?? 1);
  const step = Number.isInteger(requestedStep) ? Math.min(4, Math.max(1, requestedStep)) : 1;
  const [orgName, setOrgName] = useState("");
  const [shortName, setShortName] = useState("");
  const [nature, setNature] = useState("academic");
  const [detected, setDetected] = useState({ ollama: false, lmstudio: false });
  const [detectionComplete, setDetectionComplete] = useState(false);
  const detecting = step === 2 && !detectionComplete;
  const [providerType, setProviderType] = useState<ProviderType>("openai");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const syncFolder = /dropbox|onedrive|google drive|icloud/i.test(dataDir);

  useEffect(() => {
    if (step === 2) {
      void fetch("/api/providers/detect")
        .then((response) => response.json())
        .then(setDetected)
        .catch(() => undefined)
        .finally(() => setDetectionComplete(true));
    }
  }, [step]);

  function go(next: number) {
    router.push(`/setup?step=${Math.min(4, Math.max(1, next))}`);
  }

  async function saveOrg() {
    setBusy(true);
    const response = await apiFetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "org.profile": { name: orgName, shortName, nature } }),
    });
    setBusy(false);
    if (!response.ok) return toast.error("Could not save your organization profile.");
    go(2);
  }

  async function addProvider(type: "ollama" | "lmstudio" | "cloud") {
    setBusy(true);
    const resolvedType = type === "cloud" ? providerType : type;
    const provider = PROVIDER_TYPES[resolvedType];
    const response = await apiFetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: provider.label,
        type: resolvedType,
        baseUrl: provider.defaultBaseUrl,
        apiKey: type === "cloud" ? apiKey : undefined,
      }),
    });
    setBusy(false);
    const result = await response.json();
    if (!response.ok) return toast.error(result.error ?? "Could not add provider.");
    toast.success(`${provider.label} added.`);
  }

  async function finish() {
    setBusy(true);
    const response = await apiFetch("/api/setup/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    setBusy(false);
    if (!response.ok) return toast.error("Could not finish setup.");
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-10">
      <Link href="/" className="text-sm font-semibold">MSC Ops</Link>
      <div className="mt-8 flex gap-2" aria-label={`Setup step ${step} of 4`}>
        {[1, 2, 3, 4].map((item) => <span key={item} className={`h-1 flex-1 rounded ${item <= step ? "bg-primary" : "bg-secondary"}`} />)}
      </div>
      <section className="mt-7 rounded-lg border border-border bg-card p-7">
        {step === 1 && (
          <div className="space-y-5">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Step 1 of 4</p><h1 className="mt-2 text-2xl font-semibold">Set up your organization</h1><p className="mt-2 text-sm text-muted-foreground">You can update these details any time in Settings.</p></div>
            <label className="block space-y-1.5 text-sm">Organization name<Input required value={orgName} onChange={(event) => setOrgName(event.target.value)} placeholder="Mark's MSC at NU Dasmariñas" /></label>
            <label className="block space-y-1.5 text-sm">Short name<Input required value={shortName} onChange={(event) => setShortName(event.target.value)} placeholder="MSC" /></label>
            <label className="block space-y-1.5 text-sm">Nature
              <Select value={nature} onValueChange={setNature}>
                <SelectTrigger><span>{nature}</span></SelectTrigger>
                <SelectContent><SelectItem value="independent">Independent</SelectItem><SelectItem value="academic">Academic</SelectItem><SelectItem value="extracurricular">Extracurricular</SelectItem></SelectContent>
              </Select>
            </label>
            <div className="flex justify-between pt-2"><Button variant="ghost" onClick={() => go(2)}>Skip for now</Button><Button disabled={busy || !orgName.trim() || !shortName.trim()} onClick={() => void saveOrg()}>{busy ? "Saving…" : "Continue"}</Button></div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-5">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Step 2 of 4</p><h1 className="mt-2 text-2xl font-semibold">Connect an AI provider</h1><p className="mt-2 text-sm text-muted-foreground">Local models keep prompts on this device. You can change providers later.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" disabled={detecting || !detected.ollama || busy} onClick={() => void addProvider("ollama")} className="rounded-md border border-border p-4 text-left hover:bg-secondary disabled:opacity-50"><CpuIcon size={18} /><p className="mt-2 font-medium">Ollama</p>{detecting ? <Skeleton className="mt-2 h-4 w-40" /> : <p className="text-sm text-muted-foreground">{detected.ollama ? "Detected · add provider" : "Not detected at 127.0.0.1:11434"}</p>}</button>
              <button type="button" disabled={detecting || !detected.lmstudio || busy} onClick={() => void addProvider("lmstudio")} className="rounded-md border border-border p-4 text-left hover:bg-secondary disabled:opacity-50"><CpuIcon size={18} /><p className="mt-2 font-medium">LM Studio</p>{detecting ? <Skeleton className="mt-2 h-4 w-40" /> : <p className="text-sm text-muted-foreground">{detected.lmstudio ? "Detected · add provider" : "Not detected at 127.0.0.1:1234"}</p>}</button>
            </div>
            <div className="space-y-3 rounded-md border border-border p-4">
              <p className="font-medium">Add a cloud provider</p>
              <Select value={providerType} onValueChange={(value) => setProviderType(value as ProviderType)}>
                <SelectTrigger><span>{PROVIDER_TYPES[providerType].label}</span></SelectTrigger>
                <SelectContent>{(["openai", "anthropic", "google", "openrouter", "groq"] as const).map((type) => <SelectItem key={type} value={type}>{PROVIDER_TYPES[type].label}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="password" placeholder="API key" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
              <Button variant="outline" disabled={busy || !apiKey.trim()} onClick={() => void addProvider("cloud")}>Add cloud provider</Button>
            </div>
            <div className="flex justify-between pt-2"><Button variant="ghost" onClick={() => go(3)}>Skip this step</Button><Button onClick={() => go(3)}>Continue</Button></div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-5">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Step 3 of 4</p><h1 className="mt-2 text-2xl font-semibold">Keep your data safe</h1><p className="mt-2 text-sm text-muted-foreground">MSC Ops stores its database locally. Anyone with access to this device account can read local app data.</p></div>
            <div className="flex gap-3 rounded-md border border-border p-4"><ShieldCheckIcon size={20} className="mt-0.5 shrink-0 text-success" /><div><p className="font-medium">Enable full-disk encryption</p><p className="mt-1 text-sm text-muted-foreground">We recommend BitLocker on Windows, FileVault on macOS, or LUKS on Linux to protect the data directory if your device is lost.</p></div></div>
            {syncFolder && <div className="rounded-md border border-attention/50 bg-attention/10 p-4 text-sm">This data path appears to be in a cloud-synced folder. Syncing active database files can cause corruption. Keep the data directory local and use backups for sharing.</div>}
            <p className="mono text-xs text-muted-foreground">Data directory: {dataDir}</p>
            <div className="flex justify-between pt-2"><Button variant="ghost" onClick={() => go(4)}>Skip for now</Button><Button onClick={() => go(4)}>Continue</Button></div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-5 text-center">
            <CheckCircleIcon size={32} className="mx-auto text-success" />
            <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Step 4 of 4</p><h1 className="mt-2 text-2xl font-semibold">You’re ready</h1><p className="mt-2 text-sm text-muted-foreground">MSC Ops is running locally. Tasks, events, finance, and other modules will arrive in later updates.</p></div>
            <Button disabled={busy} onClick={() => void finish()}>{busy ? "Finishing…" : "Open MSC Ops"}</Button>
          </div>
        )}
      </section>
      <div className="mt-4 flex justify-between text-xs text-muted-foreground">
        <span>Step {step} of 4</span>
        {step > 1 && step < 4 && <button type="button" onClick={() => go(step + 1)} className="hover:text-foreground">Skip this step</button>}
      </div>
    </main>
  );
}

export default function SetupWizard({ dataDir }: { dataDir: string }) {
  return <Suspense fallback={<main className="min-h-screen bg-background" />}><WizardSteps dataDir={dataDir} /></Suspense>;
}
