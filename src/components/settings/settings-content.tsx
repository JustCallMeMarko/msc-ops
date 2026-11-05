"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { CheckCircleIcon, CloudIcon, CpuIcon, PencilIcon, PlusIcon, TrashIcon } from "@primer/octicons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/patterns/label";
import { toastUndo } from "@/components/patterns/toast-undo";
import { apiFetch } from "@/lib/api-client";
import { isLocalProviderUrl, PROVIDER_TYPES, type ProviderType } from "@/lib/ai/provider-types";
import { plural } from "@/lib/utils";
import { DEFAULT_NUDGE_TEMPLATE } from "@/lib/tasks/logic";
import { DeadlinesContent } from "@/components/settings/deadlines-content";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UploadDropzone } from "@/components/patterns/upload-dropzone";

type Provider = {
  id: string; name: string; type: ProviderType; baseUrl: string; hasKey: boolean; keyLast4: string | null;
};
type SettingValues = {
  "org.profile": { name: string; shortName: string; nature: "independent" | "academic" | "extracurricular" | null; logoDataUrl?: string };
  "ai.defaults": { chat?: { providerId: string; model: string }; embedding?: { providerId: string; model: string } };
  "privacy.offlineMode": boolean;
  "privacy.sensitiveLocalOnly": boolean;
  "tasks.nudgeTemplate": string;
  "brand.kit": { logoFileId?: string; headingFontFileId?: string; bodyFontFileId?: string; frameFileId?: string; colors: Record<"primary" | "secondary" | "accent" | "background" | "text", string> };
  "creatives.autoSchedule": boolean;
};

const settingDefaults: SettingValues = {
  "org.profile": { name: "", shortName: "", nature: null },
  "ai.defaults": {},
  "privacy.offlineMode": false,
  "privacy.sensitiveLocalOnly": false,
  "tasks.nudgeTemplate": DEFAULT_NUDGE_TEMPLATE,
  "brand.kit": { colors: { primary: "#0969da", secondary: "#1f6feb", accent: "#bf8700", background: "#0d1117", text: "#f0f6fc" } },
  "creatives.autoSchedule": true,
};

function isValidUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const sections = [
  ["general", "General"], ["deadlines", "Deadlines"], ["brand-kit", "Brand Kit"], ["posting-rules", "Posting rules"], ["ai", "AI"], ["privacy", "Privacy"], ["about", "About"],
];

