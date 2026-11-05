import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { ledgerEntries } from "@/lib/db/schema";
import { verifyLedgerChain } from "@/lib/finance/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = await getDb();
  const entries = await db.select().from(ledgerEntries).orderBy(ledgerEntries.seq);
  return NextResponse.json(verifyLedgerChain(entries));
}
