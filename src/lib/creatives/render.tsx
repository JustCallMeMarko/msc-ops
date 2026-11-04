import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export type RenderInput = {
  kind: "countdown" | "highlight" | "poster";
  title: string;
  eventName: string;
  date: string;
  venue: string;
  days: number;
  lumaQr?: string;
  photos?: string[];
  attendance: number;
  target: number;
  logo?: string;
  frame?: string;
  headingFont?: Uint8Array;
  bodyFont?: Uint8Array;
  width: number;
  height: number;
  colors: { primary: string; secondary: string; accent: string; background: string; text: string };
};

export async function loadAdditionalAsset(name: string): Promise<string> {
  const file = path.join(process.cwd(), "assets", "twemoji", `${name}.svg`);
  const bytes = await readFile(file);
  return `data:image/svg+xml;base64,${bytes.toString("base64")}`;
}

function titleWithLocalEmoji(text: string, emoji?: string) {
  const parts = text.split("🎉");
  return parts.flatMap((part, index) => [
    ...(part ? [{ type: "text" as const, text: part }] : []),
    ...(index < parts.length - 1 ? [{ type: "emoji" as const, src: emoji ?? "" }] : []),
  ]).map((part, index) => part.type === "emoji"
    ? <img key={index} src={part.src} width={70} height={70} />
    : <span key={index}>{part.text}</span>);
}

export async function renderCreativeImage(input: RenderInput): Promise<ImageResponse> {
  const [regular, bold, emoji] = await Promise.all([
    readFile(path.join(process.cwd(), "assets", "fonts", "Inter-Regular.ttf")),
    readFile(path.join(process.cwd(), "assets", "fonts", "Inter-Bold.ttf")),
    input.title.includes("🎉") || input.eventName.includes("🎉") ? loadAdditionalAsset("1f389") : Promise.resolve(undefined),
  ]);
  const heading = titleWithLocalEmoji(input.title, emoji);
  const photos = input.photos ?? [];
  const grid = input.kind === "highlight"
    ? input.photos!.map((src, index) => <img key={index} src={src} style={{ width: photos.length === 4 ? "49%" : "32%", height: photos.length === 4 || photos.length === 6 ? "49%" : "32%", objectFit: "cover" }} />)
    : [];
  const background = input.kind === "highlight"
    ? <div style={{ position: "absolute", inset: 0, display: "flex", flexWrap: "wrap", gap: 8, opacity: 0.52 }}>{grid}</div>
    : null;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: input.colors.background, color: input.colors.text, fontFamily: "Inter" }}>
      {background}
      {input.frame && <img src={input.frame} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "relative", zIndex: 1 }}>
        {input.logo && <img src={input.logo} style={{ width: 150, height: 120, objectFit: "contain" }} />}
        {input.kind === "countdown" && <div style={{ display: "flex", color: input.colors.accent, fontSize: 42, fontWeight: 700 }}>{input.days} DAYS TO GO</div>}
        {input.kind === "poster" && <div style={{ color: input.colors.accent, fontSize: 36, fontWeight: 700 }}>YOU’RE INVITED</div>}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", color: input.colors.primary, fontSize: 86, fontWeight: 700, lineHeight: 1.05 }}>{heading}</div>
        {input.title !== input.eventName && <div style={{ display: "flex", flexWrap: "wrap", color: input.colors.secondary, fontSize: 36 }}>{titleWithLocalEmoji(input.eventName, emoji)}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 28 }}>
          <div>{input.date}</div><div>{input.venue}</div>
          {input.kind === "highlight" && <div style={{ color: input.colors.accent }}>{input.attendance}/{input.target} attendees</div>}
        </div>
      </div>
      {input.lumaQr && <img src={input.lumaQr} style={{ position: "absolute", right: 70, bottom: 70, width: 160, height: 160, background: "white", padding: 8 }} />}
      <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", fontSize: 18, opacity: 0.75 }}><span>MSC · NU Dasmariñas</span><span>{POST_KIND_LABEL[input.kind]}</span></div>
    </div>,
    {
      width: input.width, height: input.height,
      fonts: [
        { name: "Inter", data: Buffer.from(input.bodyFont ?? regular), weight: 400, style: "normal" },
        { name: "Inter", data: Buffer.from(input.headingFont ?? bold), weight: 700, style: "normal" },
      ],
    },
  );
}

const POST_KIND_LABEL = { countdown: "COUNTDOWN", highlight: "EVENT HIGHLIGHTS", poster: "EVENT POSTER" } as const;