export function SettingsContent({ section, dataDir }: { section: string; dataDir: string }) {
  const { theme, setTheme } = useTheme();
  const [values, setValues] = useState<SettingValues>(settingDefaults);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [network, setNetwork] = useState<Array<{ at: string; host: string; method: string; path: string; purpose: string; status: number | null; blocked: boolean }>>([]);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    const [settingsResponse, providersResponse] = await Promise.all([fetch("/api/settings"), fetch("/api/providers")]);
    const loaded = await settingsResponse.json() as SettingValues;
    const providerRows = await providersResponse.json() as Provider[];
    setValues({ ...settingDefaults, ...loaded });
    setProviders(providerRows);
    if (section === "privacy") {
      const response = await fetch("/api/network-log?limit=100");
      setNetwork(await response.json());
    }
    setBusy(false);
  }, [section]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function patchSetting<K extends keyof SettingValues>(key: K, value: SettingValues[K]) {
    const response = await apiFetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    if (!response.ok) throw new Error("Could not save setting.");
    setValues((current) => ({ ...current, [key]: value }));
  }

  if (busy) return <div className="space-y-3" aria-label="Loading settings"><div className="h-9 w-52 animate-pulse rounded bg-secondary" /><div className="h-44 animate-pulse rounded bg-secondary" /></div>;

  return (
    <div className="grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)]">
      <nav className="space-y-1" aria-label="Settings sections">
        {sections.map(([slug, label]) => (
          <Link key={slug} href={`/settings/${slug}`} aria-current={section === slug ? "page" : undefined}
            className={`block rounded px-3 py-2 text-sm ${section === slug ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="max-w-4xl space-y-5">
        {section === "general" && <>
          <GeneralSection value={values["org.profile"]} onSave={(value) => patchSetting("org.profile", value)} />
          <NudgeTemplateSection value={values["tasks.nudgeTemplate"]} onSave={(value) => patchSetting("tasks.nudgeTemplate", value)} />
          <section className="rounded-md border border-border bg-card p-5">
            <h2 className="font-semibold">Appearance</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose a theme for this workspace.</p>
            <Select value={theme ?? "dark"} onValueChange={setTheme}>
              <SelectTrigger className="mt-4 max-w-xs"><span>{theme === "light" ? "Light" : theme === "system" ? "System" : "Dark"}</span></SelectTrigger>
              <SelectContent><SelectItem value="dark">Dark</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="system">System</SelectItem></SelectContent>
            </Select>
          </section>
        </>}
        {section === "ai" && <AiSection
          providers={providers}
          defaults={values["ai.defaults"]}
          sensitiveLocalOnly={values["privacy.sensitiveLocalOnly"]}
          onProvidersChange={setProviders}
          onDefaults={(value) => patchSetting("ai.defaults", value)}
          onSensitive={(value) => patchSetting("privacy.sensitiveLocalOnly", value)}
        />}
        {section === "privacy" && <PrivacySection
          offline={values["privacy.offlineMode"]}
          onOffline={(value) => patchSetting("privacy.offlineMode", value)}
          network={network}
        />}
        {section === "about" && <AboutSection dataDir={dataDir} />}
        {section === "deadlines" && <DeadlinesContent />}
        {section === "brand-kit" && <BrandKitSection
          value={values["brand.kit"]}
          autoSchedule={values["creatives.autoSchedule"]}
          onSave={(value) => patchSetting("brand.kit", value)}
          onAutoSchedule={(value) => patchSetting("creatives.autoSchedule", value)}
        />}
        {section === "posting-rules" && <PostingRulesSection />}
        <section className="rounded-md border border-destructive/60 bg-card p-5">
          <h2 className="font-semibold text-destructive">Danger zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">Reset and replace-all actions will be available in a later PR.</p>
        </section>
      </div>
    </div>
  );
}

type BrandKit = SettingValues["brand.kit"];
const brandColors = ["primary", "secondary", "accent", "background", "text"] as const;
const colorSwatches = ["#0969da", "#1f6feb", "#bf8700", "#238636", "#da3633", "#8957e5", "#0d1117", "#f0f6fc"];
function BrandKitSection({ value, autoSchedule, onSave, onAutoSchedule }: {
  value: BrandKit; autoSchedule: boolean; onSave: (value: BrandKit) => Promise<void>; onAutoSchedule: (value: boolean) => Promise<void>;
}) {
  const [kit, setKit] = useState(value);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the local color editor in sync with saved settings.
  useEffect(() => { setKit(value); }, [value]);
  async function save() {
    setSaving(true);
    try { await onSave(kit); toast.success("Brand Kit saved."); }
    catch { toast.error("Could not save Brand Kit."); }
    finally { setSaving(false); }
  }
  async function upload(key: "logoFileId" | "headingFontFileId" | "bodyFontFileId" | "frameFileId", file?: File) {
    if (!file) return;
    const form = new FormData(); form.set("file", file); form.set("kind", "creative"); form.set("source", "org");
    const response = await apiFetch("/api/files", { method: "POST", body: form });
    if (!response.ok) return toast.error((await response.json()).error ?? "Could not upload Brand Kit asset.");
    const result = await response.json() as { id: string };
    setKit((current) => ({ ...current, [key]: result.id }));
    toast.success("Asset uploaded. Save the Brand Kit to apply it.");
  }
  return <div className="space-y-4">
    <section className="space-y-4 rounded-md border border-border bg-card p-5">
      <div><h2 className="font-semibold">Brand Kit</h2><p className="mt-1 text-sm text-muted-foreground">Local organization assets and colors used by the creative generator.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">{[
        ["Logo", "logoFileId", "image/*"], ["Heading font (TTF/OTF)", "headingFontFileId", ".ttf,.otf"], ["Body font (TTF/OTF)", "bodyFontFileId", ".ttf,.otf"], ["Frame", "frameFileId", "image/*"],
      ].map(([label, key, accept]) => <div key={key}><UploadDropzone accept={accept} onFiles={(files) => void upload(key as "logoFileId" | "headingFontFileId" | "bodyFontFileId" | "frameFileId", files[0])}>{label}</UploadDropzone>{kit[key as keyof BrandKit] && <p className="mt-1 text-xs text-success">Asset selected</p>}{(key === "logoFileId" || key === "frameFileId") && kit[key] && <Image src={`/api/files/${kit[key]}/content`} alt={`${label} preview`} width={320} height={120} unoptimized className="mt-2 h-20 w-full rounded object-contain" />}</div>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">{brandColors.map((key) => <div key={key} className="flex items-center justify-between rounded border border-border px-3 py-2"><span className="text-sm capitalize">{key}</span><Popover><PopoverTrigger asChild><Button variant="outline" size="sm"><span className="size-4 rounded border border-border" style={{ backgroundColor: kit.colors[key] }} />{kit.colors[key]}</Button></PopoverTrigger><PopoverContent className="w-64 space-y-3"><Input aria-label={`${key} color hex`} value={kit.colors[key]} onChange={(event) => setKit((current) => ({ ...current, colors: { ...current.colors, [key]: event.target.value } }))} /><div className="grid grid-cols-4 gap-2">{colorSwatches.map((color) => <button key={color} type="button" aria-label={`Use ${color}`} onClick={() => setKit((current) => ({ ...current, colors: { ...current.colors, [key]: color } }))} className="size-8 rounded border border-border" style={{ backgroundColor: color }} />)}</div></PopoverContent></Popover></div>)}</div>
      <div className="rounded border border-border p-4" style={{ background: kit.colors.background, color: kit.colors.text }}><p style={{ color: kit.colors.accent }} className="text-xs font-semibold">3 DAYS TO GO</p><h3 style={{ color: kit.colors.primary }} className="mt-2 text-2xl font-semibold">Dasmariñas Week</h3><p style={{ color: kit.colors.secondary }} className="mt-1 text-sm">November 14 · Activity Center</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><label className="flex items-center gap-2 text-sm"><Switch checked={autoSchedule} onCheckedChange={(checked) => void onAutoSchedule(checked).then(() => toast.success(checked ? "Auto-scheduling enabled." : "Auto-scheduling disabled.")).catch(() => toast.error("Could not update auto-scheduling."))} />Generate posting schedules for new events</label><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Brand Kit"}</Button></div>
    </section>
  </div>;
}

type PostingRuleRow = { id: string; key: string; postType: string; label: string; offsetDays: number; anchor: "event_start" | "event_end"; enabled: boolean };
function PostingRulesSection() {
  const [rows, setRows] = useState<PostingRuleRow[] | null>(null);
  useEffect(() => { void fetch("/api/posting-rules").then((response) => response.json()).then(setRows).catch(() => setRows([])); }, []);
  async function patch(row: PostingRuleRow, values: Partial<PostingRuleRow>) {
    const response = await apiFetch(`/api/posting-rules/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    if (!response.ok) return toast.error("Could not update posting rule.");
    const updated = await response.json() as PostingRuleRow;
    setRows((current) => current?.map((item) => item.id === row.id ? updated : item) ?? []);
    toast.success("Posting rule saved.");
  }
  return <section className="space-y-3 rounded-md border border-border bg-card p-5"><div><h2 className="font-semibold">Posting rules</h2><p className="text-sm text-muted-foreground">Offset-based schedules are generated at 6pm Manila time.</p></div>{!rows ? <div className="h-40 animate-pulse rounded bg-secondary" /> : <div className="divide-y divide-border">{rows.map((row) => <div key={row.id} className="grid gap-2 py-3 md:grid-cols-[1fr_1.3fr_110px_150px_auto]"><Input aria-label={`${row.key} label`} defaultValue={row.label} onBlur={(event) => event.target.value !== row.label && void patch(row, { label: event.target.value })} /><Input aria-label={`${row.key} offset days`} type="number" defaultValue={row.offsetDays} onBlur={(event) => Number(event.target.value) !== row.offsetDays && void patch(row, { offsetDays: Number(event.target.value) })} /><Select value={row.anchor} onValueChange={(anchor) => void patch(row, { anchor: anchor as PostingRuleRow["anchor"] })}><SelectTrigger><span>{row.anchor === "event_start" ? "Event start" : "Event end"}</span></SelectTrigger><SelectContent><SelectItem value="event_start">Event start</SelectItem><SelectItem value="event_end">Event end</SelectItem></SelectContent></Select><span className="self-center text-xs text-muted-foreground">{row.key}</span><Switch checked={row.enabled} onCheckedChange={(enabled) => void patch(row, { enabled })} aria-label={`Enable ${row.label}`} /></div>)}</div>}</section>;
}

function NudgeTemplateSection({ value, onSave }: { value: string; onSave: (value: string) => Promise<void> }) {
  const [template, setTemplate] = useState(value);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await onSave(template); toast.success("Nudge template saved."); }
    catch { toast.error("Could not save nudge template."); }
    finally { setSaving(false); }
  }
  return <section className="space-y-3 rounded-md border border-border bg-card p-5">
    <div><h2 className="font-semibold">Task nudge template</h2><p className="text-sm text-muted-foreground">Available tokens: {"{first_name}"}, {"{title}"}, {"{due}"}, {"{days_left}"}, {"{task_ref}"}.</p></div>
    <Textarea rows={4} value={template} onChange={(event) => setTemplate(event.target.value)} />
    <Button disabled={saving || !template.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save template"}</Button>
  </section>;
}

function GeneralSection({ value, onSave }: { value: SettingValues["org.profile"]; onSave: (value: SettingValues["org.profile"]) => Promise<void> }) {
  const [form, setForm] = useState(value);
  const [saving, setSaving] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try { await onSave(form); toast.success("Organization profile saved."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save."); }
    setSaving(false);
  }
  async function handleLogo(file?: File) {
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const scale = Math.min(512 / bitmap.width, 512 / bitmap.height, 1);
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let quality = 0.85;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > 340_000 && quality > 0.2) {
      quality -= 0.1;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    if (data.length > 350_000) return toast.error("Logo must be 256KB or smaller.");
    setForm((current) => ({ ...current, logoDataUrl: data }));
  }
  return (
    <form onSubmit={save} className="space-y-5 rounded-md border border-border bg-card p-5">
      <div><h1 className="text-lg font-semibold">Organization profile</h1><p className="text-sm text-muted-foreground">Set the name and identity used across MSC Ops.</p></div>
      <Field label="Organization name"><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="Short name"><Input required value={form.shortName} onChange={(event) => setForm({ ...form, shortName: event.target.value })} /></Field>
      <Field label="Nature">
        <Select value={form.nature ?? "none"} onValueChange={(nature) => setForm({ ...form, nature: nature === "none" ? null : nature as NonNullable<typeof form.nature> })}>
          <SelectTrigger><span>{form.nature ?? "Choose nature…"}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not set</SelectItem>
            <SelectItem value="independent">Independent</SelectItem>
            <SelectItem value="academic">Academic</SelectItem>
            <SelectItem value="extracurricular">Extracurricular</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Logo"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleLogo(event.target.files?.[0])} /></Field>
      {form.logoDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- Resized data URL preview; image optimization is intentionally disabled.
        <img src={form.logoDataUrl} alt="Organization logo preview" className="size-16 rounded border border-border object-contain" />
      )}
      <Button type="submit" disabled={saving || !form.name.trim() || !form.shortName.trim()}>{saving ? "Saving…" : "Save profile"}</Button>
    </form>
  );
}

function AiSection(props: {
  providers: Provider[];
  defaults: SettingValues["ai.defaults"];
  sensitiveLocalOnly: boolean;
  onProvidersChange: (providers: Provider[]) => void;
  onDefaults: (value: SettingValues["ai.defaults"]) => Promise<void>;
  onSensitive: (value: boolean) => Promise<void>;
}) {
  const [providerType, setProviderType] = useState<ProviderType>("ollama");
  const [name, setName] = useState("Ollama");
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDER_TYPES.ollama.defaultBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<Record<string, { id: string; label: string }[]>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function changeType(type: ProviderType) {
    setProviderType(type);
    setBaseUrl(PROVIDER_TYPES[type].defaultBaseUrl);
    setName(PROVIDER_TYPES[type].label);
    setApiKey("");
  }
  async function addProvider() {
    setBusy(true);
    try {
      const response = await apiFetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: providerType, baseUrl, apiKey: apiKey || undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add provider.");
      props.onProvidersChange([...props.providers, body as Provider]);
      setApiKey("");
      toast.success("Provider added.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add provider."); }
    setBusy(false);
  }
  async function testProvider(provider: Provider) {
    setTesting(provider.id);
    try {
      const response = await apiFetch(`/api/providers/${provider.id}/test`, { method: "POST", body: "{}" });
      const result = await response.json() as { ok: boolean; models: { id: string; label: string }[]; error?: { message: string } };
      if (!result.ok) throw new Error(result.error?.message ?? "Provider test failed.");
      setModels((current) => ({ ...current, [provider.id]: result.models }));
      toast.success(`Connected · ${plural(result.models.length, "model")} found.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Provider test failed."); }
    setTesting(null);
  }
  async function removeProvider(provider: Provider) {
    const response = await apiFetch(`/api/providers/${provider.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Could not remove provider.");
    props.onProvidersChange(props.providers.filter((item) => item.id !== provider.id));
    toastUndo(`${provider.name} removed`, () => {
      void apiFetch(`/api/providers/${provider.id}/restore`, { method: "POST", body: "{}" }).then(() => {
        props.onProvidersChange([...props.providers, provider]);
      });
    });
  }
  function startEditing(provider: Provider) {
    setEditing(provider.id);
    setEditName(provider.name);
    setEditBaseUrl(provider.baseUrl);
    setEditApiKey("");
  }
  async function saveProviderEdit(provider: Provider) {
    setSavingEdit(true);
    try {
      const response = await apiFetch(`/api/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, baseUrl: editBaseUrl, ...(editApiKey ? { apiKey: editApiKey } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update provider.");
      props.onProvidersChange(props.providers.map((item) => item.id === provider.id ? result as Provider : item));
      setEditing(null);
      toast.success("Provider updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update provider.");
    }
    setSavingEdit(false);
  }
  async function saveDefault(kind: "chat" | "embedding", providerId: string, model: string) {
    const next = { ...props.defaults, [kind]: { providerId, model } };
    try { await props.onDefaults(next); } catch { toast.error("Could not save model default."); }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-md border border-border bg-card p-5">
        <div><h1 className="text-lg font-semibold">AI providers</h1><p className="text-sm text-muted-foreground">Provider keys stay encrypted on this device and never return to the browser.</p></div>
        <div className="space-y-3">
          {props.providers.map((provider) => {
            const local = isLocalProviderUrl(provider.baseUrl);
            return (
              <article key={provider.id} className="rounded-md border border-border p-4">
                {editing === provider.id ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Name"><Input value={editName} onChange={(event) => setEditName(event.target.value)} required /></Field>
                    <Field label="Base URL"><Input value={editBaseUrl} onChange={(event) => setEditBaseUrl(event.target.value)} required /></Field>
                    <Field label="Replace API key"><Input type="password" autoComplete="new-password" placeholder={provider.hasKey ? `Saved key ••••${provider.keyLast4}` : "No key saved"} value={editApiKey} onChange={(event) => setEditApiKey(event.target.value)} /></Field>
                    <div className="flex items-end gap-2">
                      <Button type="button" disabled={savingEdit || !editName.trim() || !isValidUrl(editBaseUrl)} onClick={() => void saveProviderEdit(provider)}>Save</Button>
                      <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium">{local ? <CpuIcon size={16} /> : <CloudIcon size={16} />}{provider.name}<Label tone={local ? "success" : "neutral"}>{local ? "Local" : "Cloud"}</Label></div>
                  <div className="flex items-center gap-2">
                    {provider.hasKey && <span className="mono text-xs text-muted-foreground">••••{provider.keyLast4}</span>}
                    <Button type="button" variant="outline" size="sm" disabled={testing === provider.id} onClick={() => void testProvider(provider)}>{testing === provider.id ? "Testing…" : "Test connection"}</Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${provider.name}`} onClick={() => startEditing(provider)}><PencilIcon size={14} /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${provider.name}`} onClick={() => void removeProvider(provider)}><TrashIcon size={14} /></Button>
                  </div>
                </div>
                )}
                {models[provider.id] && <p className="mt-2 flex items-center gap-1 text-sm text-success"><CheckCircleIcon size={14} />{plural(models[provider.id].length, "model")}: {models[provider.id].slice(0, 6).map((model) => model.label).join(", ")}</p>}
              </article>
            );
          })}
          {!props.providers.length && <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No providers added yet. Add a local or cloud provider below.</p>}
        </div>
        <div className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-2">
          <Field label="Provider type">
            <Select value={providerType} onValueChange={(value) => changeType(value as ProviderType)}>
              <SelectTrigger><span>{PROVIDER_TYPES[providerType].label}</span></SelectTrigger>
              <SelectContent>{Object.entries(PROVIDER_TYPES).map(([key, info]) => <SelectItem key={key} value={key}>{info.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Base URL"><Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required /></Field>
          <Field label={PROVIDER_TYPES[providerType].needsKey ? "API key" : "API key (optional)"}>
            <Input type="password" autoComplete="new-password" placeholder="Paste a key to store it encrypted" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </Field>
          <Button type="button" disabled={busy || !name.trim() || !isValidUrl(baseUrl) || (PROVIDER_TYPES[providerType].needsKey && !apiKey)} onClick={() => void addProvider()} className="md:col-span-2"><PlusIcon size={14} /> Add provider</Button>
        </div>
      </section>
      <section className="space-y-4 rounded-md border border-border bg-card p-5">
        <h2 className="font-semibold">Default models</h2>
        {(["chat", "embedding"] as const).map((kind) => (
          <div key={kind} className="grid gap-3 md:grid-cols-2">
            <Field label={`${kind === "chat" ? "Chat" : "Embedding"} provider`}>
              <Select value={props.defaults[kind]?.providerId ?? ""} onValueChange={(providerId) => {
                const model = models[providerId]?.[0]?.id;
                if (model) void saveDefault(kind, providerId, model);
                else void saveDefault(kind, providerId, "");
              }}>
                <SelectTrigger><span>{props.providers.find((provider) => provider.id === props.defaults[kind]?.providerId)?.name ?? "Choose provider…"}</span></SelectTrigger>
                <SelectContent>{props.providers.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Model">
              <Combobox
                options={(models[props.defaults[kind]?.providerId ?? ""] ?? []).map((model) => ({ value: model.id, label: model.label }))}
                value={props.defaults[kind]?.model}
                placeholder="Test the provider to load models"
                disabled={!props.defaults[kind]?.providerId}
                onChange={(model) => {
                  const providerId = props.defaults[kind]?.providerId;
                  if (providerId) void saveDefault(kind, providerId, model);
                }}
              />
            </Field>
          </div>
        ))}
        <SettingRow title="Sensitive data local-only" description="Only use local models for content marked sensitive.">
          <Switch checked={props.sensitiveLocalOnly} onCheckedChange={(checked) => void props.onSensitive(checked)} />
        </SettingRow>
      </section>
    </div>
  );
}

function PrivacySection({ offline, onOffline, network }: { offline: boolean; onOffline: (value: boolean) => Promise<void>; network: Array<{ at: string; host: string; method: string; path: string; purpose: string; status: number | null; blocked: boolean }> }) {
  return (
    <div className="space-y-5">
      <section className="rounded-md border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">Privacy</h1>
        <SettingRow title="Offline mode" description="Block non-local network requests. Local Ollama and LM Studio remain available.">
          <Switch checked={offline} onCheckedChange={(checked) => void onOffline(checked).then(() => toast.success(checked ? "Offline mode enabled." : "Offline mode disabled."))} />
        </SettingRow>
      </section>
      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border p-5"><h2 className="font-semibold">Network activity</h2><p className="text-sm text-muted-foreground">Only request metadata is stored. Headers and message contents are never logged.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-secondary text-xs text-muted-foreground"><tr>{["Time", "Host", "Method / path", "Purpose", "Status"].map((heading) => <th key={heading} className="px-4 py-2 font-medium">{heading}</th>)}</tr></thead>
            <tbody>{network.map((row, index) => <tr key={`${row.at}-${index}`} className="border-t border-border"><td className="mono px-4 py-2 text-xs">{new Date(row.at).toLocaleTimeString()}</td><td className="mono px-4 py-2 text-xs">{row.host}</td><td className="mono px-4 py-2 text-xs">{row.method} {row.path}</td><td className="px-4 py-2">{row.purpose}</td><td className={`px-4 py-2 ${row.blocked ? "text-destructive" : "text-success"}`}>{row.blocked ? "Blocked" : row.status ?? "—"}</td></tr>)}</tbody>
          </table>
          {!network.length && <p className="p-5 text-sm text-muted-foreground">No outbound requests recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}

function AboutSection({ dataDir }: { dataDir: string }) {
  return (
    <section className="space-y-4 rounded-md border border-border bg-card p-5">
      <div><h1 className="text-lg font-semibold">About MSC Ops</h1><p className="text-sm text-muted-foreground">Local-first operations workspace.</p></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-[150px_1fr]"><dt className="text-muted-foreground">Version</dt><dd>0.1.0</dd><dt className="text-muted-foreground">Data directory</dt><dd className="mono break-all">{dataDir}</dd></dl>
      <Button type="button" variant="outline" disabled title="Desktop builds only">Check for updates <span className="text-xs text-muted-foreground">Desktop builds only</span></Button>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}

function SettingRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-t border-border py-4"><div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{description}</p></div>{children}</div>;
}
