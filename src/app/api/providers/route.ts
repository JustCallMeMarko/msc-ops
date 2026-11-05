import { NextResponse } from "next/server";
import { z } from "zod";
import { isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { providers } from "@/lib/db/schema";
import { PROVIDER_TYPES, type ProviderType } from "@/lib/ai/providers";
import { encryptSecret } from "@/lib/security/keystore";
import { invalidateProviderAllowlist } from "@/lib/net/safe-fetch";

export const dynamic = "force-dynamic";

const providerUrlSchema = z.string().url().refine(
  (value) => /^https?:\/\//i.test(value),
  "Provider URL must use HTTP or HTTPS.",
);

const createProviderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["ollama", "lmstudio", "openai_compatible", "openai", "anthropic", "google", "openrouter", "groq"]),
  baseUrl: providerUrlSchema,
  apiKey: z.string().max(4096).optional(),
});

function serializeProvider(provider: typeof providers.$inferSelect) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    hasKey: Boolean(provider.apiKeyEnc),
    keyLast4: provider.apiKeyLast4,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

export async function GET() {
  const { db } = await getDb();
  const rows = await db.select().from(providers).where(isNull(providers.deletedAt));
  return NextResponse.json(rows.map(serializeProvider));
}

export async function POST(request: Request) {
  const parsed = createProviderSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if (PROVIDER_TYPES[input.type as ProviderType].needsKey && !input.apiKey) {
    return NextResponse.json({ error: "An API key is required for this provider." }, { status: 400 });
  }
  const { db } = await getDb();
  const [provider] = await db.insert(providers).values({
    name: input.name,
    type: input.type,
    baseUrl: input.baseUrl,
    apiKeyEnc: input.apiKey ? await encryptSecret(input.apiKey) : null,
    apiKeyLast4: input.apiKey ? input.apiKey.slice(-4) : null,
  }).returning();
  invalidateProviderAllowlist();
  return NextResponse.json(serializeProvider(provider), { status: 201 });
}
