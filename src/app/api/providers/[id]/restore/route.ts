import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { providers } from "@/lib/db/schema";
import { invalidateProviderAllowlist } from "@/lib/net/safe-fetch";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [provider] = await db.update(providers)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(providers.id, id))
    .returning({ id: providers.id });
  if (!provider) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  invalidateProviderAllowlist();
  return NextResponse.json({ ok: true });
}
