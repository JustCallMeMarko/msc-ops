import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { files } from "@/lib/db/schema";
import { readFileBlob } from "@/lib/files/storage";

type Context = { params: Promise<{ id: string }> };

function safeFilename(name: string): { fallback: string; encoded: string } {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").slice(0, 180) || "download";
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return { fallback, encoded };
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!file || file.deletedAt) return NextResponse.json({ error: "File not found." }, { status: 404 });
  let bytes: Uint8Array;
  try {
    bytes = await readFileBlob(await getDataDir(), file.sha256);
  } catch {
    return NextResponse.json({ error: "File content is unavailable." }, { status: 404 });
  }
  const inline = file.mime === "application/pdf" || ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mime);
  const filename = safeFilename(file.originalName);
  const responseBytes = new Uint8Array(bytes.byteLength);
  responseBytes.set(bytes);
  return new Response(responseBytes.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.fallback}"; filename*=UTF-8''${filename.encoded}`,
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
