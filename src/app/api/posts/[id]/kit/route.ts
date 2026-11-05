import JSZip from "jszip";
import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { captions, files, postAssets, posts } from "@/lib/db/schema";
import { readFileBlob } from "@/lib/files/storage";

function safeName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "post";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [post] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt))).limit(1);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const assets = await db.select({ asset: postAssets, file: files }).from(postAssets)
    .innerJoin(files, eq(files.id, postAssets.fileId))
    .where(and(eq(postAssets.postId, id), eq(postAssets.isFinal, true), isNull(postAssets.deletedAt), isNull(files.deletedAt)))
    .orderBy(asc(postAssets.slideIndex));
  const captionsRows = await db.select().from(captions)
    .where(and(eq(captions.postId, id), isNull(captions.deletedAt))).orderBy(captions.version);
  const latest = new Map<string, typeof captionsRows[number]>();
  for (const caption of captionsRows) if (!latest.has(caption.platform) || latest.get(caption.platform)!.version < caption.version) latest.set(caption.platform, caption);
  const zip = new JSZip();
  const dataDir = await getDataDir();
  assets.forEach(({ file }, index) => {
    zip.file(`${String(index + 1).padStart(2, "0")}-${safeName(file.originalName)}`, readFileBlob(dataDir, file.sha256));
  });
  for (const platform of post.platforms) {
    const caption = latest.get(platform) ?? latest.get("base");
    if (caption) zip.file(`caption-${platform}.txt`, caption.body);
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName(post.title)}-posting-kit.zip"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
