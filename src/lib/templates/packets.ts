import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import JSZip from "jszip";
import { getDataDir } from "@/lib/data-dir";
import { getDb } from "@/lib/db/client";
import { attendees, events, files, fileLinks, generatedDocs, ledgerEntries, ledgerReceipts, templates } from "@/lib/db/schema";
import { readFileBlob, storeFileBlob } from "@/lib/files/storage";
import { generate } from "./generate";
import type { EntityType, PacketKind, TemplateKind } from "./types";

const packetTemplates: Record<PacketKind, TemplateKind[]> = {
  pre_event: ["activity_proposal", "budget_proposal", "guest_list", "booth_declaration"],
  post_event: ["par", "liquidation"],
  scoa_audit: ["liquidation", "financial_statement"],
  renewal: ["turnover_certificate", "financial_statement"],
};

function csvValue(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function csv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
}

async function addEventAttachments(zip: JSZip, eventId: string, includePhotos: boolean) {
  const { db } = await getDb();
  const [attendeeRows, links] = await Promise.all([
    db.select().from(attendees).where(and(eq(attendees.eventId, eventId), isNull(attendees.deletedAt))),
    db.select().from(fileLinks).where(and(eq(fileLinks.entityType, "event"), eq(fileLinks.entityId, eventId), isNull(fileLinks.deletedAt))),
  ]);
  const content = [["Name", "Email", "Checked in", "Source"], ...attendeeRows.map((row) => [row.name, row.email ?? "", row.checkedIn ? "Yes" : "No", row.source])];
  zip.file("attendance.csv", csv(content));
  if (includePhotos) {
    const ids = links.filter((link) => link.role === "photo" || link.role === "attachment").map((link) => link.fileId);
    const rows = ids.length ? await db.select().from(files).where(and(inArray(files.id, ids), eq(files.kind, "event_photo"), isNull(files.deletedAt))) : [];
    for (const file of rows) {
      zip.file(`photos/${file.originalName.replace(/[\\/:*?"<>|]/g, "_")}`, await readFileBlob(await getDataDir(), file.sha256));
    }
    return { attendeeCount: attendeeRows.length, photoCount: rows.length };
  }
  return { attendeeCount: attendeeRows.length, photoCount: 0 };
}

async function addTermReceipts(zip: JSZip, termStart: string, termEnd: string) {
  const { db } = await getDb();
  const entries = await db.select().from(ledgerEntries).where(and(
    gte(ledgerEntries.occurredOn, termStart),
    lte(ledgerEntries.occurredOn, termEnd),
  ));
  const ids = entries.map((entry) => entry.id);
  const receipts = ids.length ? await db.select({ file: files })
    .from(ledgerReceipts).innerJoin(files, eq(files.id, ledgerReceipts.fileId))
    .where(and(inArray(ledgerReceipts.entryId, ids), isNull(ledgerReceipts.removedAt), isNull(files.deletedAt)))
    : [];
  for (const [index, row] of receipts.entries()) {
    const file = row.file;
    zip.file(`receipts/${index + 1}-${file.originalName.replace(/[\\/:*?"<>|]/g, "_")}`, await readFileBlob(await getDataDir(), file.sha256));
  }
  return receipts.length;
}

export async function createPacket(input: {
  kind: PacketKind;
  entityType: EntityType;
  entityId: string;
  title?: string;
  termStart?: string;
  termEnd?: string;
  askValues?: Record<string, unknown>;
}) {
  const { db } = await getDb();
  const zip = new JSZip();
  const missing: string[] = [];
  const generatedFileIds: string[] = [];
  const generatedDocIds: string[] = [];
  const eventsForTerm = input.kind === "scoa_audit" && input.termStart && input.termEnd
    ? (await db.select().from(events).where(isNull(events.deletedAt)))
      .filter((event) => {
        const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(event.startsAt);
        return date >= input.termStart! && date <= input.termEnd!;
      })
    : [];
  const eventTargets = input.kind === "scoa_audit" ? eventsForTerm : input.entityType === "event"
    ? await db.select().from(events).where(and(eq(events.id, input.entityId), isNull(events.deletedAt))).limit(1)
    : [];
  for (const kind of packetTemplates[input.kind]) {
    const [template] = await db.select().from(templates).where(and(
      eq(templates.kind, kind),
      eq(templates.active, true),
      isNull(templates.deletedAt),
    )).limit(1);
    if (!template) {
      missing.push(`${kind.replaceAll("_", " ")} template`);
      continue;
    }
    const entities = input.kind === "scoa_audit" && kind === "liquidation"
      ? eventTargets.map((event) => ({ type: "event" as const, id: event.id, title: event.name }))
      : [{
        type: input.entityType,
        id: input.entityId,
        title: input.title,
        termStart: input.termStart,
        termEnd: input.termEnd,
      }];
    for (const entity of entities) {
      const result = await generate({ templateId: template.id, entity, askValues: input.askValues });
      if (!("file" in result) || !result.file || !result.generatedDoc) {
        missing.push(`${template.name}${result.missing?.length ? ` (${result.missing.map((entry) => entry.label).join(", ")})` : ""}`);
        continue;
      }
      generatedFileIds.push(result.file.id);
      generatedDocIds.push(result.generatedDoc.id);
      zip.file(result.file.originalName, await readFileBlob(await getDataDir(), result.file.sha256));
    }
  }
  if (input.kind === "post_event" && input.entityType === "event") {
    const attachmentCount = await addEventAttachments(zip, input.entityId, true);
    if (!attachmentCount.attendeeCount) missing.push("attendance CSV");
    if (!attachmentCount.photoCount) missing.push("event photos");
  }
  if (input.kind === "scoa_audit" && input.termStart && input.termEnd) {
    const receiptCount = await addTermReceipts(zip, input.termStart, input.termEnd);
    if (!receiptCount) missing.push("receipts");
  }
  zip.file("README.txt", missing.length
    ? `Included files were generated locally.\n\nUnavailable or unmapped items:\n${missing.map((item) => `- ${item}`).join("\n")}\n`
    : "All requested packet items were included.\n");
  const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  const sha256 = await storeFileBlob(await getDataDir(), bytes);
  const name = `${input.kind.replaceAll("_", " ")} packet${input.title ? ` - ${input.title}` : ""}.zip`;
  const [file] = await db.insert(files).values({
    sha256,
    originalName: name,
    mime: "application/zip",
    size: bytes.byteLength,
    kind: "generated",
    source: "org",
    tags: ["packet", input.kind],
  }).returning();
  if (!file) throw new Error("Could not save the packet.");
  await db.insert(fileLinks).values({
    fileId: file.id,
    entityType: input.entityType,
    entityId: input.entityId,
    role: "packet",
  });
  const { packets } = await import("@/lib/db/schema");
  const [packet] = await db.insert(packets).values({
    kind: input.kind,
    entityType: input.entityType,
    entityId: input.entityId,
    fileId: file.id,
  }).returning();
  if (packet && generatedDocIds.length) {
    await db.update(generatedDocs).set({ packetId: packet.id, updatedAt: new Date() })
      .where(inArray(generatedDocs.id, generatedDocIds));
  }
  return { packet, file, missing, generatedFileIds };
}
