import { and, arrayContains, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { events, fileLinks, files, tasks } from "@/lib/db/schema";
import { FileValidationError, validateFileContent } from "@/lib/files/validation";
import { storeFileBlob } from "@/lib/files/storage";
import { enumLabel } from "@/lib/ui-labels";

export const dynamic = "force-dynamic";
const maxRequestSize = 201 * 1024 * 1024;
const defaultFileSize = 25 * 1024 * 1024;
const videoFileSize = 200 * 1024 * 1024;
const uploadMeta = z.object({
  kind: z.enum(["manual", "cbl", "template", "generated", "receipt", "creative", "event_photo", "import", "other"]).default("other"),
  source: z.enum(["sdao", "scoa", "org", "other"]).nullable().optional(),
  entityType: z.string().min(1).max(40).optional(),
  entityId: z.string().uuid().optional(),
  role: z.string().min(1).max(40).optional(),
});

async function readBoundedForm(request: Request): Promise<FormData> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxRequestSize) throw new FileValidationError("Upload request exceeds the 201 MB request limit.");
  if (!request.body) throw new FileValidationError("Upload request is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxRequestSize) {
      await reader.cancel();
      throw new FileValidationError("Upload request exceeds the 201 MB request limit.");
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body,
  }).formData();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const source = url.searchParams.get("source");
  const eventSlug = url.searchParams.get("event");
  const tag = url.searchParams.get("tag");
  const query = url.searchParams.get("q")?.trim();
  const { db } = await getDb();
  const conditions = [isNull(files.deletedAt)];
  if (kind) conditions.push(eq(files.kind, kind));
  if (source) conditions.push(eq(files.source, source));
  if (tag) conditions.push(arrayContains(files.tags, [tag]));
  if (query) conditions.push(or(ilike(files.originalName, `%${query}%`), ilike(files.caption, `%${query}%`))!);
  if (eventSlug) {
    const [event] = await db.select({ id: events.id }).from(events).where(and(eq(events.slug, eventSlug), isNull(events.deletedAt))).limit(1);
    if (!event) return NextResponse.json({ files: [], usage: {} });
    const linked = await db.select({ fileId: fileLinks.fileId }).from(fileLinks)
      .where(and(eq(fileLinks.entityType, "event"), eq(fileLinks.entityId, event.id), isNull(fileLinks.deletedAt)));
    conditions.push(inArray(files.id, linked.map((item) => item.fileId)));
  }
  const rows = await db.select().from(files).where(and(...conditions)).orderBy(files.createdAt);
  const links = rows.length
    ? await db.select().from(fileLinks).where(and(inArray(fileLinks.fileId, rows.map((row) => row.id)), isNull(fileLinks.deletedAt)))
    : [];
  const eventIds = [...new Set(links.filter((link) => link.entityType === "event").map((link) => link.entityId))];
  const taskIds = [...new Set(links.filter((link) => link.entityType === "task").map((link) => link.entityId))];
  const linkedEvents = eventIds.length
    ? await db.select({ id: events.id, name: events.name, slug: events.slug }).from(events)
      .where(and(inArray(events.id, eventIds), isNull(events.deletedAt)))
    : [];
  const linkedTasks = taskIds.length
    ? await db.select({ id: tasks.id, number: tasks.number, title: tasks.title }).from(tasks)
      .where(and(inArray(tasks.id, taskIds), isNull(tasks.deletedAt)))
    : [];
  const eventById = new Map(linkedEvents.map((event) => [event.id, event]));
  const taskById = new Map(linkedTasks.map((task) => [task.id, task]));
  const usage: Record<string, { count: number; bytes: number }> = {};
  for (const row of await db.select({ kind: files.kind, size: files.size }).from(files).where(isNull(files.deletedAt))) {
    usage[row.kind] ??= { count: 0, bytes: 0 };
    usage[row.kind].count += 1;
    usage[row.kind].bytes += row.size;
  }
  return NextResponse.json({ files: rows.map((row) => ({
    ...row,
    links: links.filter((link) => link.fileId === row.id).map((link) => {
      const event = link.entityType === "event" ? eventById.get(link.entityId) : undefined;
      const task = link.entityType === "task" ? taskById.get(link.entityId) : undefined;
      return {
        ...link,
        label: event?.name ?? (task ? `#${task.number} ${task.title}` : enumLabel(link.entityType)),
        href: event
          ? `/events/${event.slug}?tab=${link.role === "photo" ? "photos" : "files"}`
          : task ? `/tasks/${task.number}` : null,
      };
    }),
  })), usage });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await readBoundedForm(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid upload request." }, { status: 413 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  const metaParsed = uploadMeta.safeParse({
    kind: form.get("kind") ?? "other",
    source: form.get("source") || undefined,
    entityType: form.get("entityType") || undefined,
    entityId: form.get("entityId") || undefined,
    role: form.get("role") || undefined,
  });
  if (!metaParsed.success) return NextResponse.json({ error: metaParsed.error.flatten() }, { status: 400 });
  const meta = metaParsed.data;
  if (Boolean(meta.entityType) !== Boolean(meta.entityId)) {
    return NextResponse.json({ error: "Both entityType and entityId are required to link an upload." }, { status: 400 });
  }
  const inputBytes = new Uint8Array(await file.arrayBuffer());
  let validated: { bytes: Uint8Array; mime: string };
  try {
    validated = await validateFileContent(inputBytes, file.name);
  } catch (error) {
    const message = error instanceof FileValidationError ? error.message : "Could not validate file content.";
    return NextResponse.json({ error: message }, { status: 415 });
  }
  const maxFileSize = validated.mime === "video/mp4" ? videoFileSize : defaultFileSize;
  if (validated.bytes.byteLength > maxFileSize) {
    return NextResponse.json({
      error: validated.mime === "video/mp4" ? "MP4 files must be 200 MB or smaller." : "Files must be 25 MB or smaller.",
    }, { status: 413 });
  }

  const dataDir = await getDataDir();
  const sha256 = await storeFileBlob(dataDir, validated.bytes);
  const { db } = await getDb();
  let [row] = await db.select().from(files).where(and(eq(files.sha256, sha256), isNull(files.deletedAt))).limit(1);
  const reused = Boolean(row);
  if (!row) {
    [row] = await db.insert(files).values({
      sha256,
      originalName: file.name.split(/[\\/]/).at(-1)?.slice(0, 255) || "upload",
      mime: validated.mime,
      size: validated.bytes.byteLength,
      kind: meta.kind,
      source: meta.source ?? null,
    }).returning();
  }
  if (row && meta.entityType && meta.entityId) {
    await db.insert(fileLinks).values({
      fileId: row.id,
      entityType: meta.entityType,
      entityId: meta.entityId,
      role: meta.role ?? "attachment",
    }).onConflictDoNothing();
  }
  return NextResponse.json({ ...row, reused }, { status: reused ? 200 : 201 });
}
