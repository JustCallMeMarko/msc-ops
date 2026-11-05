import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { fileLinks, files } from "@/lib/db/schema";
import { eventByRef } from "@/lib/events/db-utils";

type Context = { params: Promise<{ id: string; fileId: string }> };
const captionSchema = z.object({ caption: z.string().max(2000).nullable() });

export async function PATCH(request: Request, context: Context) {
  const parsed = captionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, fileId } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const [link] = await db.select({ id: fileLinks.id }).from(fileLinks)
    .where(and(
      eq(fileLinks.fileId, fileId), eq(fileLinks.entityType, "event"), eq(fileLinks.entityId, event.id),
      eq(fileLinks.role, "photo"),
    )).limit(1);
  if (!link) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const [file] = await db.update(files).set({ caption: parsed.data.caption, updatedAt: now() })
    .where(and(eq(files.id, fileId), isNull(files.deletedAt))).returning();
  return file ? NextResponse.json(file) : NextResponse.json({ error: "Photo not found." }, { status: 404 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id, fileId } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const [link] = await db.select({ id: fileLinks.id }).from(fileLinks)
    .where(and(
      eq(fileLinks.fileId, fileId), eq(fileLinks.entityType, "event"), eq(fileLinks.entityId, event.id),
      eq(fileLinks.role, "photo"),
    )).limit(1);
  if (!link) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const currentTime = now();
  const [file] = await db.update(files).set({ deletedAt: currentTime, updatedAt: currentTime })
    .where(and(eq(files.id, fileId), isNull(files.deletedAt))).returning();
  return file ? NextResponse.json({ ok: true, id: file.id }) : NextResponse.json({ error: "Photo not found." }, { status: 404 });
}
