import { createHash } from "node:crypto";
import { desc, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { now } from "@/lib/clock";
import type { DrizzleDb } from "@/lib/db/client";
import { ledgerEntries } from "@/lib/db/schema";
import type { FinanceCategory, FinanceKind } from "./constants";

export type LedgerHashRow = {
  id: string;
  seq: number;
  accountId: string;
  eventId: string | null;
  kind: FinanceKind;
  category: FinanceCategory;
  amountCentavos: number;
  occurredOn: string;
  counterparty: string;
  description: string;
  orNumber: string;
  approvedByMemberId: string | null;
  targetEntryId: string | null;
  replacesEntryId: string | null;
  reason: string;
  prevHash: string;
  hash: string;
  createdAt: Date | string;
};

type NewLedgerEntry = Omit<LedgerHashRow, "id" | "seq" | "prevHash" | "hash" | "createdAt"> & {
  id?: string;
  createdAt?: Date;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function canonicalLedgerFields(row: LedgerHashRow): Record<string, unknown> {
  return {
    id: row.id,
    seq: row.seq,
    accountId: row.accountId,
    eventId: row.eventId,
    kind: row.kind,
    category: row.category,
    amountCentavos: row.amountCentavos,
    occurredOn: row.occurredOn,
    counterparty: row.counterparty,
    description: row.description,
    orNumber: row.orNumber,
    approvedByMemberId: row.approvedByMemberId,
    targetEntryId: row.targetEntryId,
    replacesEntryId: row.replacesEntryId,
    reason: row.reason,
    prevHash: row.prevHash,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
  };
}

export function hashLedgerEntry(row: LedgerHashRow): string {
  return createHash("sha256")
    .update(row.prevHash + canonicalJson(canonicalLedgerFields(row)), "utf8")
    .digest("hex");
}

export function verifyLedgerChain(rows: readonly LedgerHashRow[]): { ok: true } | { ok: false; brokenAtSeq: number } {
  let previousHash = "";
  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    if (row.prevHash !== previousHash || row.hash !== hashLedgerEntry(row)) {
      return { ok: false, brokenAtSeq: row.seq };
    }
    previousHash = row.hash;
  }
  return { ok: true };
}

export async function appendLedgerEntries(db: DrizzleDb, inputs: readonly NewLedgerEntry[]) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE ledger_entries IN EXCLUSIVE MODE`);
    const insertedRows = [];
    for (const input of inputs) {
      const [previous] = await tx.select({ hash: ledgerEntries.hash })
        .from(ledgerEntries)
        .orderBy(desc(ledgerEntries.seq))
        .limit(1);
      const sequenceResult = await tx.execute(sql`SELECT nextval(pg_get_serial_sequence('ledger_entries', 'seq')) AS seq`);
      const seqValue = (sequenceResult as unknown as { rows: Array<{ seq: number | string }> }).rows[0]?.seq;
      const seq = Number(seqValue);
      if (!Number.isSafeInteger(seq)) throw new Error("Could not allocate a safe ledger sequence.");
      const row: LedgerHashRow = {
        ...input,
        id: input.id ?? uuidv7(),
        seq,
        prevHash: previous?.hash ?? "",
        hash: "",
        createdAt: input.createdAt ?? now(),
      };
      row.hash = hashLedgerEntry(row);
      const [inserted] = await tx.insert(ledgerEntries).values({
        ...row,
        createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      }).returning();
      insertedRows.push(inserted);
    }
    return insertedRows;
  });
}

export async function insertLedgerEntry(db: DrizzleDb, input: NewLedgerEntry) {
  const [entry] = await appendLedgerEntries(db, [input]);
  return entry;
}
