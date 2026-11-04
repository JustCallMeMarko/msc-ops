import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { fileLinks, files } from "@/lib/db/schema";
import { eventByRef } from "@/lib/events/db-utils";
import { validateFileContent } from "@/lib/files/validation";
import { POST as uploadFile } from "@/app/api/files/route";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const links = await db.select({ file: files }).from(fileLinks)
    .innerJoin(files, eq(files.id, fileLinks.fileId))
    .where(and(
      eq(fileLinks.entityType, "event"), eq(fileLinks.entityId, event.id),
      eq(fileLinks.role, "photo"), isNull(files.deletedAt),
    ));
  return NextResponse.json(links.map((entry) => entry.file));
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload a photo file." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Upload a photo file." }, { status: 400 });
  let photo: File;
  try {
    const validated = await validateFileContent(new Uint8Array(await file.arrayBuffer()), file.name);
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(validated.mime)) {
      return NextResponse.json({ error: "Event photos must be JPEG, PNG, WebP, or GIF images." }, { status: 400 });
    }
    const safeBytes = new Uint8Array(validated.bytes.byteLength);
    safeBytes.set(validated.bytes);
    photo = new File([safeBytes.buffer as ArrayBuffer], file.name, { type: validated.mime });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid photo file." }, { status: 400 });
  }
  const upload = new FormData();
  upload.append("file", photo);
  upload.append("kind", "event_photo");
  upload.append("entityType", "event");
  upload.append("entityId", event.id);
  upload.append("role", "photo");
  const response = await uploadFile(new Request("http://localhost/api/files", { method: "POST", body: upload }));
  return NextResponse.json(await response.json(), { status: response.status });
}
