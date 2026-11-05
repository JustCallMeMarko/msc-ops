import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { accounts, ledgerEntries, reconciliations } from "@/lib/db/schema";
import { accountBalances, effectiveEntries } from "@/lib/finance/logic";
import { reconciliationSchema } from "@/lib/finance/schemas";

export const dynamic = "force-dynamic";

const previewSchema = z.object({ accountId: z.string().uuid(), statementDate: z.string().date() });

export async function GET(request: Request) {
  const { db } = await getDb();
  const params = new URL(request.url).searchParams;
  const accountId = params.get("accountId");
  const statementDate = params.get("statementDate");
  if (accountId || statementDate) {
    const parsed = previewSchema.safeParse({ accountId, statementDate });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.accountId, parsed.data.accountId));
    const balance = accountBalances(effectiveEntries(rows).filter((entry) => entry.occurredOn <= parsed.data.statementDate));
    return NextResponse.json({ computedBalanceCentavos: balance[parsed.data.accountId] ?? 0 });
  }
  const rows = await db.select({ reconciliation: reconciliations, account: accounts })
    .from(reconciliations).innerJoin(accounts, eq(accounts.id, reconciliations.accountId))
    .where(isNull(reconciliations.deletedAt)).orderBy(reconciliations.statementDate);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const parsed = reconciliationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [account] = await db.select().from(accounts).where(and(
    eq(accounts.id, parsed.data.accountId), isNull(accounts.archivedAt), isNull(accounts.deletedAt),
  )).limit(1);
  if (!account) return NextResponse.json({ error: "Active account not found." }, { status: 404 });
  const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.accountId, account.id));
  const balance = accountBalances(effectiveEntries(rows).filter((entry) => entry.occurredOn <= parsed.data.statementDate));
  const [row] = await db.insert(reconciliations).values({
    ...parsed.data,
    computedBalanceCentavos: balance[account.id] ?? 0,
  }).returning();
  return NextResponse.json(row, { status: 201 });
}
