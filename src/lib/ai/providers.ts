import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { eq } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { getDb } from "@/lib/db/client";
import { providers } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/security/keystore";
import { EgressBlockedError, withPurpose } from "@/lib/net/safe-fetch";

import type { ProviderType } from "@/lib/ai/provider-types";

export { PROVIDER_TYPES, type ProviderType } from "@/lib/ai/provider-types";

type ProviderRecord = typeof providers.$inferSelect;

async function providerById(providerId: string): Promise<ProviderRecord> {
  const { db } = await getDb();
  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, providerId))
    .limit(1);
  if (!provider || provider.deletedAt) throw new Error("Provider not found.");
  return provider;
}

async function providerConfig(provider: ProviderRecord) {
  return {
    name: provider.name,
    baseURL: provider.baseUrl,
    apiKey: provider.apiKeyEnc ? await decryptSecret(provider.apiKeyEnc) : "local",
    fetch: withPurpose(`ai:${provider.type}`),
  };
}

export async function getLanguageModel(providerId: string, modelId: string): Promise<LanguageModel> {
  const provider = await providerById(providerId);
  const config = await providerConfig(provider);
  switch (provider.type as ProviderType) {
    case "anthropic":
      return createAnthropic(config)(modelId);
    case "google":
      return createGoogleGenerativeAI(config)(modelId);
    case "ollama":
      return createOpenAICompatible({
        ...config,
        name: provider.name,
        supportsStructuredOutputs: true,
      }).languageModel(modelId);
    case "openai_compatible":
      return createOpenAICompatible({ ...config, name: provider.name }).languageModel(modelId);
    default:
      return createOpenAI(config)(modelId);
  }
}

export async function getEmbeddingModel(providerId: string, modelId: string) {
  const provider = await providerById(providerId);
  const config = await providerConfig(provider);
  if (provider.type === "google") return createGoogleGenerativeAI(config).embeddingModel(modelId);
  if (provider.type === "anthropic") throw new Error("Anthropic does not provide an embedding model.");
  if (provider.type === "openai_compatible") {
    return createOpenAICompatible({ ...config, name: provider.name }).embeddingModel(modelId);
  }
  return createOpenAI(config).embeddingModel(modelId);
}

export type ModelOption = { id: string; label: string };

export async function listModels(providerId: string): Promise<ModelOption[]> {
  const provider = await providerById(providerId);
  const type = provider.type as ProviderType;
  const key = provider.apiKeyEnc ? await decryptSecret(provider.apiKeyEnc) : undefined;
  const base = provider.baseUrl.replace(/\/+$/, "");
  let response: Response;
  const url = type === "google"
    ? `${base}/models${key ? `?key=${encodeURIComponent(key)}` : ""}`
    : `${base}/models`;
  const headers: HeadersInit = {};
  if (key && type === "anthropic") {
    Object.assign(headers, { "x-api-key": key, "anthropic-version": "2023-06-01" });
  } else if (key) {
    Object.assign(headers, { Authorization: `Bearer ${key}` });
  }
  try {
    response = await withPurpose("provider-model-list")(url, { headers });
  } catch (error) {
    if (type === "ollama" && /ECONNREFUSED|fetch failed/i.test(error instanceof Error ? error.message : String(error))) {
      throw new Error("Ollama is not running. Start it and try again.", { cause: error });
    }
    throw error;
  }
  if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
  const payload = (await response.json()) as {
    data?: Array<{ id?: string; name?: string; type?: string; supported_generation_methods?: string[] }>;
    models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
  };
  if (type === "google") {
    return (payload.models ?? [])
      .filter((model) =>
        model.supportedGenerationMethods?.some((method) =>
          method === "generateContent" || method === "embedContent",
        ),
      )
      .map((model) => {
        const id = model.name?.replace(/^models\//, "") ?? "";
        return { id, label: model.displayName ?? id };
      })
      .filter((model) => model.id);
  }
  return (payload.data ?? [])
    .map((model) => {
      const id = model.id ?? model.name ?? "";
      return { id, label: model.name ?? id };
    })
    .filter((model) => model.id);
}

export function mapProviderError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof EgressBlockedError || message.includes("EgressBlockedError")) {
    return { code: "egress_blocked", message: "Blocked by Offline mode. Turn it off in Settings → Privacy." };
  }
  if (/ollama.*not running/i.test(message)) {
    return { code: "ollama_not_running", message: "Ollama isn't running. Start it or choose another provider." };
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)) {
    return { code: "network_unreachable", message: "Provider is unreachable. Check the connection and provider URL." };
  }
  const status = message.match(/\b(401|403|404|429)\b/)?.[1];
  if (status === "401" || status === "403") return { code: "bad_key", message: "Authentication failed. Check the API key." };
  if (status === "429") return { code: "rate_limited", message: "Provider rate limit reached. Try again shortly." };
  if (status === "404" && /ollama|model/i.test(message)) {
    return { code: "model_missing", message: "Model not found. Pull the model or choose another one." };
  }
  return { code: "provider_error", message: "Could not connect to the provider. Check its settings and try again." };
}
