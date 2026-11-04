import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import QRCode from "qrcode";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { fileLinks, files } from "@/lib/db/schema";
import { eventByRef } from "@/lib/events/db-utils";
import { getSetting } from "@/lib/settings";
import { readFileBlob } from "@/lib/files/storage";
import { MANILA_TIME_ZONE } from "@/lib/tasks/logic";
import { renderCreativeImage, type RenderInput } from "@/lib/creatives/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const sizes: Record<string, [number, number]> = {
  "1080x1350": [1080, 1350], "1080x1080": [1080, 1080],
  "1080x1920": [1080, 1920], "1200x630": [1200, 630],
};
const dataUri = (mime: string, bytes: Uint8Array) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const eventId = url.searchParams.get("eventId");
  const size = sizes[url.searchParams.get("size") ?? "1080x1350"];
  if (!size || !["countdown", "highlight", "poster"].includes(kind ?? "") || !eventId) {
    return NextResponse.json({ error: "Provide a valid kind, eventId, and size." }, { status: 400 });
  }
  const { db } = await getDb();
  const event = await eventByRef(db, eventId);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const brand = await getSetting("brand.kit");
  const dataDir = await getDataDir();
  const readAsset = async (id?: string) => {
    if (!id) return undefined;
    const [file] = await db.select().from(files).where(and(eq(files.id, id), isNull(files.deletedAt))).limit(1);
    if (!file) return undefined;
    const bytes = await readFileBlob(dataDir, file.sha256);
    return { uri: dataUri(file.mime, bytes), bytes };
  };
  const [logo, frame, headingFont, bodyFont] = await Promise.all([
    readAsset(brand.logoFileId), readAsset(brand.frameFileId),
    readAsset(brand.headingFontFileId), readAsset(brand.bodyFontFileId),
  ]);
  const photoIds = (url.searchParams.get("photoIds") ?? "").split(",").filter(Boolean).slice(0, 9);
  let photos: string[] = [];
  if (photoIds.length) {
    const linked = await db.select({ file: files }).from(fileLinks).innerJoin(files, eq(files.id, fileLinks.fileId))
      .where(and(eq(fileLinks.entityType, "event"), eq(fileLinks.entityId, event.id), eq(fileLinks.role, "photo"), inArray(files.id, photoIds), isNull(fileLinks.deletedAt), isNull(files.deletedAt)));
    photos = await Promise.all(linked.map(async ({ file }) => dataUri(file.mime, await readFileBlob(dataDir, file.sha256))));
  }
  if (kind === "highlight" && (photos.length < 4 || photos.length > 9)) {
    return NextResponse.json({ error: "Highlights require 4–9 linked event photos." }, { status: 400 });
  }
  const qrSvg = event.lumaUrl ? await QRCode.toString(event.lumaUrl, { type: "svg", margin: 0, width: 256 }) : undefined;
  const postDate = format(new TZDate(event.startsAt, MANILA_TIME_ZONE), "EEE, MMM d, yyyy · h:mm a");
  const input: RenderInput = {
    kind: kind as RenderInput["kind"], title: event.name,
    eventName: event.name, date: postDate, venue: event.venue,
    days: Number(url.searchParams.get("days") ?? 3), lumaQr: qrSvg ? dataUri("image/svg+xml", Buffer.from(qrSvg)) : undefined,
    photos, attendance: event.participantActual, target: event.participantTarget,
    logo: logo?.uri, frame: frame?.uri, headingFont: headingFont?.bytes, bodyFont: bodyFont?.bytes,
    width: size[0], height: size[1], colors: brand.colors,
  };
  try {
    const response = await renderCreativeImage(input);
    const bytes = await response.arrayBuffer();
    return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Creative image render failed.", error);
    return NextResponse.json({ error: "Could not render this creative." }, { status: 500 });
  }
}
