import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { providers } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/security/keystore";
import { invalidateProviderAllowlist } from "@/lib/net/safe-fetch";

const providerUrlSchema = z.string().url().refine(
  (value) => /^https?:\/\//i.test(value),
  "Provider URL must use HTTP or HTTPS.",
);

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: z.enum(["ollama", "lmstudio", "openai_compatible", "openai", "anthropic", "google", "openrouter", "groq"]).optional(),
  baseUrl: providerUrlSchema.optional(),
  apiKey: z.string().max(4096).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const changes: Partial<typeof providers.$inferInsert> = { ...input };
  delete (changes as { apiKey?: string }).apiKey;
  if (input.apiKey !== undefined) {
    changes.apiKeyEnc = input.apiKey ? await encryptSecret(input.apiKey) : null;
    changes.apiKeyLast4 = input.apiKey ? input.apiKey.slice(-4) : null;
  }
  changes.updatedAt = new Date();
  const { db } = await getDb();
  const [provider] = await db.update(providers).set(changes).where(eq(providers.id, id)).returning();
  if (!provider) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  invalidateProviderAllowlist();
  return NextResponse.json({
    id: provider.id, name: provider.name, type: provider.type, baseUrl: provider.baseUrl,
    hasKey: Boolean(provider.apiKeyEnc), keyLast4: provider.apiKeyLast4,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { db } = await getDb();
  const [provider] = await db.update(providers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(providers.id, id))
    .returning({ id: providers.id });
  if (!provider) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  invalidateProviderAllowlist();
  return NextResponse.json({ ok: true });
}
