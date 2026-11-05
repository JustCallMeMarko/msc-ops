import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { attendees } from "@/lib/db/schema";
import { eventByRef } from "@/lib/events/db-utils";
import { syncParticipantActual } from "@/lib/events/attendees";
import { parseLumaCsv } from "@/lib/events/logic";
import { POST as uploadFile } from "@/app/api/files/route";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const { db } = await getDb();
  const event = await eventByRef(db, id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  let text = "";
  let file: File | null = null;
  if (request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const input = form.get("file");
    file = input instanceof File ? input : null;
    if (file && file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "CSV files may not exceed 25 MB." }, { status: 413 });
    }
    text = file ? await file.text() : String(form.get("text") ?? "");
  } else {
    if (Number(request.headers.get("content-length") ?? 0) > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "CSV files may not exceed 25 MB." }, { status: 413 });
    }
    text = await request.text();
  }
  if (new TextEncoder().encode(text).byteLength > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "CSV files may not exceed 25 MB." }, { status: 413 });
  }
  const preview = parseLumaCsv(text);
  let storedFile: unknown;
  if (file) {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", "import");
    form.append("entityType", "event");
    form.append("entityId", event.id);
    form.append("role", "attendee_import");
    const response = await uploadFile(new Request("http://localhost/api/files", { method: "POST", body: form }));
    if (!response.ok) return NextResponse.json(await response.json(), { status: response.status });
    storedFile = await response.json();
  }
  if (new URL(request.url).searchParams.get("commit") !== "1") {
    return NextResponse.json({ ...preview, committed: false, file: storedFile });
  }

  const currentTime = now();
  let inserted = 0;
  let updated = 0;
  for (const row of preview.rows) {
    const email = row.email || null;
    const conditions = [
      eq(attendees.eventId, event.id), isNull(attendees.deletedAt),
      email ? sql`lower(${attendees.email}) = lower(${email})` : sql`lower(${attendees.name}) = lower(${row.name})`,
    ];
    const [existing] = await db.select().from(attendees).where(and(...conditions)).limit(1);
    if (existing) {
      await db.update(attendees).set({
        name: row.name, email, checkedIn: row.checkedIn, source: "luma_csv", updatedAt: currentTime,
      }).where(eq(attendees.id, existing.id));
      updated += 1;
    } else {
      await db.insert(attendees).values({
        eventId: event.id, name: row.name, email, checkedIn: row.checkedIn, source: "luma_csv",
      });
      inserted += 1;
    }
  }
  const participantActual = await syncParticipantActual(db, event.id, currentTime);
  return NextResponse.json({
    ...preview, committed: true, inserted, updated, participantActual, file: storedFile,
  });
}
