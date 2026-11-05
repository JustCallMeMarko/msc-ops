import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { financeAccountSchema } from "@/lib/finance/schemas";
import { isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = await getDb();
  const rows = await db.select().from(accounts).where(isNull(accounts.deletedAt)).orderBy(accounts.name);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const parsed = financeAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { db } = await getDb();
  const [row] = await db.insert(accounts).values({
    ...parsed.data,
    bankName: parsed.data.bankName ?? null,
    accountLast4: parsed.data.accountLast4 ?? null,
    openedAt: parsed.data.openedAt ?? null,
  }).returning();
  return NextResponse.json(row, { status: 201 });
}
