"use client";
/* eslint-disable @next/next/no-img-element -- Creative assets are served from local file content routes. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { AlertIcon, CheckCircleIcon, DownloadIcon, PlusIcon } from "@primer/octicons-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CAPTION_STATUS_LABELS } from "@/lib/ui-labels";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RelativeDate } from "@/components/patterns/relative-date";
import { apiFetch } from "@/lib/api-client";
import { captionGuard, captionLength, ratioWarning, unicodeStyledWarning, type PostPlatform } from "@/lib/creatives/logic";
import { MANILA_TIME_ZONE } from "@/lib/tasks/logic";
import { POST_PLATFORM_LABELS, POST_STATUS_LABELS, POST_TYPE_LABELS } from "@/lib/ui-labels";

type Caption = { id: string; platform: string; body: string; version: number; status: string; approvedAt: string | null };
type Asset = { id: string; version: number; slideIndex: number; width: number | null; height: number | null; durationSec: number | null; isFinal: boolean; file: { id: string; originalName: string; mime: string } };
type PostData = {
  id: string; title: string; type: string; status: string; updatedAt: string; scheduledAt: string | null; platforms: string[];
  brandChecked: boolean; eventId: string | null; artistMemberId: string | null; writerMemberId: string | null; reviewerMemberId: string | null;
  artworkTaskId: string | null; captionTaskId: string | null; postUrls: Record<string,string>; analytics: Record<string,Record<string,number>>;
  event: { id: string; name: string; slug: string; startsAt: string; endsAt: string; venue: string; lumaUrl: string | null; approvalStatus: string; participantActual: number; participantTarget: number; description: string } | null;
  captions: Caption[]; assets: Asset[]; activity: Array<{ id: string; kind: string; body: string; at: string }>; approval: { ok: boolean; missing: string[] };
};
type Library = { templates: Array<{ id: string; postType: string; name: string; body: string }>; hashtags: Array<{ id: string; name: string; tags: string[] }>; mentions: Array<{ id: string; name: string; handles: string[] }> };
type MemberOption = { id: string; name: string };
type TaskOption = { id: string; number: number };
const timeLabel = (date: Date) => new Intl.DateTimeFormat("en-PH", { timeZone: MANILA_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);

export function PostDetailView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<PostData | null>(null);
  const [library, setLibrary] = useState<Library>({ templates: [], hashtags: [], mentions: [] });
  const [canAi, setCanAi] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [photos, setPhotos] = useState<Array<{ id: string; originalName: string; caption: string | null }>>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [tab, setTab] = useState("base");
  const [draft, setDraft] = useState("");
  const [aiPreview, setAiPreview] = useState("");
  const [comment, setComment] = useState("");
  const [generator, setGenerator] = useState("countdown");
  const [generatorUrl, setGeneratorUrl] = useState("");
  const [postedOpen, setPostedOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState<Record<string,string>>({});
  const [analyticsDraft, setAnalyticsDraft] = useState<Record<string,Record<string,string>>>({});
  const [scheduledTime, setScheduledTime] = useState("18:00");

  const load = useCallback(async () => {
    const [response, templates, hashtags, mentions, settings, memberResponse, taskResponse] = await Promise.all([
      fetch(`/api/posts/${id}`), fetch("/api/caption-templates"), fetch("/api/hashtag-sets"), fetch("/api/mention-lists"),
      fetch("/api/settings"), fetch("/api/members"), fetch("/api/tasks"),
    ]);
    if (!response.ok) { toast.error("Could not load post."); return; }
    const post = await response.json() as PostData;
    setData(post);
    setLibrary({
      templates: templates.ok ? await templates.json() : [],
      hashtags: hashtags.ok ? await hashtags.json() : [],
      mentions: mentions.ok ? await mentions.json() : [],
    });
    if (settings.ok) {
      const values = await settings.json() as Record<string, { chat?: unknown }>;
      setCanAi(Boolean(values["ai.defaults"]?.chat));
    }
    if (memberResponse.ok) setMembers(await memberResponse.json());
    if (taskResponse.ok) setTasks(await taskResponse.json());
    if (post.event) {
      const photoResponse = await fetch(`/api/events/${post.event.slug}/photos`);
      if (photoResponse.ok) setPhotos(await photoResponse.json());
    }
    const version = params.get("compare")?.split(",")[0];
    const requestedPlatform = params.get("platform");
    setTab(requestedPlatform && (requestedPlatform === "base" || post.platforms.includes(requestedPlatform))
      ? requestedPlatform
      : (current) => current === "base" || post.platforms.includes(current) ? current : "base");
    setDraft(post.captions.filter((caption) => caption.platform === (version ? "base" : tab)).sort((a,b) => b.version-a.version)[0]?.body ?? "");
    if (post.scheduledAt) setScheduledTime(timeLabel(new Date(post.scheduledAt)));
    setUrlDraft(post.postUrls ?? {});
  }, [id, params, tab]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the post workspace and its caption library.
  useEffect(() => { void load(); }, [load]);

  const latestCaptions = useMemo(() => {
    const result = new Map<string, Caption>();
    for (const caption of data?.captions ?? []) if (!result.has(caption.platform) || result.get(caption.platform)!.version < caption.version) result.set(caption.platform, caption);
    return result;
  }, [data]);
  const currentCaption = latestCaptions.get(tab);
  const length = tab === "base" ? null : captionLength(draft, tab as PostPlatform);
  const guard = data?.event ? captionGuard(data.event, draft) : null;
  const assetVersions = [...new Set(data?.assets.map((asset) => asset.version) ?? [])].sort((a,b) => b-a);

  async function patchPost(patch: Record<string,unknown>, success?: string) {
    if (!data) return;
    const response = await apiFetch(`/api/posts/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, expectedUpdatedAt: data.updatedAt }),
    });
    if (!response.ok) {
      if (response.status === 409) toast.error("Changed elsewhere — reload");
      else if (response.status === 422) {
        const result = await response.json() as { missing: string[] };
        toast.error(`Missing: ${result.missing.join(", ")}`);
      } else toast.error("Could not update post.");
      return false;
    }
    const updated = await response.json() as Partial<PostData>;
    setData((current) => current ? { ...current, ...updated } : current);
    if (success) toast.success(success);
    return true;
  }

  async function saveCaption() {
    await saveCaptionContent(draft);
  }

  async function saveCaptionContent(body: string) {
    const response = await apiFetch(`/api/posts/${id}/captions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: tab, body }),
    });
    if (!response.ok) return toast.error("Could not save caption.");
    const caption = await response.json() as Caption;
    setData((current) => current ? { ...current, captions: [...current.captions, caption] } : current);
    toast.success(`Caption v${caption.version} saved.`);
  }

  async function approveCaption() {
    const response = await apiFetch(`/api/posts/${id}/captions/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: tab }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      return toast.error(result.error ?? "Could not approve caption.");
    }
    await load();
    toast.success("Caption approved.");
  }

  async function askAi(action: "draft" | "rewrite" | "shorten" | "hashtags") {
    const response = await apiFetch("/api/captions/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, postId: id, platform: tab === "base" ? undefined : tab, text: draft }),
    });
    if (response.status === 409) return toast.error("Configure a chat model in Settings → AI first.");
    if (!response.ok) return toast.error("Could not generate caption.");
    const result = await response.json() as { text: string };
    setAiPreview(result.text);
  }

  async function uploadFile(file: File, width?: number, height?: number, durationSec?: number) {
    let response: Response;
    if (file.type === "video/mp4") {
      response = await apiFetch(`/api/posts/${id}/assets`, {
        method: "POST", headers: {
          "Content-Type": "video/mp4", "x-file-name": encodeURIComponent(file.name),
          ...(width ? { "x-width": String(width) } : {}), ...(height ? { "x-height": String(height) } : {}),
          ...(durationSec ? { "x-duration-sec": String(durationSec) } : {}),
        }, body: file,
      });
    } else {
      const form = new FormData();
      form.set("file", file);
      if (width) form.set("width", String(width));
      if (height) form.set("height", String(height));
      response = await apiFetch(`/api/posts/${id}/assets`, { method: "POST", body: form });
    }
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      toast.error(result.error ?? "Could not upload asset.");
      return;
    }
    await load();
    toast.success("Asset uploaded.");
  }

  async function chooseAsset(file?: File) {
    if (!file) return;
    if (file.type === "video/mp4") {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.src = objectUrl;
      video.muted = true;
      video.onloadedmetadata = () => {
        const width = video.videoWidth; const height = video.videoHeight; const duration = Math.round(video.duration);
        void uploadFile(file, width, height, duration);
        video.currentTime = 0;
        video.onseeked = () => {
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) void uploadFile(new File([blob], `${file.name.replace(/\.mp4$/i, "")}-poster.png`, { type: "image/png" }), width, height);
            URL.revokeObjectURL(objectUrl);
          }, "image/png");
        };
      };
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => { void uploadFile(file, image.naturalWidth, image.naturalHeight); URL.revokeObjectURL(objectUrl); };
    image.src = objectUrl;
  }

  async function saveGeneratedAsset() {
    if (!generatorUrl) return;
    const response = await fetch(generatorUrl);
    if (!response.ok) return toast.error("Could not render asset.");
    const blob = await response.blob();
    await uploadFile(new File([blob], `${generator}-${data?.title ?? "creative"}.png`, { type: "image/png" }), 1080, 1350);
  }

  async function submitComment() {
    const text = comment.trim();
    if (!text) return;
    const response = await apiFetch(`/api/posts/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (!response.ok) return toast.error("Could not add feedback.");
    setComment("");
    await load();
  }

  async function markPosted() {
    if (!data) return;
    const urls = Object.fromEntries(Object.entries(urlDraft).filter(([, value]) => value.trim()));
    if (!await patchPost({ status: "posted", postedAt: new Date().toISOString(), postUrls: urls }, "Marked posted.")) return;
    setPostedOpen(false);
  }

  async function saveAnalytics() {
    if (!data) return;
    const analytics = Object.fromEntries(Object.entries(analyticsDraft).map(([platform, metrics]) => [platform, Object.fromEntries(Object.entries(metrics).filter(([,value]) => value !== "").map(([key,value]) => [key, Number(value)]))]));
    await patchPost({ analytics }, "Analytics saved.");
  }

  if (!data) return <div className="space-y-4" aria-label="Loading post"><div className="h-12 animate-pulse rounded bg-secondary" /><div className="h-80 animate-pulse rounded border border-border bg-card" /></div>;
  const compare = params.get("compare")?.split(",").map(Number) ?? [];
  const artworkTask = tasks.find((task) => task.id === data.artworkTaskId);
  const captionTask = tasks.find((task) => task.id === data.captionTaskId);
  return <div className="space-y-5">
    <nav className="text-sm text-muted-foreground"><Link href="/creatives" className="hover:text-primary">Creatives</Link> / {data.title}</nav>
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-semibold">{data.title}</h1><p className="mt-1 text-sm text-muted-foreground">{POST_TYPE_LABELS[data.type]}{data.event && <> · <Link className="text-primary hover:underline" href={`/events/${data.event.slug}?tab=posts`}>{data.event.name}</Link></>}</p></div>
      <div className="flex gap-2"><a href={`/api/posts/${id}/kit`} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[6px] border border-border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary"><DownloadIcon size={14} />Posting kit</a><Button onClick={() => setPostedOpen((value) => !value)}>Mark posted</Button></div>
    </header>
    {data.event && guard && <div role="alert" className="flex gap-2 rounded border border-attention/50 bg-attention/10 p-3 text-sm text-attention"><AlertIcon size={16} />{guard}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <main className="space-y-5">
        <section className="space-y-3 rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Artwork</h2><label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border px-3 py-2 text-xs hover:bg-secondary"><PlusIcon size={14} />Upload asset<input className="sr-only" type="file" accept="image/*,video/mp4" onChange={(event) => void chooseAsset(event.target.files?.[0])} /></label></div>
          {compare.length === 2 && <p className="text-xs text-muted-foreground">Comparing versions {compare[0]} and {compare[1]} · <button className="text-primary underline" onClick={() => router.replace(`/creatives/${id}`)}>Clear comparison</button></p>}
          {assetVersions.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{assetVersions.map((version) => {
            const group = data.assets.filter((asset) => asset.version === version);
            if (compare.length === 2 && !compare.includes(version)) return null;
            return <article key={version} className="rounded border border-border p-3">
              <header className="mb-2 flex items-center justify-between text-sm"><strong>Version {version}</strong>{group.some((asset) => asset.isFinal) ? <span className="text-success">Final</span> : <Button size="sm" variant="outline" onClick={async () => { const response = await apiFetch(`/api/posts/${id}/assets/${group[0].id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFinal: true }) }); if (response.ok) await load(); }}>Mark final</Button>}</header>
              <div className="space-y-2">{group.map((asset) => <div key={asset.id} className="relative">
                {asset.file.mime.startsWith("image/") ? <img alt={asset.file.originalName} src={`/api/files/${asset.file.id}/content`} className="max-h-80 w-full rounded object-contain" /> : <video controls className="max-h-80 w-full"><source src={`/api/files/${asset.file.id}/content`} type={asset.file.mime} /></video>}
                {asset.width && asset.height && data.platforms.map((platform) => ratioWarning(asset.width!, asset.height!, platform as PostPlatform, platform === "instagram" ? "story" : "feed")).filter(Boolean).map((warning) => <span key={warning} className="mr-1 inline-block rounded bg-attention/10 px-1.5 py-0.5 text-[10px] text-attention">{warning}</span>)}
              </div>)}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">{assetVersions.filter((item) => item !== version).map((other) => <button key={other} className="text-primary underline" onClick={() => router.replace(`/creatives/${id}?compare=${version},${other}`)}>Compare v{other}</button>)}</div>
            </article>;
          })}</div> : <p className="rounded border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Upload artwork, or generate an event starter.</p>}
          {data.event && <div className="grid gap-2 rounded border border-border bg-secondary/20 p-3 md:grid-cols-[180px_1fr_auto]">
            <Select value={generator} onValueChange={setGenerator}><SelectTrigger><span>{generator[0].toUpperCase() + generator.slice(1)} generator</span></SelectTrigger><SelectContent>{["countdown","highlight","poster"].map((item) => <SelectItem key={item} value={item}>{item[0].toUpperCase()+item.slice(1)}</SelectItem>)}</SelectContent></Select>
            {generator === "highlight" && <div className="col-span-full grid grid-cols-2 gap-2 sm:grid-cols-4">{photos.map((photo) => <label key={photo.id} className="flex items-center gap-1 truncate text-[10px]"><Checkbox checked={selectedPhotoIds.includes(photo.id)} onCheckedChange={(checked) => setSelectedPhotoIds((current) => checked ? [...current, photo.id].slice(-9) : current.filter((value) => value !== photo.id))} />{photo.originalName}</label>)}</div>}
            <Button variant="outline" onClick={() => { const query = new URLSearchParams({ kind: generator, eventId: data.event!.id, days: "3", size: "1080x1350" }); if (generator === "highlight") query.set("photoIds", selectedPhotoIds.join(",")); setGeneratorUrl(`/api/creatives/render?${query}`); }}>Preview render</Button>
            <Button disabled={!generatorUrl} onClick={() => void saveGeneratedAsset()}>Save as asset</Button>
            {generatorUrl && <img alt={`${generator} preview`} src={generatorUrl} className="col-span-full max-h-64 justify-self-start rounded border border-border" />}
          </div>}
        </section>
        <section className="space-y-3 rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Caption</h2><div className="flex gap-1">{["base", ...data.platforms].map((platform) => <Button key={platform} size="sm" variant={tab === platform ? "default" : "outline"} onClick={() => { setTab(platform); const query = new URLSearchParams(params.toString()); query.set("platform", platform); router.replace(`/creatives/${id}?${query.toString()}`); setDraft(latestCaptions.get(platform)?.body ?? ""); setAiPreview(""); }}>{platform === "base" ? "Base" : POST_PLATFORM_LABELS[platform]}</Button>)}</div></div>
          {tab !== "base" && length && <div className={`text-xs ${length.over ? "text-destructive" : "text-muted-foreground"}`}>{length.length} / {length.limit}{tab === "instagram" && ` · ${length.hashtagCount} / 30 hashtags`}</div>}
          {unicodeStyledWarning(draft) && <p role="alert" className="text-xs text-attention">Fancy Unicode characters may not be accessible to screen readers.</p>}
          <Textarea rows={8} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a caption…" />
          <div className="flex flex-wrap gap-2">
            <Select value="" onValueChange={(id) => { const value = library.templates.find((item) => item.id === id); if (value) setDraft(value.body); }}><SelectTrigger className="w-48"><span>Insert template</span></SelectTrigger><SelectContent>{library.templates.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
            <Select value="" onValueChange={(id) => { const value = library.hashtags.find((item) => item.id === id); if (value) setDraft((current) => `${current}${current ? "\n\n" : ""}${value.tags.join(" ")}`); }}><SelectTrigger className="w-40"><span>Hashtag set</span></SelectTrigger><SelectContent>{library.hashtags.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
            <Select value="" onValueChange={(id) => { const value = library.mentions.find((item) => item.id === id); if (value) setDraft((current) => `${current}${current ? " " : ""}${value.handles.join(" ")}`); }}><SelectTrigger className="w-40"><span>Mention list</span></SelectTrigger><SelectContent>{library.mentions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
            {canAi && <><Button size="sm" variant="outline" onClick={() => void askAi("draft")}>AI Draft</Button><Button size="sm" variant="outline" onClick={() => void askAi("rewrite")}>Rewrite</Button>{tab !== "base" && <Button size="sm" variant="outline" onClick={() => void askAi("shorten")}>Shorten</Button>}<Button size="sm" variant="outline" onClick={() => void askAi("hashtags")}>Suggest hashtags</Button></>}
          </div>
          {aiPreview && <div className="space-y-2 rounded border border-primary/40 bg-primary/5 p-3"><p className="whitespace-pre-wrap text-sm">{aiPreview}</p><div className="flex gap-2"><Button size="sm" onClick={() => { const accepted = aiPreview; setDraft(accepted); setAiPreview(""); void saveCaptionContent(accepted); }}>Accept & save version</Button><Button size="sm" variant="ghost" onClick={() => setAiPreview("")}>Dismiss</Button></div></div>}
          {data.captions.some((caption) => caption.platform === tab) && <details className="rounded border border-border px-3 py-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Version history ({data.captions.filter((caption) => caption.platform === tab).length})</summary><div className="mt-2 space-y-2">{data.captions.filter((caption) => caption.platform === tab).slice().sort((a,b) => b.version-a.version).map((caption) => <div key={caption.id} className="flex items-center justify-between gap-2"><span>v{caption.version} · {CAPTION_STATUS_LABELS[caption.status]}</span><Button size="sm" variant="outline" onClick={() => { setDraft(caption.body); void saveCaptionContent(caption.body); }}>Restore as new version</Button></div>)}</div></details>}
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{currentCaption ? `Latest version ${currentCaption.version} · ${CAPTION_STATUS_LABELS[currentCaption.status]}` : "New caption"}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void saveCaption()}>Save version</Button>{tab !== "base" && <Button size="sm" disabled={Boolean(length?.over || length?.hashtagOver)} onClick={() => void approveCaption()}><CheckCircleIcon size={14} />Approve caption</Button>}</div></div>
        </section>
        {data.status === "posted" && <section className="rounded-md border border-border bg-card p-4"><h2 className="font-semibold">Analytics</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{data.platforms.map((platform) => <div key={platform} className="rounded border border-border p-3"><h3 className="mb-2 text-sm font-medium">{POST_PLATFORM_LABELS[platform]}</h3><div className="grid grid-cols-2 gap-2">{["reach","reactions","comments","shares"].map((metric) => <Input key={metric} type="number" min="0" aria-label={`${platform} ${metric}`} placeholder={metric} value={analyticsDraft[platform]?.[metric] ?? String(data.analytics?.[platform]?.[metric] ?? "")} onChange={(event) => setAnalyticsDraft((current) => ({ ...current, [platform]: { ...current[platform], [metric]: event.target.value } }))} />)}</div></div>)}</div><Button className="mt-3" onClick={() => void saveAnalytics()}>Save analytics</Button></section>}
        <section className="rounded-md border border-border bg-card p-4"><h2 className="font-semibold">Feedback & activity</h2><div className="mt-3 flex gap-2"><Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Leave feedback…" /><Button disabled={!comment.trim()} onClick={() => void submitComment()}>Comment</Button></div><ol className="mt-4 space-y-3">{data.activity.slice().reverse().map((item) => <li key={item.id} className="border-l-2 border-border pl-3"><p className="text-sm">{item.body || item.kind}</p><p className="text-xs text-muted-foreground"><RelativeDate date={item.at} /></p></li>)}</ol></section>
      </main>
      <aside className="space-y-4 rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">Post details</h2>
        <label className="block space-y-1 text-xs text-muted-foreground">Status<Select value={data.status} onValueChange={(status) => void patchPost({ status })}><SelectTrigger><span>{POST_STATUS_LABELS[data.status]}</span></SelectTrigger><SelectContent>{Object.entries(POST_STATUS_LABELS).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Scheduled date<DatePicker value={data.scheduledAt ? new Date(data.scheduledAt) : null} onChange={(date) => { if (!date) return; const value = new TZDate(date, MANILA_TIME_ZONE); const [hour, minute] = scheduledTime.split(":").map(Number); value.setHours(hour, minute, 0, 0); void patchPost({ scheduledAt: new Date(value).toISOString() }); }} /></label>
        <label className="block space-y-1 text-xs text-muted-foreground">Time (Manila)<Input value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} onBlur={() => { if (!data.scheduledAt) return; const value = new TZDate(data.scheduledAt, MANILA_TIME_ZONE); const [hour, minute] = scheduledTime.split(":").map(Number); if (Number.isFinite(hour) && Number.isFinite(minute)) { value.setHours(hour, minute, 0, 0); void patchPost({ scheduledAt: new Date(value).toISOString() }); } }} /></label>
        <div className="space-y-2"><p className="text-xs text-muted-foreground">Platforms</p>{Object.entries(POST_PLATFORM_LABELS).map(([platform,label]) => <label key={platform} className="flex items-center gap-2 text-sm"><Checkbox checked={data.platforms.includes(platform)} onCheckedChange={(checked) => { const platforms = checked ? [...data.platforms, platform] : data.platforms.filter((value) => value !== platform); void patchPost({ platforms }); }} />{label}</label>)}</div>
        <label className="flex items-center justify-between gap-2 border-t border-border pt-3 text-sm"><span>Brandbook checked <span title="University Brandbook · Marketing Office" className="text-muted-foreground">ⓘ</span></span><Switch checked={data.brandChecked} onCheckedChange={(brandChecked) => void patchPost({ brandChecked })} /></label>
        <div className="space-y-1 border-t border-border pt-3 text-xs"><p className="font-medium">Approval readiness</p>{data.approval.ok ? <p className="text-success">Ready to approve</p> : <ul className="list-disc pl-4 text-muted-foreground">{data.approval.missing.map((item) => <li key={item}>{item}</li>)}</ul>}<Button size="sm" className="mt-2 w-full" disabled={!data.approval.ok} title={data.approval.ok ? "Approve post" : `Missing: ${data.approval.missing.join(", ")}`} onClick={() => void patchPost({ status: "approved" })}>Approve post</Button></div>
        <div className="space-y-2 border-t border-border pt-3 text-xs"><p className="font-medium">Owners</p>{(["artistMemberId","writerMemberId","reviewerMemberId"] as const).map((key) => <label key={key} className="block space-y-1 capitalize text-muted-foreground">{key.replace("MemberId","")}<Select value={data[key] ?? "none"} onValueChange={(memberId) => void patchPost({ [key]: memberId === "none" ? null : memberId })}><SelectTrigger><span>{members.find((member) => member.id === data[key])?.name ?? "Unassigned"}</span></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></label>)}</div>
        <div className="space-y-2 border-t border-border pt-3 text-xs"><p className="font-medium">Linked tasks</p>{data.artworkTaskId && <Link className="block text-primary underline" href={artworkTask ? `/tasks/${artworkTask.number}` : "/tasks"}>{artworkTask ? `#${artworkTask.number} · Artwork` : "Artwork task"}</Link>}{data.captionTaskId && <Link className="block text-primary underline" href={captionTask ? `/tasks/${captionTask.number}` : "/tasks"}>{captionTask ? `#${captionTask.number} · Caption` : "Caption task"}</Link>}{!data.artworkTaskId && !data.captionTaskId && <span className="text-muted-foreground">No linked tasks</span>}</div>
        {data.event && <Link href={`/events/${data.event.slug}?tab=posts`} className="block border-t border-border pt-3 text-sm text-primary hover:underline">{data.event.name}</Link>}
        {postedOpen && <div className="space-y-2 border-t border-border pt-3"><p className="text-sm font-medium">Posted URLs</p>{data.platforms.map((platform) => <Input key={platform} aria-label={`${POST_PLATFORM_LABELS[platform]} post URL`} placeholder={`${POST_PLATFORM_LABELS[platform]} URL`} value={urlDraft[platform] ?? ""} onChange={(event) => setUrlDraft((current) => ({ ...current, [platform]: event.target.value }))} />)}<Button size="sm" className="w-full" onClick={() => void markPosted()}>Save posted state</Button></div>}
      </aside>
    </div>
  </div>;
}
