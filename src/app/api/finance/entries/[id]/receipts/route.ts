import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { fileLinks, files, ledgerEntries, ledgerReceipts } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };
const receiptSchema = z.object({ fileId: z.string().uuid() });

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const { db } = await getDb();
  const rows = await db.select({ receipt: ledgerReceipts, file: files })
    .from(ledgerReceipts)
    .innerJoin(files, eq(files.id, ledgerReceipts.fileId))
    .where(and(
      eq(ledgerReceipts.entryId, id),
      isNull(ledgerReceipts.removedAt),
      isNull(files.deletedAt),
    ))
    .orderBy(desc(ledgerReceipts.addedAt));
  return NextResponse.json(rows.map(({ receipt, file }) => ({ ...receipt, file })));
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [entry] = await db.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.id, id)).limit(1);
  const [file] = await db.select({ id: files.id }).from(files).where(and(eq(files.id, parsed.data.fileId), isNull(files.deletedAt))).limit(1);
  if (!entry || !file) return NextResponse.json({ error: "Entry or receipt file not found." }, { status: 404 });
  const [receipt] = await db.insert(ledgerReceipts).values({ entryId: id, fileId: file.id })
    .onConflictDoUpdate({
      target: [ledgerReceipts.entryId, ledgerReceipts.fileId],
      set: { addedAt: now(), removedAt: null },
    }).returning();
  await db.insert(fileLinks).values({
    fileId: file.id, entityType: "ledger_entry", entityId: id, role: "receipt",
  }).onConflictDoUpdate({
    target: [fileLinks.fileId, fileLinks.entityType, fileLinks.entityId, fileLinks.role],
    set: { deletedAt: null, updatedAt: now() },
  });
  return NextResponse.json(receipt, { status: 201 });
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  const parsed = z.object({ receiptId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [receipt] = await db.update(ledgerReceipts).set({ removedAt: now() }).where(and(
    eq(ledgerReceipts.id, parsed.data.receiptId),
    eq(ledgerReceipts.entryId, id),
    isNull(ledgerReceipts.removedAt),
  )).returning();
  if (!receipt) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  await db.update(fileLinks).set({ deletedAt: now(), updatedAt: now() }).where(and(
    eq(fileLinks.fileId, receipt.fileId),
    eq(fileLinks.entityType, "ledger_entry"),
    eq(fileLinks.entityId, id),
    eq(fileLinks.role, "receipt"),
    isNull(fileLinks.deletedAt),
  ));
  return NextResponse.json(receipt);
}
