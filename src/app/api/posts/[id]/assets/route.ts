import { imageSize } from "image-size";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { fileLinks, files, postActivity, postAssets, posts } from "@/lib/db/schema";
import { storeFileBlob } from "@/lib/files/storage";
import { FileValidationError, validateFileContent } from "@/lib/files/validation";
import { storeCreativeVideoStream } from "@/lib/creatives/stream-upload";

type Context = { params: Promise<{ id: string }> };
const MAX_IMAGE_REQUEST_BYTES = 26 * 1024 * 1024;
function safeOriginalName(value: string) {
  return value.replaceAll("\\", "/").split("/").at(-1)?.slice(0, 255) || "creative-upload";
}

async function boundedFormData(request: Request): Promise<FormData> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_REQUEST_BYTES) throw new Error("Image upload request exceeds the 26 MB limit.");
  if (!request.body) throw new Error("Upload request is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("Image upload request exceeds the 26 MB limit.");
    }
    chunks.push(value);
  }
  return new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData();
}

async function addAsset(
  postId: string,
  data: { sha256: string; size: number; name: string; mime: string; width?: number; height?: number; durationSec?: number; slideIndex?: number; note?: string },
) {
  const { db } = await getDb();
  let [file] = await db.select().from(files).where(and(eq(files.sha256, data.sha256), isNull(files.deletedAt))).limit(1);
  if (!file) {
    [file] = await db.insert(files).values({
      sha256: data.sha256, originalName: safeOriginalName(data.name), mime: data.mime,
      size: data.size, kind: "creative",
    }).returning();
  }
  const [version] = await db.select({ value: sql<number>`coalesce(max(${postAssets.version}), 0) + 1` })
    .from(postAssets).where(and(eq(postAssets.postId, postId), isNull(postAssets.deletedAt)));
  const [asset] = await db.insert(postAssets).values({
    postId, fileId: file.id, version: version?.value ?? 1,
    width: data.width ?? null, height: data.height ?? null,
    durationSec: data.durationSec ?? null, slideIndex: data.slideIndex ?? 0, note: data.note ?? "",
  }).returning();
  await db.insert(fileLinks).values({ fileId: file.id, entityType: "post", entityId: postId, role: "creative" }).onConflictDoNothing();
  await db.insert(postActivity).values({
    postId, kind: "asset_upload", body: `Uploaded ${file.originalName} (v${asset.version})`,
    meta: { assetId: asset.id, version: asset.version }, at: now(),
  });
  return { ...asset, file };
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [post] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const dataDir = await getDataDir();
  if (request.headers.get("content-type")?.startsWith("video/mp4")) {
    try {
      const result = await storeCreativeVideoStream(request, dataDir);
      const name = decodeURIComponent(request.headers.get("x-file-name") ?? "creative-video.mp4");
      const asset = await addAsset(id, {
        ...result, name, mime: "video/mp4",
        width: Number(request.headers.get("x-width")) || undefined,
        height: Number(request.headers.get("x-height")) || undefined,
        durationSec: Number(request.headers.get("x-duration-sec")) || undefined,
      });
      return NextResponse.json(asset, { status: 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not store video." }, { status: 415 });
    }
  }
  let form: FormData;
  try { form = await boundedFormData(request); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Choose an image or video to upload." }, { status: 413 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Images must be 25 MB or smaller." }, { status: 413 });
  try {
    const validated = await validateFileContent(new Uint8Array(await file.arrayBuffer()), file.name);
    if (!validated.mime.startsWith("image/")) return NextResponse.json({ error: "Creative uploads must be images or MP4 video." }, { status: 415 });
    const dimensions = imageSize(Buffer.from(validated.bytes));
    const sha256 = await storeFileBlob(dataDir, validated.bytes);
    const asset = await addAsset(id, {
      sha256, size: validated.bytes.byteLength, name: file.name, mime: validated.mime,
      width: dimensions.width || Number(form.get("width")) || undefined,
      height: dimensions.height || Number(form.get("height")) || undefined,
      slideIndex: Number(form.get("slideIndex")) || 0, note: String(form.get("note") ?? ""),
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    const message = error instanceof FileValidationError || error instanceof Error ? error.message : "Could not validate upload.";
    return NextResponse.json({ error: message }, { status: error instanceof FileValidationError ? 415 : 400 });
  }
}
